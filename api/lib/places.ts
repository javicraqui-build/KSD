import { SupabaseClient } from '@supabase/supabase-js'

// ──────────────────────────────────────────────────────────────────────
// Google Places (New) helpers — shared between endpoints
// ──────────────────────────────────────────────────────────────────────

export type PlaceMatch = {
  name: string
  rating: number | null
  reviews: number | null
  googleMapsUri: string | null
  photoName: string | null
  placeId: string
  primaryType: string | null
  types: string[]
}

const BAD_TYPES = new Set([
  'locality', 'sublocality', 'sublocality_level_1', 'sublocality_level_2',
  'neighborhood', 'administrative_area_level_1', 'administrative_area_level_2',
  'country', 'postal_code', 'political', 'route', 'street_address',
])

export async function placesTextSearch(
  query: string,
  apiKey: string,
  opts: { strict?: boolean } = {}
): Promise<PlaceMatch | null> {
  const { strict = true } = opts
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.photos,places.primaryType,places.types',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 3, languageCode: 'es' }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error(`[Places] ${res.status} for "${query}": ${errText.slice(0, 300)}`)
      return null
    }
    const data = await res.json()
    const places = (data.places || []) as any[]
    if (!places.length) return null

    // strict=true: filter out locality/neighborhood/country (for gastronomía/actividades)
    // strict=false: accept anything (for destination hero — country/city photos are fine)
    const good = strict
      ? places.find((p) => {
          const type = p.primaryType || ''
          const types = p.types || []
          if (BAD_TYPES.has(type)) return false
          if (types.some((t: string) => BAD_TYPES.has(t))) return false
          return true
        })
      : places[0]
    if (!good) return null

    return {
      name: good.displayName?.text || '',
      rating: typeof good.rating === 'number' ? good.rating : null,
      reviews: typeof good.userRatingCount === 'number' ? good.userRatingCount : null,
      googleMapsUri: good.googleMapsUri || null,
      photoName: good.photos?.[0]?.name || null,
      placeId: good.id || '',
      primaryType: good.primaryType || null,
      types: good.types || [],
    }
  } catch (e: any) {
    console.error(`[Places] fetch threw for "${query}":`, e.message)
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────
// Photo download + upload to Supabase Storage
// ──────────────────────────────────────────────────────────────────────

export async function fetchAndStorePhoto(
  photoName: string,
  placeId: string,
  apiKey: string,
  supaAdmin: SupabaseClient
): Promise<string | null> {
  try {
    const photoApiUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1600&skipHttpRedirect=true&key=${apiKey}`
    const metaRes = await fetch(photoApiUrl)
    if (!metaRes.ok) {
      console.error(`[Photo] meta ${metaRes.status} for ${placeId}`)
      return null
    }
    const meta = await metaRes.json()
    const photoUri = meta.photoUri
    if (!photoUri) {
      console.error(`[Photo] no photoUri for ${placeId}`)
      return null
    }

    const imgRes = await fetch(photoUri)
    if (!imgRes.ok) {
      console.error(`[Photo] download ${imgRes.status} for ${placeId}`)
      return null
    }
    const buf = new Uint8Array(await imgRes.arrayBuffer())
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'

    const filename = `${placeId}.${ext}`
    const { error: upErr } = await supaAdmin.storage.from('place-photos').upload(filename, buf, {
      contentType,
      upsert: true,
      cacheControl: '2592000',
    })
    if (upErr) {
      console.error(`[Photo] upload failed for ${placeId}: ${upErr.message}`)
      return null
    }

    const { data: pub } = supaAdmin.storage.from('place-photos').getPublicUrl(filename)
    return pub.publicUrl || null
  } catch (e: any) {
    console.error(`[Photo] threw for ${placeId}:`, e.message)
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────
// Hero image for the whole trip: Places search of destination
// ──────────────────────────────────────────────────────────────────────

export async function fetchDestinationHero(
  destino: string,
  pais: string | null,
  apiKey: string,
  supaAdmin: SupabaseClient
): Promise<string | null> {
  const query = pais && !destino.toLowerCase().includes(pais.toLowerCase())
    ? `${destino} ${pais}`
    : destino

  const match = await placesTextSearch(query, apiKey, { strict: false })
  if (!match) {
    console.warn(`[Hero] Places returned no match for destino "${query}"`)
    return null
  }
  if (!match.photoName || !match.placeId) {
    console.warn(`[Hero] Places match for "${query}" has no photo`)
    return null
  }

  const url = await fetchAndStorePhoto(match.photoName, `hero-${match.placeId}`, apiKey, supaAdmin)
  if (!url) {
    console.warn(`[Hero] Photo download failed for "${query}"`)
    return null
  }
  console.log(`[Hero] ${destino} → ${match.name} (${match.primaryType})`)
  return url
}
