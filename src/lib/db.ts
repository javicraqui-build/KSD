import { supabase } from './supabase'
import type { AppState, Persona, Viaje } from './types'

export async function loadAll(): Promise<AppState> {
  const [pr, rr, vr] = await Promise.all([
    supabase.from('personas').select('*').order('created_at'),
    supabase.from('relaciones').select('*'),
    supabase.from('viajes').select(`
      *,
      transporte(*),
      alojamientos(*),
      actividades(*),
      gastronomia(*),
      viajeros(persona_id)
    `).order('created_at', { ascending: false })
  ])

  if (pr.error) throw pr.error
  if (rr.error) throw rr.error
  if (vr.error) throw vr.error

  const viajes: Viaje[] = (vr.data || []).map((v: any) => ({
    ...v,
    viajeros: (v.viajeros || []).map((x: any) => x.persona_id)
  }))

  return {
    personas: (pr.data || []) as Persona[],
    relaciones: (rr.data || []) as any,
    viajes
  }
}

export async function savePersona(p: Persona, isNew: boolean) {
  if (isNew) {
    const { id, ...rest } = p
    const { data, error } = await supabase.from('personas').insert(rest).select().single()
    if (error) throw error
    return data as Persona
  } else {
    const { data, error } = await supabase.from('personas').update(p).eq('id', p.id).select().single()
    if (error) throw error
    return data as Persona
  }
}

export async function deletePersona(id: string) {
  const { error } = await supabase.from('personas').delete().eq('id', id)
  if (error) throw error
}

export async function createViaje(v: Partial<Viaje>, viajerosIds: string[]) {
  const { viajeros, transporte, alojamientos, actividades, gastronomia, id, ...viajeData } = v as any
  const { data, error } = await supabase.from('viajes').insert(viajeData).select().single()
  if (error) throw error
  const newId = data.id
  if (viajerosIds.length) {
    await supabase.from('viajeros').insert(viajerosIds.map(pid => ({ viaje_id: newId, persona_id: pid })))
  }
  return newId as string
}

export async function deleteViaje(id: string) {
  const { error } = await supabase.from('viajes').delete().eq('id', id)
  if (error) throw error
}

export async function selectSingle(table: 'transporte' | 'alojamientos', viajeId: string, optionId: string) {
  await supabase.from(table).update({ seleccionado: false }).eq('viaje_id', viajeId)
  await supabase.from(table).update({ seleccionado: true }).eq('id', optionId)
}

export async function toggleItem(table: 'actividades' | 'gastronomia', id: string, next: boolean) {
  const { error } = await supabase.from(table).update({ seleccionado: next }).eq('id', id)
  if (error) throw error
}

export async function updateIntencion(viajeId: string, intencion: string) {
  const { error } = await supabase
    .from('viajes')
    .update({ intencion })
    .eq('id', viajeId)
  if (error) throw error
}

export async function generateProposal(viajeId: string, intencion?: string): Promise<void> {
  // Si el usuario escribió una intención, la guardamos antes de llamar al endpoint
  if (typeof intencion === 'string') {
    await updateIntencion(viajeId, intencion)
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesión activa')

  const res = await fetch('/api/generate-proposal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ viaje_id: viajeId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    const detail = err.detail ? ` (${err.detail})` : ''
    throw new Error(`${err.error || `Error ${res.status}`}${detail}`)
  }
}
