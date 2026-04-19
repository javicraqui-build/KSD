import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'

const SYSTEM = `Sos un concierge de viajes con sensibilidad editorial — voz cálida, específica, evocadora. Tu output es SIEMPRE un JSON válido sin texto adicional, sin markdown fences, sin explicaciones.

Sos un modelo de lenguaje, NO una base de datos en tiempo real de vuelos, hoteles o restaurantes. Tu trabajo es CURAR EL ESTILO del viaje y guiar al usuario a búsquedas reales via deeplinks. NUNCA inventes nombres específicos que suenan plausibles pero no existen. Si no tenés 100% de certeza de que algo existe con un nombre exacto, usá un nombre DESCRIPTIVO del perfil y dejá campos factuales (rating, número de vuelo) en null. El deeplink lleva al usuario a una búsqueda real — ahí ve opciones concretas.`

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
REGLAS DE HONESTIDAD (CRÍTICAS — NUNCA VIOLES ESTO)
═══════════════════════════════════════════════════════════

No sabés horarios reales del día de hoy, ni números de vuelo actuales, ni inventarios específicos de hoteles/restaurantes. Seguí estas reglas al pie de la letra:

1) TRANSPORTE (vuelos):
   • numero_ida y numero_vuelta: SIEMPRE null. No inventes números de vuelo.
   • compania: poné aerolíneas TÍPICAS DE LA RUTA (ej. ${origen}→${viaje.destino}: las aerolíneas que realmente vuelan esa ruta).
   • hora_ida_salida / hora_ida_llegada / hora_vuelta_*: horarios ESTIMATIVOS realistas para esa ruta. Ponelo claro en "highlights" que es orientativo.
   • precio: promedio razonable para esa ruta y temporada.
   • duracion: la duración real típica del vuelo directo de esa ruta.
   • El deeplink de Skyscanner es el HÉROE — ahí el usuario verá vuelos reales.

2) ALOJAMIENTO — dos opciones para el campo "nombre":
   A) Si conocés un alojamiento ICÓNICO, específico y verificable del destino (ej. Memmo Alfama en Lisboa, Belmond Reid's Palace en Madeira): ponlo con su nombre real, rating y reviews coherentes.
   B) Si no tenés 100% certeza: usá un NOMBRE DESCRIPTIVO DEL PERFIL. En ese caso "rating": null y "reviews": null.
      Ejemplos válidos para opción B:
       - "Apartamento boutique en Alfama"
       - "Casa tradicional con patio en Graça"
       - "Hotel de diseño en Príncipe Real"
       - "Quinta rural con piscina a 20min de Óbidos"
   NUNCA inventes nombres específicos plausibles que no existen (ej. "Hotel Belvedere Lisboa", "Casa do Fado Suites"). Si dudás, usá opción B.
   El deeplink a Booking/Airbnb lleva a búsqueda filtrada por barrio+fechas → el usuario elige resultados reales.

3) GASTRONOMÍA — mismas dos opciones:
   A) Restaurantes icónicos y famosos (ej. Cervejaria Ramiro en Lisboa, Bouillon Chartier en París, Casa Lucio en Madrid): nombre real + rating realista.
   B) Si no: nombre DESCRIPTIVO del perfil. rating: null.
      Ejemplos válidos para opción B:
       - "Tasca tradicional con fado en Alfama"
       - "Marisquería de barrio en Cascais"
       - "Bistró orgánico en Príncipe Real"
       - "Pastelería histórica en Belém"
   NUNCA inventes un restaurante concreto con nombre propio si no estás segura de que existe.
   El deeplink a Google Maps con ese nombre descriptivo + ciudad muestra restaurantes reales coincidentes.

4) ACTIVIDADES:
   • Museos, monumentos, miradores, barrios, parques y atracciones fijas: SÍ podés nombrar — existen y son estables (Castelo de São Jorge, Torre de Belém, Museu Nacional do Azulejo, Elevador de Santa Justa, barrio de Alfama).
   • Tours, experiencias guiadas, talleres: describí el TIPO sin nombrar empresas o productos comerciales.
      Ejemplos válidos:
       - "Free walking tour por Alfama al atardecer"
       - "Tour de fado por tascas tradicionales"
       - "Clase de pastéis de nata con chef local"
       - "Excursión en velero por la costa de Cascais"
   • El deeplink a GetYourGuide/Civitatis con búsqueda pre-rellenada muestra tours reales.

REGLA FINAL — EL TEST DEL CLICK:
El usuario va a clickear cada deeplink. Si clickea y el lugar/vuelo/tour NO EXISTE con ese nombre, perdimos su confianza. Mejor ser descriptivo y llevarlo a una búsqueda real que inventar un nombre plausible. La IA cura el ESTILO, las búsquedas dan los DATOS.

═══════════════════════════════════════════════════════════
ESTRUCTURA DE SALIDA (JSON estricto)
═══════════════════════════════════════════════════════════

Devolvé un JSON con ESTA estructura exacta:

{
  "descripcion_corta": "Frase evocadora 40-80 chars",
  "descripcion_larga": "Párrafo editorial 200-350 chars que pinte el viaje",
  "cover_img": "URL de Unsplash del destino (photo-XXXX con ?w=2000&q=85&auto=format&fit=crop)",
  "transporte": [
    {
      "compania": "TAP Air Portugal",
      "numero_ida": null,
      "numero_vuelta": null,
      "origen": "código IATA del aeropuerto principal del ORIGEN (ej. ${origen} → deducir IATA)",
      "destino": "código IATA 3 letras del destino",
      "fecha_ida": "${viaje.fecha_inicio}",
      "hora_ida_salida": "10:15",
      "hora_ida_llegada": "10:45",
      "fecha_vuelta": "${viaje.fecha_fin}",
      "hora_vuelta_salida": "18:30",
      "hora_vuelta_llegada": "21:00",
      "precio": 284,
      "duracion": "2h 30m",
      "highlights": ["Horarios orientativos", "Vuelo directo", "Equipaje de mano incluido"],
      "deeplink": "URL de Skyscanner con parámetros",
      "seleccionado": true
    }
  ],
  "alojamientos": [
    {
      "plataforma": "Booking o Airbnb",
      "nombre": "Nombre real si icónico, o descriptivo del perfil",
      "barrio": "Barrio",
      "tipo": "Hotel boutique / Apartamento entero / Casa de huéspedes",
      "precio_noche": 215,
      "rating": null,
      "reviews": null,
      "highlights": ["4 características reales del perfil (barrio, estilo, servicios)"],
      "img": "URL Unsplash",
      "deeplink": "https://www.booking.com/searchresults.html?ss=...",
      "seleccionado": true
    }
  ],
  "actividades": [
    {
      "nombre": "Nombre del lugar fijo (monumento, museo) o tipo de experiencia",
      "tipo": "Monumento / Experiencia / Patrimonio / Excursión / Paseo libre / Museo",
      "dia": 1,
      "duracion": "2-3h",
      "precio": 15,
      "descripcion": "1-2 oraciones evocadoras con detalles específicos",
      "plataforma": "Civitatis / GetYourGuide / Entrada oficial / Sin reserva",
      "img": "URL Unsplash",
      "deeplink": "URL real con búsqueda",
      "seleccionado": true
    }
  ],
  "gastronomia": [
    {
      "nombre": "Nombre real si icónico, o descriptivo del perfil",
      "tipo_cocina": "Tipo",
      "barrio": "Barrio",
      "precio_rango": "€€€",
      "rating": null,
      "dia_sugerido": 1,
      "descripcion": "Mencioná el plato icónico o la vibra — no genericidades",
      "img": "URL Unsplash",
      "deeplink": "https://www.google.com/maps/search/?api=1&query=Nombre+descriptivo+${viaje.destino}",
      "seleccionado": true
    }
  ]
}

═══════════════════════════════════════════════════════════
REGLAS DE DEEPLINKS (CRÍTICO — NUNCA uses URLs genéricas sin parámetros)
═══════════════════════════════════════════════════════════

VUELOS → SIEMPRE Skyscanner con todos los parámetros:
  https://www.skyscanner.net/transport/flights/{iata_origen_lower}/{iata_destino_lower}/{YYMMDD_ida}/{YYMMDD_vuelta}/?adults={n}
  Ejemplo: https://www.skyscanner.net/transport/flights/mad/lis/260715/260815/?adults=2
  NO uses flytap.com, ryanair.com ni homepages sin parámetros.

ALOJAMIENTO BOOKING → búsqueda con fechas y huéspedes:
  https://www.booking.com/searchresults.html?ss={nombre_o_barrio+ciudad}&checkin={YYYY-MM-DD}&checkout={YYYY-MM-DD}&group_adults={n}
  Ejemplo icónico: https://www.booking.com/searchresults.html?ss=Memmo+Alfama+Lisboa&checkin=2026-05-15&checkout=2026-05-20&group_adults=2
  Ejemplo perfil: https://www.booking.com/searchresults.html?ss=Alfama+Lisboa+boutique&checkin=2026-05-15&checkout=2026-05-20&group_adults=2

ALOJAMIENTO AIRBNB → búsqueda pre-rellenada:
  https://www.airbnb.com/s/{ciudad--barrio}/homes?checkin={YYYY-MM-DD}&checkout={YYYY-MM-DD}&adults={n}
  Ejemplo: https://www.airbnb.com/s/Lisboa--Principe-Real/homes?checkin=2026-05-15&checkout=2026-05-20&adults=2

ACTIVIDADES CIVITATIS → búsqueda específica:
  https://www.civitatis.com/es/{ciudad-slug}/?q={busqueda}
  Ejemplo: https://www.civitatis.com/es/lisboa/?q=fado+alfama
  NO uses URL genérica tipo https://www.civitatis.com/es/lisboa/

ACTIVIDADES GETYOURGUIDE → búsqueda:
  https://www.getyourguide.com/s/?q={busqueda+ciudad}
  Ejemplo: https://www.getyourguide.com/s/?q=Torre+de+Belem+Lisboa

RESTAURANTES → SIEMPRE Google Maps search:
  https://www.google.com/maps/search/?api=1&query={nombre+ciudad}
  Ejemplo icónico: https://www.google.com/maps/search/?api=1&query=Cervejaria+Ramiro+Lisboa
  Ejemplo perfil: https://www.google.com/maps/search/?api=1&query=Tasca+tradicional+fado+Alfama+Lisboa

PASEOS LIBRES / SIN RESERVA → Google Maps del punto:
  https://www.google.com/maps/search/?api=1&query={lugar+ciudad}

ENTRADAS OFICIALES → SOLO si conocés la URL exacta del sitio oficial (ej. https://castelodesaojorge.pt/). Si no, usá GetYourGuide como fallback.

REGLA FINAL DE DEEPLINKS: jamás homepages sin parámetros. Para Skyscanner YYMMDD (6 dígitos). Para el resto YYYY-MM-DD. Espacios → +.

═══════════════════════════════════════════════════════════
FORMATO Y TONO
═══════════════════════════════════════════════════════════

- Devolvé SOLO el JSON. Sin "Aquí tienes:", sin markdown fences, sin texto antes o después. Empezá con { y terminá con }.
- 3 transportes con distintas aerolíneas y rangos de precio. 1 seleccionado=true (mejor balance), otros false.
- 3 alojamientos con precios/estilos/barrios variados. 1 seleccionado=true, otros false. Recomendable: 1 icónico con rating real + 2 descriptivos con rating=null.
- 6 actividades repartidas en los ${noches} días. 5 seleccionado=true, 1 false (alternativa).
- 6 gastronomía mix €-€€€€. 5 seleccionado=true, 1 false. Recomendable: 1-2 icónicos con rating real + resto descriptivos con rating=null.
- Voz: cálida, editorial, específica. Un plato icónico > "buena comida". Detalles únicos > genericidades.
- Precios realistas en €.
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