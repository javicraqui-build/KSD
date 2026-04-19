import { createClient } from '@supabase/supabase-js'
import { fetchDestinationHero } from './_lib/places'

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
}

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
    // Graceful: si faltan env vars, devolvemos 200 con hero=null; no es error.
    // Así no bloquea la creación de viajes.
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

    // Fetch viaje
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

    // Fetch hero from Places + upload to bucket
    const heroUrl = await fetchDestinationHero(viaje.destino, viaje.pais, PLACES_KEY, supaAdmin)

    if (!heroUrl) {
      return res.status(200).json({ success: false, cover_img: null, reason: 'no-match' })
    }

    // Update viaje with new cover_img
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
