import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'

const SYSTEM = `Sos un concierge de viajes con sensibilidad editorial — voz cálida, específica, evocadora. Tu output es SIEMPRE un JSON válido sin texto adicional, sin markdown fences, sin explicaciones.`

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
      }${p.notas ? `; notas personales: ${p.notas}` : ''}`
    })
    .join('\n')

  const intencionBlock = viaje.intencion
    ? `\n\nCONTEXTO ESPECÍFICO DE ESTE VIAJE (importantísimo, tomalo muy en cuenta al diseñar la propuesta):\n"${viaje.intencion}"\n`
    : ''

  return `Armá una propuesta de viaje completa para:

DESTINO: ${viaje.destino}${viaje.pais ? `, ${viaje.pais}` : ''}
FECHAS: ${viaje.fecha_inicio} al ${viaje.fecha_fin} (${noches} noches)
PRESUPUESTO TOTAL ORIENTATIVO: ${viaje.presupuesto_total}€
VIAJEROS (${personas.length} personas):
${personasDesc}${intencionBlock}
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
      "img": "URL Unsplash",
      "deeplink": "https://www.booking.com/searchresults.html?ss=...",
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
      "img": "URL Unsplash",
      "deeplink": "https://www.google.com/maps/search/?api=1&query=Nombre+Restaurante+${viaje.destino}",
      "seleccionado": true
    }
  ]
}

REGLAS ESTRICTAS:
- Devolvé SOLO el JSON. Sin "Aquí tienes:", sin markdown fences, sin texto antes o después. Empezá con { y terminá con }.
- 3 transportes con distintas aerolíneas y rangos de precio. 1 con seleccionado=true (el mejor balance), otros false.
- 3 alojamientos con precios/estilos/barrios variados. 1 seleccionado=true, otros false.
- 6 actividades repartidas en los ${noches} días. 5 con seleccionado=true, 1 con false (alternativa).
- 6 restaurantes mix €-€€€€. 5 seleccionado=true, 1 false.
- Voz: cálida, editorial, específica. Un plato icónico > "buena comida". Detalles únicos > genericidades.
- Asumí origen Madrid (MAD) para vuelos salvo que el CONTEXTO ESPECÍFICO diga otra cosa.
- Precios realistas en €. Rating Booking 8.5-9.8. Rating Airbnb 4.75-4.97. Rating Google 4.3-4.9.
- Highlights: 3-4 beneficios concretos, no slogans.
- Todo en castellano neutro.${viaje.intencion ? '\n- AJUSTÁ todas las recomendaciones al CONTEXTO ESPECÍFICO. Si mencionan teletrabajo, alojamiento con buen WiFi y espacio de trabajo. Si es luna de miel, rincones románticos. Si es mochileros, presupuesto bajo. Si hay niños, actividades familiares. Etc.' : ''}`
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
    try {
      return attempt()
    } catch (e: any) {
      lastErr = e
    }
  }
  throw lastErr || new Error('Unknown parse error')
}

// Node-style Vercel handler (req, res)
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel' })
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no configuradas en Vercel' })
  }

  try {
    // Auth: header se lee como objeto plano en Node runtime
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

    const {
      data: { user },
    } = await supabase.auth.getUser(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized (invalid token)' })

    const { data: allowed, error: allowErr } = await supabase.rpc('is_ksd_user')
    if (allowErr) {
      return res.status(500).json({ error: 'Error checking allowlist', detail: allowErr.message })
    }
    if (!allowed) return res.status(403).json({ error: 'Forbidden (not in allowlist)' })

    // Body — Vercel Node parsea JSON automáticamente
    const body = req.body
    const viaje_id = body?.viaje_id
    if (!viaje_id) return res.status(400).json({ error: 'viaje_id required' })

    // Fetch viaje
    const { data: viaje, error: vErr } = await supabase
      .from('viajes')
      .select('*, viajeros(personas(*))')
      .eq('id', viaje_id)
      .single()

    if (vErr || !viaje) {
      return res.status(404).json({ error: 'Viaje not found', detail: vErr?.message })
    }

    const personas = (viaje.viajeros as any[]).map((v: any) => v.personas).filter(Boolean)
    if (personas.length === 0) {
      return res.status(400).json({ error: 'El viaje no tiene viajeros asignados' })
    }

    // Call Claude
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
      return res.status(500).json({
        error: 'AI response malformed',
        detail: e.message,
        raw: textBlock.text.slice(0, 800),
      })
    }

    const noches = Math.max(
      1,
      Math.round(
        (new Date(viaje.fecha_fin).getTime() - new Date(viaje.fecha_inicio).getTime()) / 86400000
      )
    )

    // Update viaje
    const { error: upErr } = await supabase
      .from('viajes')
      .update({
        descripcion_corta: json.descripcion_corta,
        descripcion_larga: json.descripcion_larga,
        cover_img: json.cover_img,
        estado: 'propuesta',
      })
      .eq('id', viaje_id)
    if (upErr) {
      return res.status(500).json({ error: 'Error actualizando viaje', detail: upErr.message })
    }

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
      return res.status(500).json({ error: 'Errores insertando en DB', details: errors })
    }

    return res.status(200).json({ success: true, viaje_id })
  } catch (err: any) {
    console.error('Generate proposal error:', err)
    return res.status(500).json({
      error: 'Error inesperado',
      detail: err.message || String(err),
      stack: err.stack?.split('\n').slice(0, 5).join('\n'),
    })
  }
}