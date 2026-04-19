import Anthropic from '@anthropic-ai/sdk'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  placesTextSearch,
  fetchAndStorePhoto,
} from './_lib/places'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'

const SYSTEM = `Sos un concierge de viajes con sensibilidad editorial — voz cálida, específica, evocadora. Tu output es SIEMPRE un JSON válido sin texto adicional, sin markdown fences, sin explicaciones.

Sos un modelo de lenguaje, NO una base de datos en tiempo real de vuelos, hoteles o restaurantes. Tu trabajo es CURAR EL ESTILO del viaje y guiar al usuario a búsquedas reales via deeplinks. NUNCA inventes nombres específicos que suenan plausibles pero no existen. Si no tenés 100% de certeza de que algo existe con un nombre exacto, usá un nombre DESCRIPTIVO del perfil y dejá campos factuales (rating, número de vuelo) en null.

RESPETÁ LOS TIPOS DE DATO EXACTAMENTE como indica el schema. Si un campo es número, devolvé número o null — NUNCA texto. Si un campo es array de strings, devolvé array — NUNCA string concatenado. Confundir tipos rompe la inserción en DB.`

// ──────────────────────────────────────────────────────────────────────
// Sanitización de tipos
// ──────────────────────────────────────────────────────────────────────

type FieldType = 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'array'

function coerce(value: any, type: FieldType): any {
  switch (type) {
    case 'string':
      if (typeof value === 'string') return value
      if (value == null) return null
      return String(value)
    case 'integer':
      if (typeof value === 'number' && isFinite(value)) return Math.round(value)
      if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value, 10)
      return null
    case 'number':
      if (typeof value === 'number' && isFinite(value)) return value
      if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return parseFloat(value)
      return null
    case 'boolean':
      if (typeof value === 'boolean') return value
      if (value === 'true') return true
      if (value === 'false') return false
      return null
    case 'date':
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
      return null
    case 'array':
      if (Array.isArray(value)) return value.filter((v) => typeof v === 'string')
      if (typeof value === 'string' && value.trim()) return [value]
      return []
  }
}

const SCHEMAS: Record<string, Record<string, FieldType>> = {
  transporte: {
    tipo: 'string', compania: 'string', numero_ida: 'string', numero_vuelta: 'string',
    origen: 'string', destino: 'string', fecha_ida: 'date', hora_ida_salida: 'string',
    hora_ida_llegada: 'string', fecha_vuelta: 'date', hora_vuelta_salida: 'string',
    hora_vuelta_llegada: 'string', precio: 'number', duracion: 'string',
    highlights: 'array', deeplink: 'string', seleccionado: 'boolean',
  },
  alojamientos: {
    plataforma: 'string', nombre: 'string', barrio: 'string', tipo: 'string',
    precio_noche: 'number', rating: 'number', reviews: 'integer',
    highlights: 'array', img: 'string', deeplink: 'string', seleccionado: 'boolean',
  },
  actividades: {
    nombre: 'string', tipo: 'string', dia: 'integer', duracion: 'string', precio: 'number',
    descripcion: 'string', plataforma: 'string', img: 'string', deeplink: 'string', seleccionado: 'boolean',
  },
  gastronomia: {
    nombre: 'string', tipo_cocina: 'string', barrio: 'string', precio_rango: 'string',
    rating: 'number', dia_sugerido: 'integer', descripcion: 'string', img: 'string',
    deeplink: 'string', seleccionado: 'boolean',
  },
}

function sanitize(item: any, schema: Record<string, FieldType>): any {
  const out: any = {}
  for (const [key, type] of Object.entries(schema)) {
    out[key] = coerce(item?.[key], type as FieldType)
  }
  return out
}

function sanitizeArray(items: any, table: keyof typeof SCHEMAS): any[] {
  if (!Array.isArray(items)) return []
  return items.map((it) => sanitize(it, SCHEMAS[table]))
}

// ──────────────────────────────────────────────────────────────────────
// Prompt builder
// ──────────────────────────────────────────────────────────────────────

function buildPrompt(viaje: any, personas: any[]): string {
  const noches = Math.max(
    1,
    Math.round(
      (new Date(viaje.fecha_fin).getTime() - new Date(viaje.fecha_inicio).getTime()) / 86400000
    )
  )

  const origen = viaje.origen || 'Madrid'

  const personasDesc = personas
    .map((p) => {
      const intereses = Array.isArray(p.intereses) ? p.intereses.join(', ') : ''
      const estilo = Array.isArray(p.estilo) ? p.estilo.join(', ') : ''
      const dietas = Array.isArray(p.dietas)
        ? p.dietas.filter((d: string) => d !== 'Ninguna').join(', ')
        : ''
      return `- ${p.nombre}: intereses (${intereses}); estilo (${estilo}); ritmo ${p.ritmo}${
        dietas ? `; dietas: ${dietas}` : ''
      }${p.notas ? `; notas personales: ${p.notas}` : ''}`
    })
    .join('\n')

  const intencionBlock = viaje.intencion
    ? `\n\nCONTEXTO ESPECÍFICO DE ESTE VIAJE (importantísimo, tomalo muy en cuenta al diseñar la propuesta):\n"${viaje.intencion}"\n`
    : ''

  return `Armá una propuesta de viaje completa para:

ORIGEN: ${origen}
DESTINO: ${viaje.destino}${viaje.pais ? `, ${viaje.pais}` : ''}
FECHAS: ${viaje.fecha_inicio} al ${viaje.fecha_fin} (${noches} noches)
PRESUPUESTO TOTAL ORIENTATIVO: ${viaje.presupuesto_total}€
VIAJEROS (${personas.length} personas):
${personasDesc}${intencionBlock}

═══════════════════════════════════════════════════════════
REGLAS DE HONESTIDAD (CRÍTICAS)
═══════════════════════════════════════════════════════════

No sabés horarios reales del día de hoy, ni números de vuelo actuales, ni inventarios específicos de hoteles/restaurantes. Importante: los nombres de restaurantes y actividades que devuelvas van a ser ENRIQUECIDOS DESPUÉS con Google Places — o sea, tu trabajo es darme el MEJOR QUERY DE BÚSQUEDA posible. Un query preciso y descriptivo te devuelve un lugar real que matchea el perfil. Un nombre inventado específico no matchea con nada.

1) TRANSPORTE (vuelos):
   • numero_ida y numero_vuelta: SIEMPRE null.
   • compania: aerolíneas TÍPICAS DE LA RUTA (${origen}→${viaje.destino}).
   • horarios: estimativos realistas.
   • precio: promedio razonable para esa ruta y temporada.
   • duracion: duración real del vuelo directo.

2) ALOJAMIENTO:
   OPCIÓN A (icónico): hoteles específicos y verificables (Memmo Alfama, Belmond Reid's Palace): nombre real + rating/reviews reales.
   OPCIÓN B (descriptivo): nombre perfil ("Apartamento boutique en Alfama con vista al Tajo"), rating=null, reviews=null.
   Si dudás → opción B.

3) GASTRONOMÍA (ESTOS SE ENRIQUECEN CON GOOGLE PLACES):
   OPCIÓN A (icónico verificable): nombre real del lugar famoso (Cervejaria Ramiro, Casa Lucio). Google lo va a encontrar y te va a dar datos reales.
   OPCIÓN B (perfil descriptivo): query de búsqueda que describa un tipo de lugar real. Claves:
      - Combiná TIPO + BARRIO/CIUDAD
      - Sé específico, no genérico
      - Usá vocabulario que use Google Maps ("tasca", "marisquería", "pastelería")
      Ejemplos que funcionan bien como search:
       - "Tasca tradicional con fado en Alfama"
       - "Marisquería Cascais"
       - "Pastelería histórica Belém"
       - "Rooftop bar con vista al Tajo"
       - "Ginjinha tradicional Rossio"
   NUNCA inventes un nombre propio que no existe (ej. "Restaurante Azul del Tajo").

4) ACTIVIDADES (ESTAS TAMBIÉN SE ENRIQUECEN CON GOOGLE PLACES cuando sea un LUGAR FÍSICO):
   OPCIÓN A (lugar físico concreto): museos, monumentos, miradores, parques, barrios. Google los encuentra.
      Ejemplos: "Castelo de São Jorge", "Torre de Belém", "Museu Nacional do Azulejo", "Mirador de Santa Catarina", "Oceanário de Lisboa"
   OPCIÓN B (tour/experiencia guiada/paseo): describí el tipo, NO se enriquece con Places.
      Ejemplos: "Free walking tour por Alfama al atardecer", "Tour de fado por tascas", "Clase de pastéis de nata"

═══════════════════════════════════════════════════════════
TIPOS DE DATO — RESPETAR EXACTAMENTE
═══════════════════════════════════════════════════════════

- Campos de TEXTO: string o null.
- Campos NUMÉRICOS con decimales (rating, precio, precio_noche): number o null. NUNCA texto.
- Campos NUMÉRICOS enteros (reviews, dia, dia_sugerido): integer o null. NUNCA texto descriptivo.
- Campos ARRAY (highlights): array de strings. NUNCA string concatenado.
- Campos DATE (fecha_ida, fecha_vuelta): string "YYYY-MM-DD".
- Campos BOOLEAN (seleccionado): true o false.

⚠️ ERROR A EVITAR: reviews=1247 ✅    reviews="muy bueno" ❌    reviews=null ✅

═══════════════════════════════════════════════════════════
EJEMPLOS DE ITEMS
═══════════════════════════════════════════════════════════

Alojamiento OPCIÓN A (icónico):
{
  "plataforma": "Booking",
  "nombre": "Memmo Alfama",
  "barrio": "Alfama",
  "tipo": "Hotel boutique",
  "precio_noche": 215,
  "rating": 8.8,
  "reviews": 1247,
  "highlights": ["Rooftop con vistas al Tajo", "Piscina infinita", "Desayuno portugués incluido"],
  "img": "https://images.unsplash.com/photo-...",
  "deeplink": "https://www.booking.com/searchresults.html?ss=Memmo+Alfama+Lisboa&checkin=${viaje.fecha_inicio}&checkout=${viaje.fecha_fin}&group_adults=${personas.length}",
  "seleccionado": true
}

Alojamiento OPCIÓN B (descriptivo):
{
  "plataforma": "Airbnb",
  "nombre": "Apartamento boutique en Alfama con vista al Tajo",
  "barrio": "Alfama",
  "tipo": "Apartamento entero",
  "precio_noche": 140,
  "rating": null,
  "reviews": null,
  "highlights": ["Azulejos originales", "Terraza privada", "5 min a pie del Castelo"],
  "img": "https://images.unsplash.com/photo-...",
  "deeplink": "https://www.airbnb.com/s/Lisboa--Alfama/homes?checkin=${viaje.fecha_inicio}&checkout=${viaje.fecha_fin}&adults=${personas.length}",
  "seleccionado": false
}

Gastronomía (shape, el backend enriquece con Places):
{
  "nombre": "Cervejaria Ramiro",
  "tipo_cocina": "Marisquería portuguesa",
  "barrio": "Anjos",
  "precio_rango": "€€€",
  "rating": null,
  "dia_sugerido": 2,
  "descripcion": "Templo del marisco desde 1956. El camarón a la plancha y el sandwich prego son rito obligatorio.",
  "img": "https://images.unsplash.com/photo-...",
  "deeplink": "https://www.google.com/maps/search/?api=1&query=Cervejaria+Ramiro+Lisboa",
  "seleccionado": true
}

Actividad:
{
  "nombre": "Castelo de São Jorge",
  "tipo": "Monumento",
  "dia": 1,
  "duracion": "2-3h",
  "precio": 15,
  "descripcion": "Fortaleza moura del siglo XI con vistas panorámicas de Lisboa desde sus murallas.",
  "plataforma": "Entrada oficial",
  "img": "https://images.unsplash.com/photo-...",
  "deeplink": "https://www.google.com/maps/search/?api=1&query=Castelo+Sao+Jorge+Lisboa",
  "seleccionado": true
}

═══════════════════════════════════════════════════════════
ESTRUCTURA DE SALIDA (JSON completo)
═══════════════════════════════════════════════════════════

{
  "descripcion_corta": "Frase evocadora 40-80 chars",
  "descripcion_larga": "Párrafo editorial 200-350 chars",
  "transporte": [ /* 3 items */ ],
  "alojamientos": [ /* 3 items */ ],
  "actividades": [ /* 6 items en ${noches} días */ ],
  "gastronomia": [ /* 6 items */ ]
}

Schema transporte:
{
  "tipo": "vuelo",
  "compania": "TAP Air Portugal",
  "numero_ida": null, "numero_vuelta": null,
  "origen": "IATA 3 letras de ${origen}", "destino": "IATA 3 letras",
  "fecha_ida": "${viaje.fecha_inicio}", "hora_ida_salida": "10:15", "hora_ida_llegada": "10:45",
  "fecha_vuelta": "${viaje.fecha_fin}", "hora_vuelta_salida": "18:30", "hora_vuelta_llegada": "21:00",
  "precio": 284, "duracion": "2h 30m",
  "highlights": ["Vuelo directo", "Equipaje de mano", "Horarios orientativos"],
  "deeplink": "URL Skyscanner con params",
  "seleccionado": true
}

═══════════════════════════════════════════════════════════
DEEPLINKS (fallback si Places no enriquece)
═══════════════════════════════════════════════════════════

VUELOS → https://www.skyscanner.net/transport/flights/{iata_o}/{iata_d}/{YYMMDD_i}/{YYMMDD_v}/?adults={n}
BOOKING → https://www.booking.com/searchresults.html?ss={query}&checkin={YYYY-MM-DD}&checkout={YYYY-MM-DD}&group_adults={n}
AIRBNB → https://www.airbnb.com/s/{ciudad--barrio}/homes?checkin={YYYY-MM-DD}&checkout={YYYY-MM-DD}&adults={n}
CIVITATIS → https://www.civitatis.com/es/{ciudad}/?q={busqueda}
GETYOURGUIDE → https://www.getyourguide.com/s/?q={busqueda+ciudad}
RESTAURANTES → https://www.google.com/maps/search/?api=1&query={nombre+ciudad}
LUGARES FÍSICOS → https://www.google.com/maps/search/?api=1&query={nombre+ciudad}

Skyscanner YYMMDD (6 dígitos), resto YYYY-MM-DD. Espacios → +.

═══════════════════════════════════════════════════════════
FORMATO Y TONO
═══════════════════════════════════════════════════════════

- SOLO el JSON. Sin "Aquí tienes:", sin markdown fences. Empezá con { y terminá con }.
- 3 transportes · 3 alojamientos · 6 actividades · 6 gastronomía.
- 1 seleccionado=true por sección (alojamiento/transporte), 5 de 6 en actividades/gastronomía.
- Voz cálida, editorial, específica. Un plato icónico > "buena comida".
- Precios realistas en €.
- Castellano neutro.${viaje.intencion ? '\n- AJUSTÁ todas las recomendaciones al CONTEXTO ESPECÍFICO del viaje.' : ''}`
}

function extractJson(text: string): any {
  const attempts: Array<() => any> = [
    () => JSON.parse(text.trim()),
    () => JSON.parse(text.replace(/```json\s*|```\s*/g, '').trim()),
    () => {
      const first = text.indexOf('{')
      const last = text.lastIndexOf('}')
      if (first < 0 || last <= first) throw new Error('no braces found')
      return JSON.parse(text.slice(first, last + 1))
    },
  ]
  let lastErr: Error | null = null
  for (const attempt of attempts) {
    try { return attempt() } catch (e: any) { lastErr = e }
  }
  throw lastErr || new Error('Unknown parse error')
}

// ──────────────────────────────────────────────────────────────────────
// Enrichment orchestration (gastronomía + actividades)
// ──────────────────────────────────────────────────────────────────────

type EnrichableItem = {
  nombre: string | null
  rating?: number | null
  img: string | null
  deeplink: string | null
  [k: string]: any
}

async function enrichItems(
  items: EnrichableItem[],
  city: string,
  kind: 'gastronomia' | 'actividad',
  apiKey: string,
  supaAdmin: SupabaseClient
): Promise<{ enriched: number; photoed: number }> {
  let enriched = 0
  let photoed = 0

  const matches = await Promise.all(
    items.map(async (item) => {
      if (!item.nombre) return null
      const query = `${item.nombre} ${city}`
      return await placesTextSearch(query, apiKey)
    })
  )

  await Promise.all(
    items.map(async (item, i) => {
      const match = matches[i]
      if (!match) return

      item.nombre = match.name || item.nombre
      if (kind === 'gastronomia' && match.rating != null) {
        item.rating = match.rating
      }
      if (match.googleMapsUri) {
        item.deeplink = match.googleMapsUri
      }
      enriched++

      if (match.photoName && match.placeId) {
        const photoUrl = await fetchAndStorePhoto(match.photoName, match.placeId, apiKey, supaAdmin)
        if (photoUrl) {
          item.img = photoUrl
          photoed++
        }
      }
    })
  )

  return { enriched, photoed }
}

// ──────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' })
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase env vars no configuradas' })
  }

  const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const placesEnabled = !!PLACES_KEY && !!SERVICE_KEY

  if (!placesEnabled) {
    console.warn('[Places] GOOGLE_PLACES_API_KEY o SUPABASE_SERVICE_ROLE_KEY faltantes — enrichment deshabilitado')
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

    const supaAdmin = SERVICE_KEY
      ? createClient(process.env.VITE_SUPABASE_URL, SERVICE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized (invalid token)' })

    const { data: allowed, error: allowErr } = await supabase.rpc('is_ksd_user')
    if (allowErr) return res.status(500).json({ error: 'Error checking allowlist', detail: allowErr.message })
    if (!allowed) return res.status(403).json({ error: 'Forbidden (not in allowlist)' })

    const body = req.body
    const viaje_id = body?.viaje_id
    if (!viaje_id) return res.status(400).json({ error: 'viaje_id required' })

    const { data: viaje, error: vErr } = await supabase
      .from('viajes')
      .select('*, viajeros(personas(*))')
      .eq('id', viaje_id)
      .single()
    if (vErr || !viaje) return res.status(404).json({ error: 'Viaje not found', detail: vErr?.message })

    const personas = (viaje.viajeros as any[]).map((v: any) => v.personas).filter(Boolean)
    if (personas.length === 0) return res.status(400).json({ error: 'El viaje no tiene viajeros asignados' })

    // ─── Call Claude ────────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    let msg
    try {
      msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildPrompt(viaje, personas) }],
      })
    } catch (apiErr: any) {
      console.error('Anthropic API error:', apiErr)
      return res.status(502).json({
        error: 'Anthropic API error',
        detail: apiErr.message || String(apiErr),
        status: apiErr.status,
        model_used: MODEL,
      })
    }

    const textBlock = msg.content.find((c: any) => c.type === 'text') as any
    if (!textBlock?.text) {
      return res.status(500).json({ error: 'Claude returned no text', raw: JSON.stringify(msg).slice(0, 500) })
    }

    let json: any
    try {
      json = extractJson(textBlock.text)
    } catch (e: any) {
      console.error('JSON parse failed. Raw:', textBlock.text.slice(0, 2000))
      return res.status(500).json({ error: 'AI response malformed', detail: e.message, raw: textBlock.text.slice(0, 800) })
    }

    const noches = Math.max(
      1,
      Math.round(
        (new Date(viaje.fecha_fin).getTime() - new Date(viaje.fecha_inicio).getTime()) / 86400000
      )
    )

    // ─── Enrich gastronomía + actividades with Google Places ────────
    // (Hero image is handled by set-cover-image endpoint on viaje creation)
    let enrichmentSummary = ''
    if (placesEnabled && supaAdmin) {
      const city = viaje.destino
      try {
        const [gastroResult, actResult] = await Promise.all([
          Array.isArray(json.gastronomia)
            ? enrichItems(json.gastronomia, city, 'gastronomia', PLACES_KEY!, supaAdmin)
            : { enriched: 0, photoed: 0 },
          Array.isArray(json.actividades)
            ? enrichItems(json.actividades, city, 'actividad', PLACES_KEY!, supaAdmin)
            : { enriched: 0, photoed: 0 },
        ])
        enrichmentSummary = `gastro ${gastroResult.enriched}/6 matched, ${gastroResult.photoed} photos; actividades ${actResult.enriched}/6 matched, ${actResult.photoed} photos`
        console.log(`[Enrichment] ${enrichmentSummary}`)
      } catch (e: any) {
        console.error('[Enrichment] unexpected error (continuing without it):', e.message)
      }
    }

    // ─── Sanitize ───────────────────────────────────────────────────
    const transporteRows = sanitizeArray(json.transporte, 'transporte').map((t) => ({ ...t, viaje_id }))
    const alojamientosRows = sanitizeArray(json.alojamientos, 'alojamientos').map((a) => ({ ...a, viaje_id, noches }))
    const actividadesRows = sanitizeArray(json.actividades, 'actividades').map((a) => ({ ...a, viaje_id }))
    const gastronomiaRows = sanitizeArray(json.gastronomia, 'gastronomia').map((g) => ({ ...g, viaje_id }))

    // ─── Clear existing children ────────────────────────────────────
    await Promise.all([
      supabase.from('transporte').delete().eq('viaje_id', viaje_id),
      supabase.from('alojamientos').delete().eq('viaje_id', viaje_id),
      supabase.from('actividades').delete().eq('viaje_id', viaje_id),
      supabase.from('gastronomia').delete().eq('viaje_id', viaje_id),
    ])

    // ─── Insert ─────────────────────────────────────────────────────
    const results: Record<string, { ok: boolean; error?: string; sample?: string }> = {}
    const doInsert = async (
      table: 'transporte' | 'alojamientos' | 'actividades' | 'gastronomia',
      rows: any[]
    ) => {
      if (!rows.length) { results[table] = { ok: true }; return }
      const { error } = await supabase.from(table).insert(rows)
      if (error) {
        const sample = JSON.stringify(rows[0]).slice(0, 600)
        console.error(`[${table}] insert failed: ${error.message} | first row: ${sample}`)
        results[table] = { ok: false, error: error.message, sample }
      } else {
        results[table] = { ok: true }
      }
    }

    await Promise.all([
      doInsert('transporte', transporteRows),
      doInsert('alojamientos', alojamientosRows),
      doInsert('actividades', actividadesRows),
      doInsert('gastronomia', gastronomiaRows),
    ])

    const failures = Object.entries(results).filter(([, r]) => !r.ok)
    if (failures.length) {
      await Promise.all([
        supabase.from('transporte').delete().eq('viaje_id', viaje_id),
        supabase.from('alojamientos').delete().eq('viaje_id', viaje_id),
        supabase.from('actividades').delete().eq('viaje_id', viaje_id),
        supabase.from('gastronomia').delete().eq('viaje_id', viaje_id),
      ])
      return res.status(500).json({
        error: 'Errores insertando en DB',
        details: failures.map(([table, r]) => ({ table, error: r.error, sample: r.sample })),
      })
    }

    // ─── Update viaje (NO tocamos cover_img — eso lo hace set-cover-image) ─
    const { error: upErr } = await supabase
      .from('viajes')
      .update({
        descripcion_corta: json.descripcion_corta,
        descripcion_larga: json.descripcion_larga,
        estado: 'propuesta',
      })
      .eq('id', viaje_id)
    if (upErr) {
      return res.status(500).json({
        error: 'Error actualizando viaje (los hijos sí se insertaron)',
        detail: upErr.message,
      })
    }

    return res.status(200).json({ success: true, viaje_id, enrichment: enrichmentSummary })
  } catch (err: any) {
    console.error('Generate proposal error:', err)
    return res.status(500).json({
      error: 'Error inesperado',
      detail: err.message || String(err),
      stack: err.stack?.split('\n').slice(0, 5).join('\n'),
    })
  }
}