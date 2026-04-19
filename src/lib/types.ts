export type Persona = {
  id: string
  nombre: string
  avatar: string
  color: string
  edad: number | null
  intereses: string[]
  estilo: string[]
  ritmo: 'relajado' | 'equilibrado' | 'intenso'
  dietas: string[]
  presupuesto_max: number
  notas: string
}

export type Relacion = {
  id: string
  persona_a_id: string
  persona_b_id: string
  tipo: string
}

export type Transporte = {
  id: string
  viaje_id: string
  tipo: string
  compania: string | null
  numero_ida: string | null
  numero_vuelta: string | null
  origen: string | null
  destino: string | null
  fecha_ida: string | null
  hora_ida_salida: string | null
  hora_ida_llegada: string | null
  fecha_vuelta: string | null
  hora_vuelta_salida: string | null
  hora_vuelta_llegada: string | null
  precio: number | null
  moneda: string
  duracion: string | null
  highlights: string[]
  deeplink: string | null
  seleccionado: boolean
}

export type Alojamiento = {
  id: string
  viaje_id: string
  plataforma: string | null
  nombre: string | null
  barrio: string | null
  tipo: string | null
  precio_noche: number | null
  noches: number | null
  moneda: string
  rating: number | null
  reviews: number | null
  highlights: string[]
  img: string | null
  deeplink: string | null
  seleccionado: boolean
}

export type Actividad = {
  id: string
  viaje_id: string
  nombre: string | null
  tipo: string | null
  dia: number | null
  duracion: string | null
  precio: number | null
  moneda: string
  descripcion: string | null
  plataforma: string | null
  img: string | null
  deeplink: string | null
  seleccionado: boolean
}

export type Gastronomia = {
  id: string
  viaje_id: string
  nombre: string | null
  tipo_cocina: string | null
  barrio: string | null
  precio_rango: string | null
  rating: number | null
  dia_sugerido: number | null
  descripcion: string | null
  img: string | null
  deeplink: string | null
  seleccionado: boolean
}

export type Viaje = {
  id: string
  titulo: string
  destino: string
  pais: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  presupuesto_total: number
  estado: 'idea' | 'propuesta' | 'confirmado' | 'completado'
  cover_img: string | null
  descripcion_corta: string | null
  descripcion_larga: string | null
  intencion: string
  viajeros: string[]
  transporte: Transporte[]
  alojamientos: Alojamiento[]
  actividades: Actividad[]
  gastronomia: Gastronomia[]
}

export type AppState = {
  personas: Persona[]
  relaciones: Relacion[]
  viajes: Viaje[]
}
