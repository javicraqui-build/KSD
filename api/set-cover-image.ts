import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
}

// ──────────────────────────────────────────────────────────────────────
// Google Places (New) — helpers inline (no imports cruzados)
// ──────────────────────────────────────────────────────────────────────

const BAD_TYPES = new Set([
  'locality', 'sublocality', 'sublocality_level_1', 'sublocality_level_2',
  'neighborhood', 'administrative_area_level_1', 'administrative_area_level_2',
  'country', 'postal_code', 'political', 'route', 'street_address',
])

type PlaceMatch = {
  name: string
  rating: number | null
  reviews: number | null
  googleMapsUri: string | null
  photoName: string | null
  placeId: string
  primaryType: string | null
  types: string[]
}

async function placesTextSearch(
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

async function fetchAndStorePhoto(
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

async function fetchDestinationHero(
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

// ──────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase env vars no configuradas' })
  }

  const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!PLACES_KEY || !SERVICE_KEY) {
    console.warn('[set-cover-image] GOOGLE_PLACES_API_KEY o SUPABASE_SERVICE_ROLE_KEY faltantes')
    return res.status(200).json({ success: false, reason: 'missing-env', cover_img: null })
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    const token = authHeader.slice(7)

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const supaAdmin = createClient(process.env.VITE_SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized (invalid token)' })

    const { data: allowed, error: allowErr } = await supabase.rpc('is_ksd_user')
    if (allowErr) return res.status(500).json({ error: 'Error checking allowlist', detail: allowErr.message })
    if (!allowed) return res.status(403).json({ error: 'Forbidden (not in allowlist)' })

    const viaje_id = req.body?.viaje_id
    if (!viaje_id) return res.status(400).json({ error: 'viaje_id required' })

    const { data: viaje, error: vErr } = await supabase
      .from('viajes')
      .select('id, destino, pais, cover_img')
      .eq('id', viaje_id)
      .single()
    if (vErr || !viaje) return res.status(404).json({ error: 'Viaje not found', detail: vErr?.message })

    // Idempotencia: si ya tiene cover del bucket, no la volvemos a buscar
    if (viaje.cover_img && viaje.cover_img.includes('/storage/v1/object/public/place-photos/')) {
      return res.status(200).json({ success: true, cover_img: viaje.cover_img, skipped: true })
    }

    const heroUrl = await fetchDestinationHero(viaje.destino, viaje.pais, PLACES_KEY, supaAdmin)

    if (!heroUrl) {
      return res.status(200).json({ success: false, cover_img: null, reason: 'no-match' })
    }

    const { error: upErr } = await supabase
      .from('viajes')
      .update({ cover_img: heroUrl })
      .eq('id', viaje_id)
    if (upErr) {
      console.error('[set-cover-image] update failed:', upErr.message)
      return res.status(500).json({ error: 'Error actualizando viaje', detail: upErr.message })
    }

    return res.status(200).json({ success: true, cover_img: heroUrl })
  } catch (err: any) {
    console.error('[set-cover-image] unexpected:', err)
    return res.status(500).json({
      error: 'Error inesperado',
      detail: err.message || String(err),
    })
  }
}
