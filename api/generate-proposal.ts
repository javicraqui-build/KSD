import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
}

const SYSTEM = `Sos un concierge de viajes con sensibilidad editorial — voz cálida, específica, evocadora. Tu output es SIEMPRE un JSON válido sin texto adicional, sin markdown fences.`

function buildPrompt(viaje: any, personas: any[]): string {
  const noches = Math.max(
    1,
    Math.round(
      (new Date(viaje.fecha_fin).getTime() - new Date(viaje.fecha_inicio).getTime()) / 86400000
    )
  )

  const personasDesc = personas
    .map((p) => {
      const intereses = Array.isArray(p.intereses) ? p.intereses.join(', ') : ''
      const estilo = Array.isArray(p.estilo) ? p.estilo.join(', ') : ''
      const dietas = Array.isArray(p.dietas)
        ? p.dietas.filter((d: string) => d !== 'Ninguna').join(', ')
        : ''
      return `- ${p.nombre}: intereses (${intereses}); estilo (${estilo}); ritmo ${p.ritmo}${
        dietas ? `; dietas: ${dietas}` : ''
      }${p.notas ? `; notas: ${p.notas}` : ''}`
    })
    .join('\n')

  return `Armá una propuesta de viaje completa para:

DESTINO: ${viaje.destino}${viaje.pais ? `, ${viaje.pais}` : ''}
FECHAS: ${viaje.fecha_inicio} al ${viaje.fecha_fin} (${noches} noches)
PRESUPUESTO TOTAL ORIENTATIVO: ${viaje.presupuesto_total}€
VIAJEROS (${personas.length} personas):
${personasDesc}

Devolvé un JSON con ESTA estructura exacta:

{
  "descripcion_corta": "Frase evocadora 40-80 chars",
  "descripcion_larga": "Párrafo editorial 200-350 chars que pinte el viaje",
  "cover_img": "URL de Unsplash del destino (photo-XXXX con ?w=2000&q=85&auto=format&fit=crop)",
  "transporte": [
    {
      "compania": "TAP Air Portugal",
      "numero_ida": "TP1017",
      "numero_vuelta": "TP1022",
      "origen": "MAD",
      "destino": "código IATA 3 letras",
      "fecha_ida": "${viaje.fecha_inicio}",
      "hora_ida_salida": "10:15",
      "hora_ida_llegada": "10:45",
      "fecha_vuelta": "${viaje.fecha_fin}",
      "hora_vuelta_salida": "18:30",
      "hora_vuelta_llegada": "21:00",
      "precio": 284,
      "duracion": "2h 30m",
      "highlights": ["3 beneficios cortos"],
      "deeplink": "URL real a la aerolínea o Skyscanner",
      "seleccionado": true
    }
  ],
  "alojamientos": [
    {
      "plataforma": "Booking o Airbnb",
      "nombre": "Nombre del lugar",
      "barrio": "Barrio",
      "tipo": "Hotel boutique / Apartamento entero / Casa de huéspedes",
      "precio_noche": 215,
      "rating": 9.2,
      "reviews": 1247,
      "highlights": ["4 highlights"],
      "img": "URL Unsplash interior hotel/apartamento",
      "deeplink": "https://www.booking.com/searchresults.html?ss=...&checkin=${viaje.fecha_inicio}&checkout=${viaje.fecha_fin}&group_adults=${personas.length}",
      "seleccionado": true
    }
  ],
  "actividades": [
    {
      "nombre": "Actividad",
      "tipo": "Monumento / Experiencia / Patrimonio / Excursión / Paseo libre / Museo",
      "dia": 1,
      "duracion": "2-3h",
      "precio": 15,
      "descripcion": "1-2 oraciones evocadoras con detalles específicos",
      "plataforma": "Civitatis / GetYourGuide / Entrada oficial / Sin reserva",
      "img": "URL Unsplash",
      "deeplink": "URL real",
      "seleccionado": true
    }
  ],
  "gastronomia": [
    {
      "nombre": "Restaurante",
      "tipo_cocina": "Tipo",
      "barrio": "Barrio",
      "precio_rango": "€€€",
      "rating": 4.6,
      "dia_sugerido": 1,
      "descripcion": "Mencioná el plato icónico o la vibra — no genericidades",
      "img": "URL Unsplash de comida o interior",
      "deeplink": "https://www.google.com/maps/search/?api=1&query=Nombre+Restaurante+${viaje.destino}",
      "seleccionado": true
    }
  ]
}

REGLAS ESTRICTAS:
- Devolvé SOLO el JSON, sin markdown fences ni texto antes/después.
- 3 transportes con distintas aerolíneas y rangos de precio. 1 con seleccionado=true (el mejor balance), otros false.
- 3 alojamientos con precios/estilos/barrios variados. 1 seleccionado=true, otros false.
- 6 actividades repartidas en los ${noches} días. 5 con seleccionado=true, 1 con false (alternativa).
- 6 restaurantes mix €-€€€€. 5 seleccionado=true, 1 false.
- Voz: cálida, editorial, específica. Un plato icónico > "buena comida". Detalles únicos > genericidades.
- Asumí origen Madrid (MAD) para vuelos. Usá IATA reales del destino.
- Precios realistas en €. Rating Booking 8.5-9.8. Rating Airbnb 4.75-4.97. Rating Google 4.3-4.9.
- Highlights: 3-4 beneficios concretos, no slogans.
- Todo en castellano neutro.`
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // Auth: Bearer token desde el frontend
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.slice(7)

    const supabaseUrl = process.env.VITE_SUPABASE_URL!
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    // Verify session
    const {
      data: { user },
    } = await supabase.auth.getUser(token)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify allowlist (doble defensa)
    const { data: allowed, error: allowErr } = await supabase.rpc('is_ksd_user')
    if (allowErr || !allowed) return Response.json({ error: 'Forbidden' }, { status: 403 })

    // Parse body
    const { viaje_id } = await req.json()
    if (!viaje_id) return Response.json({ error: 'viaje_id required' }, { status: 400 })

    // Fetch viaje + personas
    const { data: viaje, error: vErr } = await supabase
      .from('viajes')
      .select('*, viajeros(personas(*))')
      .eq('id', viaje_id)
      .single()

    if (vErr || !viaje) return Response.json({ error: 'Viaje not found' }, { status: 404 })

    const personas = (viaje.viajeros as any[]).map((v: any) => v.personas).filter(Boolean)
    if (personas.length === 0)
      return Response.json({ error: 'No viajeros' }, { status: 400 })

    // Call Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(viaje, personas) }],
    })

    const content = msg.content.find((c: any) => c.type === 'text')
    if (!content || content.type !== 'text') throw new Error('No text response from Claude')

    let json: any
    try {
      const jsonText = (content as any).text.trim().replace(/^```json\n?|\n?```$/g, '')
      json = JSON.parse(jsonText)
    } catch (e) {
      console.error('JSON parse failed. Raw response:', (content as any).text)
      return Response.json({ error: 'AI response malformed' }, { status: 500 })
    }

    const noches = Math.max(
      1,
      Math.round(
        (new Date(viaje.fecha_fin).getTime() - new Date(viaje.fecha_inicio).getTime()) / 86400000
      )
    )

    // Update viaje (descripciones + cover)
    await supabase
      .from('viajes')
      .update({
        descripcion_corta: json.descripcion_corta,
        descripcion_larga: json.descripcion_larga,
        cover_img: json.cover_img,
        estado: 'propuesta',
      })
      .eq('id', viaje_id)

    // Clear existing children (para regeneraciones)
    await Promise.all([
      supabase.from('transporte').delete().eq('viaje_id', viaje_id),
      supabase.from('alojamientos').delete().eq('viaje_id', viaje_id),
      supabase.from('actividades').delete().eq('viaje_id', viaje_id),
      supabase.from('gastronomia').delete().eq('viaje_id', viaje_id),
    ])

    // Insert new children
    const errors: string[] = []

    if (Array.isArray(json.transporte) && json.transporte.length) {
      const { error } = await supabase
        .from('transporte')
        .insert(json.transporte.map((t: any) => ({ ...t, viaje_id })))
      if (error) errors.push(`transporte: ${error.message}`)
    }
    if (Array.isArray(json.alojamientos) && json.alojamientos.length) {
      const { error } = await supabase
        .from('alojamientos')
        .insert(json.alojamientos.map((a: any) => ({ ...a, viaje_id, noches })))
      if (error) errors.push(`alojamientos: ${error.message}`)
    }
    if (Array.isArray(json.actividades) && json.actividades.length) {
      const { error } = await supabase
        .from('actividades')
        .insert(json.actividades.map((a: any) => ({ ...a, viaje_id })))
      if (error) errors.push(`actividades: ${error.message}`)
    }
    if (Array.isArray(json.gastronomia) && json.gastronomia.length) {
      const { error } = await supabase
        .from('gastronomia')
        .insert(json.gastronomia.map((g: any) => ({ ...g, viaje_id })))
      if (error) errors.push(`gastronomia: ${error.message}`)
    }

    if (errors.length) {
      return Response.json({ error: 'Partial failure', details: errors }, { status: 500 })
    }

    return Response.json({ succ