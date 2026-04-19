import React, { useState, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Check, Edit2, Trash2,
  Plane, Utensils, Compass, Calendar, Clock,
  ExternalLink, Sparkles, Star, ArrowRight, ArrowUpRight,
  Wine, Palette, Mountain, Camera, Music, BookOpen,
  ShoppingBag, Waves, Building2, Home as HomeIcon,
  Moon, Coffee, LogOut, Mail
} from 'lucide-react'
import { supabase } from './lib/supabase'
import * as db from './lib/db'
import type { AppState, Persona, Viaje } from './lib/types'

const C = {
  paper: '#E7EEEA', paperDim: '#D7E1DC', cream: '#C8D5CF',
  sand: '#A9BCB5', sandDeep: '#85988F',
  terracotta: '#B89562', terracottaDeep: '#8E7040',
  olive: '#6E8B80', oliveDeep: '#48625A',
  aegean: '#1E6779', aegeanDeep: '#0E3E4D',
  gold: '#C7A866',
  ink: '#0B1E2A', inkSoft: '#21384A',
  muted: '#6A7D77', mutedLight: '#93A5A0',
  line: '#BDCBC5', lineLight: '#D2DDD8'
}

const fontStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800&display=swap');
  body { background: ${C.paper}; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .font-serif { font-family: 'Inter', -apple-system, sans-serif; font-weight: 500; }
  .font-sans { font-family: 'Inter', -apple-system, sans-serif; font-weight: 500; }
  .font-display { font-family: 'Inter', -apple-system, sans-serif; font-weight: 800; letter-spacing: -0.035em; }
  .tracking-caps { letter-spacing: 0.22em; text-transform: uppercase; font-size: 0.72rem; font-weight: 700; }
  .tracking-caps-sm { letter-spacing: 0.18em; text-transform: uppercase; font-size: 0.66rem; font-weight: 700; }
  .italic-serif { font-family: 'Inter', -apple-system, sans-serif; font-style: italic; font-weight: 700; letter-spacing: -0.02em; }
  .fade-in { animation: fadeIn 0.45s ease-out both; }
  .slide-up { animation: slideUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  .lift { transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.35s ease; }
  .lift:hover { transform: translateY(-3px); box-shadow: 0 20px 40px -20px rgba(11,30,42,0.3); }
  .btn-primary { background: ${C.ink}; color: ${C.paper}; transition: all 0.25s ease; font-weight: 600; }
  .btn-primary:hover { background: ${C.inkSoft}; transform: translateY(-1px); }
  .btn-ghost { background: transparent; color: ${C.ink}; transition: all 0.25s ease; font-weight: 500; }
  .btn-ghost:hover { background: ${C.paperDim}; }
  .chip { transition: all 0.2s ease; font-weight: 500; }
  .chip:hover { background: ${C.sand}; }
  .chip.active { background: ${C.ink}; color: ${C.paper}; border-color: ${C.ink}; }
  input, textarea, select { font-family: 'Inter', sans-serif; font-weight: 500; }
  input:focus, textarea:focus, select:focus { outline: none; box-shadow: 0 0 0 2px ${C.sand}; }
`

const INTERESES = [
  { id: 'gastronomia', label: 'Gastronomía', icon: Utensils },
  { id: 'arte', label: 'Arte', icon: Palette },
  { id: 'arquitectura', label: 'Arquitectura', icon: Building2 },
  { id: 'naturaleza', label: 'Naturaleza', icon: Mountain },
  { id: 'playa', label: 'Playa', icon: Waves },
  { id: 'fotografia', label: 'Fotografía', icon: Camera },
  { id: 'musica', label: 'Música', icon: Music },
  { id: 'literatura', label: 'Literatura', icon: BookOpen },
  { id: 'vino', label: 'Vino', icon: Wine },
  { id: 'cafe', label: 'Café', icon: Coffee },
  { id: 'compras', label: 'Compras', icon: ShoppingBag },
  { id: 'vida_nocturna', label: 'Vida nocturna', icon: Moon },
  { id: 'historia', label: 'Historia', icon: BookOpen },
  { id: 'senderismo', label: 'Senderismo', icon: Mountain }
]

const ESTILOS = [
  { id: 'cultural', label: 'Cultural' }, { id: 'foodie', label: 'Foodie' },
  { id: 'aventura', label: 'Aventura' }, { id: 'relax', label: 'Relax' },
  { id: 'romantico', label: 'Romántico' }, { id: 'urbano', label: 'Urbano' },
  { id: 'naturaleza', label: 'Naturaleza' }, { id: 'lujo', label: 'Lujo' }
]

const DIETAS = ['Ninguna', 'Vegetariana', 'Vegana', 'Sin gluten', 'Sin lactosa', 'Pescetariana', 'Halal', 'Kosher']

const fmtDate = (d: string | null) => {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtDateShort = (d: string | null) => {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
const nightsBetween = (a: string | null, b: string | null) => {
  if (!a || !b) return 0
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
}
const tripTotal = (v: Viaje) => {
  const t = v.transporte.filter(x => x.seleccionado).reduce((s, x) => s + (x.precio || 0), 0)
  const a = v.alojamientos.filter(x => x.seleccionado).reduce((s, x) => s + ((x.precio_noche || 0) * (x.noches || 0)), 0)
  const acPorPersona = v.actividades.filter(x => x.seleccionado).reduce((s, x) => s + (x.precio || 0), 0)
  const numViajeros = Math.max(1, v.viajeros.length)
  const ac = acPorPersona * numViajeros
  return { transporte: t, alojamiento: a, actividades: ac, actividadesPorPersona: acPorPersona, numViajeros, gastronomia: 0, total: t + a + ac }
}

type View =
  | { name: 'home' }
  | { name: 'personas' }
  | { name: 'persona'; id: string }
  | { name: 'nuevo' }
  | { name: 'viaje'; id: string }

function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 group">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.ink, color: C.paper }}>
        <span className="font-display text-xl leading-none" style={{ fontWeight: 700 }}>空</span>
      </div>
      <div className="flex flex-col leading-none gap-1">
        <span className="font-display text-xl" style={{ color: C.ink, fontWeight: 800, letterSpacing: '0.06em' }}>KSD</span>
        <span className="text-[10px]" style={{ color: C.muted, letterSpacing: '0.14em', fontWeight: 600 }}>KūSō · Sueño · Dream</span>
      </div>
    </button>
  )
}

function Avatar({ persona, size = 'md' }: { persona: Persona; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-11 h-11 text-lg', lg: 'w-16 h-16 text-2xl', xl: 'w-24 h-24 text-4xl' }
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-serif`}
         style={{ background: persona.color || C.sand, color: C.paper }}>
      <span>{persona.avatar || persona.nombre?.[0]?.toUpperCase()}</span>
    </div>
  )
}

function Tag({ children, active, onClick, icon: Icon }: any) {
  return (
    <button onClick={onClick}
      className={`chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm ${active ? 'active' : ''}`}
      style={{ borderColor: active ? C.ink : C.line, color: active ? C.paper : C.inkSoft, background: active ? C.ink : 'transparent' }}>
      {Icon && <Icon size={13} strokeWidth={1.8} />}
      {children}
    </button>
  )
}

function SectionLabel({ children, num }: { children: React.ReactNode; num?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      {num && <span className="font-display text-sm" style={{ color: C.aegean }}>{num}</span>}
      <span className="tracking-caps" style={{ color: C.muted }}>{children}</span>
      <div className="flex-1 border-t" style={{ borderColor: C.lineLight }} />
    </div>
  )
}

function Field({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3">
        <div className="tracking-caps-sm" style={{ color: C.muted }}>{label}</div>
        {sub && <div className="text-sm mt-1" style={{ color: C.muted }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function SafeImg({ src, alt, className }: { src: string | null; alt?: string; className?: string }) {
  const [err, setErr] = useState(false)
  const grad = `linear-gradient(135deg, ${C.sand}, ${C.aegean}, ${C.aegeanDeep})`
  if (err || !src) return <div className={className} style={{ background: grad }} />
  return <img src={src} alt={alt} className={className} onError={() => setErr(true)} loading="lazy" />
}

function LoginView() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true }
    })
    setSending(false)
    if (error) setErr(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: C.paper }}>
      <style>{fontStyles}</style>
      <div className="w-full max-w-md fade-in">
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: C.ink, color: C.paper }}>
              <span className="font-display text-3xl leading-none" style={{ fontWeight: 700 }}>空</span>
            </div>
            <div className="flex flex-col leading-none gap-1.5">
              <span className="font-display text-3xl" style={{ color: C.ink, fontWeight: 800, letterSpacing: '0.06em' }}>KSD</span>
              <span className="text-[11px]" style={{ color: C.muted, letterSpacing: '0.14em', fontWeight: 600 }}>KūSō · Sueño · Dream</span>
            </div>
          </div>
        </div>

        <div className="tracking-caps text-center mb-4" style={{ color: C.aegean }}>Un viaje empieza al soñarlo</div>
        <h1 className="font-display text-4xl text-center mb-10" style={{ color: C.ink }}>
          Entrá a <span className="italic-serif" style={{ color: C.aegean }}>soñar</span>.
        </h1>

        {sent ? (
          <div className="text-center p-8 rounded-2xl" style={{ background: C.paperDim }}>
            <Mail size={28} className="mx-auto mb-3" style={{ color: C.aegean }} />
            <p className="font-display text-xl mb-2" style={{ color: C.ink }}>Revisá tu email.</p>
            <p className="text-sm" style={{ color: C.muted }}>
              Te enviamos un enlace mágico a <strong>{email}</strong>. Hacé clic y volvés acá.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <input
              type="email" required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full bg-transparent border-b pb-3 font-serif text-2xl text-center"
              style={{ borderColor: C.line, color: C.ink }}
              autoFocus
            />
            {err && <p className="text-sm text-center" style={{ color: '#B85050' }}>{err}</p>}
            <button type="submit" disabled={sending || !email}
              className="w-full h-12 rounded-full btn-primary disabled:opacity-50">
              {sending ? 'Enviando…' : 'Enviame el enlace'}
            </button>
            <p className="text-xs text-center mt-6" style={{ color: C.muted }}>
              Solo emails invitados pueden entrar.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

function TopBar({ view, onNavigate, userEmail, onLogout }: any) {
  return (
    <div className="sticky top-0 z-40 backdrop-blur-md"
         style={{ background: `${C.paper}ee`, borderBottom: `1px solid ${C.lineLight}` }}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo onClick={() => onNavigate({ name: 'home' })} />
        <nav className="flex items-center gap-1">
          <NavLink active={view.name === 'home'} onClick={() => onNavigate({ name: 'home' })}>Atlas</NavLink>
          <NavLink active={view.name === 'personas'} onClick={() => onNavigate({ name: 'personas' })}>Personas</NavLink>
          <button onClick={() => onNavigate({ name: 'nuevo' })}
            className="ml-3 px-4 h-9 rounded-full text-sm flex items-center gap-1.5 btn-primary">
            <Plus size={14} strokeWidth={2} /> Nuevo viaje
          </button>
          <div className="ml-2 pl-2 border-l" style={{ borderColor: C.line }}>
            <button onClick={onLogout} title={`Salir (${userEmail})`}
              className="w-9 h-9 rounded-full flex items-center justify-center btn-ghost">
              <LogOut size={14} />
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}

function NavLink({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className="px-3 h-9 rounded-full text-sm transition-all"
      style={{ color: active ? C.ink : C.muted, fontWeight: active ? 600 : 500 }}>
      {children}
    </button>
  )
}

function HomeView({ state, onNavigate }: { state: AppState; onNavigate: (v: View) => void }) {
  const proximos = state.viajes.filter(v => v.estado !== 'completado')
  return (
    <div className="max-w-6xl mx-auto px-6 py-14 fade-in">
      <div className="mb-16 slide-up">
        <div className="tracking-caps mb-5" style={{ color: C.aegean }}>空想 · Kūsō · Sueño · Dream</div>
        <h1 className="font-display text-[clamp(3rem,7.5vw,6.5rem)] leading-[0.95] mb-6" style={{ color: C.ink }}>
          Un viaje empieza<br />
          <span className="italic-serif" style={{ color: C.aegean }}>al soñarlo.</span>
        </h1>
        <p className="font-serif text-xl max-w-2xl leading-relaxed" style={{ color: C.inkSoft }}>
          Aquí guardamos a quienes viajan, las ideas que flotan y los viajes que cobran forma.
        </p>
      </div>

      <section className="mb-20">
        <SectionLabel num="I">Próximos viajes</SectionLabel>
        {proximos.length === 0 ? (
          <div className="rounded-2xl p-12 text-center mt-6" style={{ background: C.paperDim }}>
            <div className="font-display text-2xl mb-2" style={{ color: C.ink }}>Aún no hay viajes.</div>
            <p className="mb-6" style={{ color: C.muted }}>Empieza a imaginar el primero.</p>
            <button onClick={() => onNavigate({ name: 'nuevo' })} className="px-6 h-11 rounded-full text-sm btn-primary">Crear viaje</button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            {proximos.map((v, i) => (
              <TripCard key={v.id} viaje={v} state={state} onClick={() => onNavigate({ name: 'viaje', id: v.id })} delay={i * 80} />
            ))}
            <button onClick={() => onNavigate({ name: 'nuevo' })}
              className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 lift"
              style={{ borderColor: C.line, aspectRatio: '4/3', color: C.muted, background: C.paperDim }}>
              <Plus size={24} strokeWidth={1.5} />
              <span className="font-display italic text-lg">Un nuevo viaje</span>
            </button>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-end justify-between mb-6">
          <div className="flex-1"><SectionLabel num="II">Quiénes viajan</SectionLabel></div>
          <button onClick={() => onNavigate({ name: 'personas' })}
            className="text-sm flex items-center gap-1" style={{ color: C.muted }}>
            Ver todas <ArrowRight size={14} />
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {state.personas.map((p, i) => (
            <button key={p.id} onClick={() => onNavigate({ name: 'persona', id: p.id })}
              className="flex items-center gap-4 p-5 rounded-2xl text-left lift slide-up"
              style={{ background: C.paperDim, animationDelay: `${i * 60}ms` }}>
              <Avatar persona={p} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="font-display text-xl truncate" style={{ color: C.ink }}>{p.nombre}</div>
                <div className="text-sm truncate" style={{ color: C.muted }}>
                  {p.estilo?.slice(0, 2).map(s => ESTILOS.find(e => e.id === s)?.label).filter(Boolean).join(' · ') || 'Sin perfil'}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: C.muted }} />
            </button>
          ))}
          <button onClick={() => onNavigate({ name: 'persona', id: 'new' })}
            className="rounded-2xl border-2 border-dashed p-5 flex items-center justify-center gap-2 text-sm lift"
            style={{ borderColor: C.line, color: C.muted, minHeight: '120px' }}>
            <Plus size={16} /> Añadir persona
          </button>
        </div>
      </section>
    </div>
  )
}

function TripCard({ viaje, state, onClick, delay }: any) {
  const total = tripTotal(viaje)
  const travelers = viaje.viajeros.map((id: string) => state.personas.find((p: Persona) => p.id === id)).filter(Boolean)
  return (
    <button onClick={onClick}
      className="group relative rounded-2xl overflow-hidden text-left lift slide-up"
      style={{ background: C.cream, aspectRatio: '4/3', animationDelay: `${delay}ms` }}>
      <SafeImg src={viaje.cover_img} alt={viaje.destino}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.1) 55%, rgba(0,0,0,0.75) 100%)'
      }} />
      <div className="absolute top-5 left-5 right-5 flex justify-between items-start">
        <span className="tracking-caps-sm px-2.5 py-1 rounded-full backdrop-blur-md"
              style={{ background: 'rgba(255,255,255,0.9)', color: C.ink }}>
          {viaje.estado === 'propuesta' ? 'Propuesta' : viaje.estado === 'confirmado' ? 'Confirmado' : 'Idea'}
        </span>
        <div className="flex -space-x-2">
          {travelers.map((p: Persona) => (
            <div key={p.id} className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm"
                 style={{ background: p.color, color: C.paper, borderColor: C.paper }}>{p.avatar}</div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
        <div className="tracking-caps-sm mb-2 opacity-80">{viaje.pais || viaje.destino}</div>
        <div className="font-display text-3xl leading-tight mb-1">{viaje.titulo}</div>
        <div className="flex items-center gap-3 text-sm opacity-90">
          <span>{fmtDateShort(viaje.fecha_inicio)} — {fmtDateShort(viaje.fecha_fin)}</span>
          <span>·</span>
          <span>desde {total.total.toLocaleString('es-ES')}€</span>
        </div>
      </div>
    </button>
  )
}

function PersonasListView({ state, onNavigate }: any) {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12 fade-in">
      <button onClick={() => onNavigate({ name: 'home' })}
        className="flex items-center gap-1.5 text-sm mb-6" style={{ color: C.muted }}>
        <ChevronLeft size={14} /> Atlas
      </button>
      <div className="mb-10">
        <div className="tracking-caps mb-3" style={{ color: C.aegean }}>Personas</div>
        <h1 className="font-display text-5xl" style={{ color: C.ink }}>
          Quiénes <span className="italic-serif" style={{ color: C.aegean }}>viajan</span>
        </h1>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {state.personas.map((p: Persona, i: number) => (
          <button key={p.id} onClick={() => onNavigate({ name: 'persona', id: p.id })}
            className="rounded-2xl p-6 text-left lift slide-up"
            style={{ background: C.paperDim, animationDelay: `${i * 60}ms`, minHeight: '180px' }}>
            <div className="flex items-start gap-4 mb-4">
              <Avatar persona={p} size="lg" />
              <div className="flex-1 min-w-0 pt-1">
                <div className="font-display text-2xl" style={{ color: C.ink }}>{p.nombre}</div>
                <div className="text-sm mt-0.5 capitalize" style={{ color: C.muted }}>Ritmo {p.ritmo}</div>
              </div>
              <Edit2 size={14} style={{ color: C.muted }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.intereses?.slice(0, 5).map(i => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full border"
                      style={{ borderColor: C.line, color: C.inkSoft }}>
                  {INTERESES.find(x => x.id === i)?.label || i}
                </span>
              ))}
            </div>
          </button>
        ))}
        <button onClick={() => onNavigate({ name: 'persona', id: 'new' })}
          className="rounded-2xl border-2 border-dashed p-6 flex items-center justify-center gap-2 text-sm lift"
          style={{ borderColor: C.line, color: C.muted, minHeight: '180px' }}>
          <Plus size={16} /> Añadir persona
        </button>
      </div>
    </div>
  )
}

function PersonaView({ id, state, onSave, onDelete, onNavigate }: any) {
  const isNew = id === 'new'
  const existing = state.personas.find((p: Persona) => p.id === id)
  const [draft, setDraft] = useState<Persona>(existing || {
    id: crypto.randomUUID(), nombre: '', avatar: '✦', color: C.terracotta,
    edad: null, intereses: [], estilo: [], ritmo: 'equilibrado', dietas: ['Ninguna'],
    presupuesto_max: 1500, notas: ''
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await onSave(draft, isNew)
    setSaving(false)
    onNavigate({ name: 'personas' })
  }

  const remove = async () => {
    if (!existing) return
    if (!confirm('¿Eliminar esta persona?')) return
    await onDelete(existing.id)
    onNavigate({ name: 'personas' })
  }

  const toggle = (field: 'intereses' | 'estilo', val: string) => {
    const has = draft[field]?.includes(val)
    setDraft({ ...draft, [field]: has ? draft[field].filter(x => x !== val) : [...(draft[field] || []), val] })
  }
  const toggleDieta = (d: string) => {
    if (d === 'Ninguna') setDraft({ ...draft, dietas: ['Ninguna'] })
    else {
      const filtered = draft.dietas.filter(x => x !== 'Ninguna')
      const next = filtered.includes(d) ? filtered.filter(x => x !== d) : [...filtered, d]
      setDraft({ ...draft, dietas: next.length ? next : ['Ninguna'] })
    }
  }

  const AVATARS = ['🌊', '🌿', '☀️', '🌙', '✦', '🍋', '🌾', '🏛', '🌺', '🕊', '🍷', '📸']
  const COLORS = [C.terracotta, C.olive, C.aegean, C.gold, C.aegeanDeep, C.oliveDeep, C.terracottaDeep, C.ink]

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 fade-in">
      <button onClick={() => onNavigate({ name: 'personas' })}
        className="flex items-center gap-1.5 text-sm mb-6" style={{ color: C.muted }}>
        <ChevronLeft size={14} /> Personas
      </button>

      <div className="flex items-center gap-5 mb-10">
        <Avatar persona={draft} size="xl" />
        <div>
          <div className="tracking-caps mb-1" style={{ color: C.aegean }}>{isNew ? 'Nueva persona' : 'Editando'}</div>
          <h1 className="font-display text-4xl" style={{ color: C.ink }}>{draft.nombre || 'Sin nombre'}</h1>
        </div>
      </div>

      <div className="space-y-8">
        <Field label="Nombre">
          <input type="text" value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })}
            className="w-full bg-transparent border-b pb-2 font-serif text-2xl"
            style={{ borderColor: C.line, color: C.ink }} placeholder="Cómo se llama" />
        </Field>

        <Field label="Identidad visual">
          <div className="flex flex-wrap gap-2 mb-3">
            {AVATARS.map(a => (
              <button key={a} onClick={() => setDraft({ ...draft, avatar: a })}
                className="w-11 h-11 rounded-full border flex items-center justify-center text-lg"
                style={{ borderColor: draft.avatar === a ? C.ink : C.line, background: draft.avatar === a ? C.paperDim : 'transparent' }}>
                {a}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => setDraft({ ...draft, color: c })}
                className="w-7 h-7 rounded-full"
                style={{ background: c, border: draft.color === c ? `2px solid ${C.ink}` : 'none', outline: draft.color === c ? `2px solid ${C.paper}` : 'none', outlineOffset: '-4px' }} />
            ))}
          </div>
        </Field>

        <Field label="Intereses" sub="Qué cosas te encienden cuando viajas">
          <div className="flex flex-wrap gap-2">
            {INTERESES.map(i => (
              <Tag key={i.id} active={draft.intereses?.includes(i.id)} onClick={() => toggle('intereses', i.id)} icon={i.icon}>
                {i.label}
              </Tag>
            ))}
          </div>
        </Field>

        <Field label="Estilo de viaje" sub="Elige los que más te describan">
          <div className="flex flex-wrap gap-2">
            {ESTILOS.map(e => (
              <Tag key={e.id} active={draft.estilo?.includes(e.id)} onClick={() => toggle('estilo', e.id)}>{e.label}</Tag>
            ))}
          </div>
        </Field>

        <Field label="Ritmo">
          <div className="flex gap-2">
            {(['relajado', 'equilibrado', 'intenso'] as const).map(r => (
              <button key={r} onClick={() => setDraft({ ...draft, ritmo: r })}
                className={`chip flex-1 py-3 rounded-2xl border text-sm capitalize ${draft.ritmo === r ? 'active' : ''}`}
                style={{ borderColor: draft.ritmo === r ? C.ink : C.line, background: draft.ritmo === r ? C.ink : 'transparent', color: draft.ritmo === r ? C.paper : C.inkSoft }}>
                {r}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Restricciones alimentarias">
          <div className="flex flex-wrap gap-2">
            {DIETAS.map(d => (
              <Tag key={d} active={draft.dietas?.includes(d)} onClick={() => toggleDieta(d)}>{d}</Tag>
            ))}
          </div>
        </Field>

        <Field label="Presupuesto tope por viaje">
          <div className="flex items-center gap-4">
            <input type="range" min="300" max="5000" step="100"
              value={draft.presupuesto_max}
              onChange={e => setDraft({ ...draft, presupuesto_max: Number(e.target.value) })}
              className="flex-1" style={{ accentColor: C.ink }} />
            <div className="font-display text-2xl min-w-[120px] text-right" style={{ color: C.ink }}>
              {draft.presupuesto_max.toLocaleString('es-ES')}€
            </div>
          </div>
        </Field>

        <Field label="Notas">
          <textarea value={draft.notas} onChange={e => setDraft({ ...draft, notas: e.target.value })}
            rows={3} className="w-full bg-transparent border rounded-lg p-3 text-base"
            style={{ borderColor: C.line, color: C.inkSoft }}
            placeholder="Le encanta el café por la mañana, odia madrugar demasiado…" />
        </Field>
      </div>

      <div className="flex justify-between items-center mt-12 pt-8 border-t" style={{ borderColor: C.lineLight }}>
        <div>
          {!isNew && (
            <button onClick={remove} className="text-sm flex items-center gap-1.5" style={{ color: C.terracotta }}>
              <Trash2 size={14} /> Eliminar
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={() => onNavigate({ name: 'personas' })} className="px-5 h-11 rounded-full text-sm btn-ghost">Cancelar</button>
          <button onClick={save} disabled={!draft.nombre || saving}
            className="px-6 h-11 rounded-full text-sm btn-primary disabled:opacity-40">
            {saving ? 'Guardando…' : (isNew ? 'Crear' : 'Guardar cambios')}
          </button>
        </div>
      </div>
    </div>
  )
}

function NuevoViajeView({ state, onCreate, onNavigate }: any) {
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<any>({
    titulo: '', destino: '', pais: '', fecha_inicio: '', fecha_fin: '',
    viajeros: state.personas.map((p: Persona) => p.id),
    presupuesto_total: 2000, estado: 'idea', cover_img: ''
  })
  const [creating, setCreating] = useState(false)

  const DESTINOS = [
    { nombre: 'Lisboa', pais: 'Portugal', img: 'https://images.unsplash.com/photo-1588535968642-1b45e1a8f09a?w=1200&q=85', mood: 'Cultural · Luz atlántica' },
    { nombre: 'Nápoles', pais: 'Italia', img: 'https://images.unsplash.com/photo-1533154683836-84ea7a0bc310?w=1200&q=85', mood: 'Caótico · Foodie' },
    { nombre: 'Creta', pais: 'Grecia', img: 'https://images.unsplash.com/photo-1601581875039-e899893d520c?w=1200&q=85', mood: 'Playa · Ruinas' },
    { nombre: 'Palermo', pais: 'Italia', img: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=1200&q=85', mood: 'Barroco · Mercados' },
    { nombre: 'Sevilla', pais: 'España', img: 'https://images.unsplash.com/photo-1559682468-a6a29e7d9517?w=1200&q=85', mood: 'Andaluz · Tapas' },
    { nombre: 'Dubrovnik', pais: 'Croacia', img: 'https://images.unsplash.com/photo-1555990538-32226d9ce0d3?w=1200&q=85', mood: 'Murallas · Adriático' }
  ]

  const create = async () => {
    setCreating(true)
    const newId = await onCreate({
      ...draft,
      titulo: draft.titulo || `${draft.destino}, un viaje`
    })
    setCreating(false)
    onNavigate({ name: 'viaje', id: newId })
  }

  const toggleViajero = (id: string) => {
    const has = draft.viajeros.includes(id)
    setDraft({ ...draft, viajeros: has ? draft.viajeros.filter((x: string) => x !== id) : [...draft.viajeros, id] })
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 fade-in">
      <button onClick={() => onNavigate({ name: 'home' })}
        className="flex items-center gap-1.5 text-sm mb-8" style={{ color: C.muted }}>
        <ChevronLeft size={14} /> Atlas
      </button>
      <div className="mb-10">
        <div className="tracking-caps mb-3" style={{ color: C.aegean }}>Paso {step} de 3</div>
        <h1 className="font-display text-5xl leading-tight" style={{ color: C.ink }}>
          {step === 1 && <>Un lugar al que <span className="italic-serif" style={{ color: C.aegean }}>escaparse</span>.</>}
          {step === 2 && <>Y las <span className="italic-serif" style={{ color: C.aegean }}>fechas</span>.</>}
          {step === 3 && <>Con <span className="italic-serif" style={{ color: C.aegean }}>quién</span>.</>}
        </h1>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <div className="tracking-caps-sm mb-3" style={{ color: C.muted }}>Sugerencias mediterráneas</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {DESTINOS.map(d => (
                <button key={d.nombre} onClick={() => setDraft({ ...draft, destino: d.nombre, pais: d.pais, cover_img: d.img })}
                  className="group relative rounded-2xl overflow-hidden lift text-left"
                  style={{ aspectRatio: '3/4', border: draft.destino === d.nombre ? `3px solid ${C.ink}` : 'none' }}>
                  <SafeImg src={d.img} alt={d.nombre} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.8) 100%)' }} />
                  <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                    <div className="tracking-caps-sm opacity-80 mb-0.5">{d.pais}</div>
                    <div className="font-display text-2xl leading-tight">{d.nombre}</div>
                    <div className="text-xs mt-1 opacity-80">{d.mood}</div>
                  </div>
                  {draft.destino === d.nombre && (
                    <div className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: C.paper, color: C.ink }}>
                      <Check size={14} strokeWidth={2.5} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-4">
            <div className="flex-1 h-px" style={{ background: C.lineLight }} />
            <span className="text-xs" style={{ color: C.muted }}>o escribe otro</span>
            <div className="flex-1 h-px" style={{ background: C.lineLight }} />
          </div>
          <input type="text" value={draft.destino}
            onChange={e => setDraft({ ...draft, destino: e.target.value, pais: '' })}
            className="w-full bg-transparent border-b pb-3 font-serif text-3xl"
            style={{ borderColor: C.line, color: C.ink }} placeholder="Tokio, Marrakech, un pueblo de los Alpes…" />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Salida">
              <input type="date" value={draft.fecha_inicio} onChange={e => setDraft({ ...draft, fecha_inicio: e.target.value })}
                className="w-full bg-transparent border-b pb-2 font-serif text-2xl"
                style={{ borderColor: C.line, color: C.ink }} />
            </Field>
            <Field label="Vuelta">
              <input type="date" value={draft.fecha_fin} onChange={e => setDraft({ ...draft, fecha_fin: e.target.value })}
                className="w-full bg-transparent border-b pb-2 font-serif text-2xl"
                style={{ borderColor: C.line, color: C.ink }} />
            </Field>
          </div>
          {draft.fecha_inicio && draft.fecha_fin && (
            <div className="p-5 rounded-2xl flex items-center justify-between" style={{ background: C.paperDim }}>
              <div>
                <div className="tracking-caps-sm" style={{ color: C.muted }}>Duración</div>
                <div className="font-display text-3xl" style={{ color: C.ink }}>
                  {nightsBetween(draft.fecha_inicio, draft.fecha_fin)} <span className="text-lg italic-serif" style={{ color: C.muted }}>noches</span>
                </div>
              </div>
              <Calendar size={32} style={{ color: C.aegean }} strokeWidth={1} />
            </div>
          )}
          <Field label="Presupuesto total orientativo">
            <div className="flex items-center gap-4">
              <input type="range" min="300" max="8000" step="100" value={draft.presupuesto_total}
                onChange={e => setDraft({ ...draft, presupuesto_total: Number(e.target.value) })}
                className="flex-1" style={{ accentColor: C.ink }} />
              <div className="font-display text-2xl min-w-[130px] text-right" style={{ color: C.ink }}>
                {draft.presupuesto_total.toLocaleString('es-ES')}€
              </div>
            </div>
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="tracking-caps-sm" style={{ color: C.muted }}>Elige los viajeros</div>
          {state.personas.map((p: Persona) => (
            <button key={p.id} onClick={() => toggleViajero(p.id)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all"
              style={{ borderColor: draft.viajeros.includes(p.id) ? C.ink : C.line, background: draft.viajeros.includes(p.id) ? C.paperDim : 'transparent' }}>
              <Avatar persona={p} size="md" />
              <div className="flex-1">
                <div className="font-display text-lg" style={{ color: C.ink }}>{p.nombre}</div>
                <div className="text-sm" style={{ color: C.muted }}>
                  {p.estilo?.slice(0, 2).map(s => ESTILOS.find(e => e.id === s)?.label).filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center"
                   style={{ background: draft.viajeros.includes(p.id) ? C.ink : 'transparent', border: `1.5px solid ${draft.viajeros.includes(p.id) ? C.ink : C.line}` }}>
                {draft.viajeros.includes(p.id) && <Check size={13} strokeWidth={3} style={{ color: C.paper }} />}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center mt-12">
        <button onClick={() => step === 1 ? onNavigate({ name: 'home' }) : setStep(step - 1)}
          className="text-sm flex items-center gap-1.5" style={{ color: C.muted }}>
          <ChevronLeft size={14} /> {step === 1 ? 'Cancelar' : 'Atrás'}
        </button>
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            {[1, 2, 3].map(n => (
              <div key={n} className="w-6 h-1 rounded-full" style={{ background: n <= step ? C.ink : C.line }} />
            ))}
          </div>
          <button
            onClick={() => step < 3 ? setStep(step + 1) : create()}
            disabled={
              creating ||
              (step === 1 && !draft.destino) ||
              (step === 2 && (!draft.fecha_inicio || !draft.fecha_fin)) ||
              (step === 3 && draft.viajeros.length === 0)
            }
            className="px-6 h-11 rounded-full text-sm btn-primary disabled:opacity-40 flex items-center gap-2">
            {creating ? 'Creando…' : (step < 3 ? 'Continuar' : 'Crear viaje')} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function ViajeView({ id, state, setState, onNavigate, onDeleteViaje, onReload }: any) {
  const viaje: Viaje | undefined = state.viajes.find((v: Viaje) => v.id === id)
  const [showGenModal, setShowGenModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [pendingIntencion, setPendingIntencion] = useState<string>('')

  if (!viaje) return <div className="max-w-3xl mx-auto px-6 py-20 text-center" style={{ color: C.muted }}>Viaje no encontrado.</div>

  const travelers = viaje.viajeros.map(tid => state.personas.find((p: Persona) => p.id === tid)).filter(Boolean)
  const total = tripTotal(viaje)
  const isEmpty = viaje.transporte.length === 0 && viaje.alojamientos.length === 0 && viaje.actividades.length === 0 && viaje.gastronomia.length === 0

  const updateLocal = (next: Viaje) => setState((s: AppState) => ({ ...s, viajes: s.viajes.map(v => v.id === viaje.id ? next : v) }))

  const onSelectSingle = async (category: 'transporte' | 'alojamientos', optionId: string) => {
    updateLocal({ ...viaje, [category]: (viaje as any)[category].map((x: any) => ({ ...x, seleccionado: x.id === optionId })) })
    await db.selectSingle(category, viaje.id, optionId)
  }
  const onToggleItem = async (category: 'actividades' | 'gastronomia', optionId: string) => {
    const cur = (viaje as any)[category].find((x: any) => x.id === optionId)
    const next = !cur.seleccionado
    updateLocal({ ...viaje, [category]: (viaje as any)[category].map((x: any) => x.id === optionId ? { ...x, seleccionado: next } : x) })
    await db.toggleItem(category, optionId, next)
  }

  const handleGenerate = async (intencion?: string) => {
    setShowGenModal(false)
    setGenerating(true)
    setGenError(null)
    try {
      await db.generateProposal(viaje.id, intencion)
      await onReload()
    } catch (e: any) {
      setGenError(e.message || 'Error generando propuesta')
    } finally {
      setGenerating(false)
    }
  }

  const openAllBookings = () => {
    const links = [
      ...viaje.transporte.filter(x => x.seleccionado),
      ...viaje.alojamientos.filter(x => x.seleccionado),
      ...viaje.actividades.filter(x => x.seleccionado && x.plataforma !== 'Sin reserva')
    ]
    links.forEach((x, i) => setTimeout(() => { if (x.deeplink) window.open(x.deeplink, '_blank') }, i * 200))
  }

  return (
    <div className="fade-in">
      <div className="relative h-[78vh] min-h-[560px] overflow-hidden">
        <SafeImg src={viaje.cover_img} alt={viaje.destino} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.65) 100%)'
        }} />
        <div className="absolute top-0 left-0 right-0 p-6">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <button onClick={() => onNavigate({ name: 'home' })}
              className="flex items-center gap-1.5 text-sm backdrop-blur-md px-4 h-9 rounded-full"
              style={{ background: 'rgba(255,255,255,0.9)', color: C.ink }}>
              <ChevronLeft size={14} /> Atlas
            </button>
            <button onClick={() => onDeleteViaje(viaje.id)}
              className="flex items-center gap-1.5 text-sm backdrop-blur-md px-4 h-9 rounded-full"
              style={{ background: 'rgba(0,0,0,0.3)', color: 'white' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 pb-14 text-white">
          <div className="max-w-6xl mx-auto">
            <div className="tracking-caps mb-4 opacity-90">{viaje.pais || 'Destino'} · {fmtDate(viaje.fecha_inicio)} — {fmtDate(viaje.fecha_fin)}</div>
            <h1 className="font-display text-[clamp(3rem,10vw,9rem)] leading-[0.95] mb-6">{viaje.destino}</h1>
            {viaje.descripcion_corta && <p className="italic-serif text-2xl max-w-2xl opacity-95 mb-6">{viaje.descripcion_corta}</p>}
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {travelers.map((p: Persona) => (
                  <div key={p.id} className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-base"
                       style={{ background: p.color, color: 'white', borderColor: 'white' }}>{p.avatar}</div>
                ))}
              </div>
              <span className="text-sm opacity-90">{travelers.map((p: Persona) => p.nombre).join(' & ')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-16">
        {isEmpty ? (
          <EmptyProposal viaje={viaje} travelers={travelers}
            onGenerate={(intencion: string) => {
              setPendingIntencion(intencion)
              setShowGenModal(true)
            }}
            error={genError} />
        ) : (
          <>
            {viaje.descripcion_larga && (
              <div className="max-w-2xl mx-auto text-center mb-20">
                <div className="tracking-caps mb-3" style={{ color: C.aegean }}>La propuesta</div>
                <p className="italic-serif text-2xl leading-relaxed" style={{ color: C.inkSoft }}>"{viaje.descripcion_larga}"</p>
              </div>
            )}

            <BlockSection num="I" title="Cómo llegamos" subtitle="Vuelos con precios y horarios" icon={Plane}>
              <div className="space-y-3">
                {viaje.transporte.map((t, i) => (
                  <TransporteRow key={t.id} option={t} onSelect={() => onSelectSingle('transporte', t.id)} index={i} />
                ))}
              </div>
            </BlockSection>

            <BlockSection num="II" title="Dónde dormimos" subtitle={`${nightsBetween(viaje.fecha_inicio, viaje.fecha_fin)} noches entre colinas y rooftops`} icon={HomeIcon}>
              <div className="space-y-6">
                {viaje.alojamientos.map(a => (
                  <AlojamientoCard key={a.id} option={a} onSelect={() => onSelectSingle('alojamientos', a.id)} featured={a.seleccionado} />
                ))}
              </div>
            </BlockSection>

            <BlockSection num="III" title="Qué hacemos" subtitle="Iconos y tesoros secretos" icon={Compass}>
              <div className="grid md:grid-cols-2 gap-5">
                {viaje.actividades.map(a => (
                  <ActividadCard key={a.id} option={a} onSelect={() => onToggleItem('actividades', a.id)} />
                ))}
              </div>
            </BlockSection>

            <BlockSection num="IV" title="Dónde comemos" subtitle="Curados al estilo de quienes viajan" icon={Utensils}>
              <div className="grid md:grid-cols-2 gap-5">
                {viaje.gastronomia.map(g => (
                  <GastronomiaCard key={g.id} option={g} onSelect={() => onToggleItem('gastronomia', g.id)} />
                ))}
              </div>
            </BlockSection>

            <div className="mt-20 rounded-3xl p-10 md:p-14" style={{ background: C.ink, color: C.paper }}>
              <div className="tracking-caps mb-3" style={{ color: C.sand }}>Reservas</div>
              <h2 className="font-display text-5xl mb-3">Todo listo, <span className="italic-serif" style={{ color: C.sand }}>a un clic.</span></h2>
              <p className="text-base mb-10 opacity-80 max-w-xl">
                Estas son las elecciones actuales. Abre los enlaces y ejecuta cada reserva en su plataforma.
              </p>
              <div className="grid md:grid-cols-4 gap-4 mb-10">
                <TotalCell label="Transporte" value={total.transporte} />
                <TotalCell label="Alojamiento" value={total.alojamiento} />
                <TotalCell label="Actividades" value={total.actividades} sub={total.numViajeros > 1 ? `${total.actividadesPorPersona.toLocaleString('es-ES')}€ × ${total.numViajeros} pax` : undefined} />
                <TotalCell label="Total estimado" value={total.total} highlight />
              </div>
              <div className="space-y-2 mb-10">
                {[...viaje.transporte, ...viaje.alojamientos, ...viaje.actividades]
                  .filter((x: any) => x.seleccionado && x.deeplink && x.plataforma !== 'Sin reserva')
                  .map((x: any) => (
                    <a key={x.id} href={x.deeplink} target="_blank" rel="noreferrer"
                      className="flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-colors"
                      style={{ border: `1px solid rgba(247,242,233,0.15)` }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <ExternalLink size={14} style={{ color: C.sand }} />
                        <span className="font-serif text-lg truncate">{x.nombre || x.compania}</span>
                        <span className="text-xs opacity-60">{x.plataforma || x.tipo}</span>
                      </div>
                      <ArrowUpRight size={16} className="opacity-60 flex-shrink-0" />
                    </a>
                  ))}
              </div>
              <button onClick={openAllBookings}
                className="w-full md:w-auto px-8 h-14 rounded-full flex items-center justify-center gap-2 text-base font-medium"
                style={{ background: C.paper, color: C.ink }}>
                <Sparkles size={16} /> Abrir todos los enlaces
              </button>
            </div>
          </>
        )}
      </div>

      {showGenModal && (
        <GenerateModal viaje={viaje} travelers={travelers}
          onCancel={() => setShowGenModal(false)} onConfirm={() => handleGenerate(pendingIntencion)} />
      )}
      {generating && <GeneratingOverlay destino={viaje.destino} />}
    </div>
  )
}
function BlockSection({ num, title, subtitle, icon: Icon, children }: any) {
  return (
    <section className="mb-20">
      <div className="flex items-start justify-between mb-10">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-2xl" style={{ color: C.aegean }}>{num}</span>
          <div>
            <h2 className="font-display text-4xl md:text-5xl leading-none mb-2" style={{ color: C.ink }}>{title}</h2>
            {subtitle && <p className="italic-serif text-lg" style={{ color: C.muted }}>{subtitle}</p>}
          </div>
        </div>
        {Icon && <Icon size={28} strokeWidth={1} style={{ color: C.aegean }} className="hidden md:block" />}
      </div>
      {children}
    </section>
  )
}

function TotalCell({ label, value, sub, highlight }: any) {
  return (
    <div className="p-4 rounded-xl"
         style={{ background: highlight ? C.paper : 'rgba(247,242,233,0.06)', color: highlight ? C.ink : C.paper }}>
      <div className="tracking-caps-sm mb-2" style={{ color: highlight ? C.muted : C.sand, opacity: highlight ? 1 : 0.8 }}>{label}</div>
      <div className="font-display text-3xl">
        {value.toLocaleString('es-ES')}<span className="text-lg opacity-60">€</span>
      </div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  )
}

function TransporteRow({ option, onSelect, index }: any) {
  const sel = option.seleccionado
  return (
    <div className="rounded-2xl p-5 md:p-6 transition-all slide-up"
         style={{ background: sel ? C.ink : C.paperDim, color: sel ? C.paper : C.ink, animationDelay: `${index * 60}ms` }}>
      <div className="grid md:grid-cols-[auto_1fr_auto_auto] gap-5 md:gap-8 items-center">
        <div className="flex items-center gap-3">
          <Plane size={22} strokeWidth={1.2} style={{ color: sel ? C.sand : C.aegean }} />
          <div>
            <div className="font-display text-xl leading-none">{option.compania}</div>
            <div className="text-xs mt-1 opacity-70">{option.numero_ida} · {option.numero_vuelta}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs opacity-60">Ida</div>
            <div className="font-serif text-lg">{option.hora_ida_salida} <span className="opacity-60 text-sm">→ {option.hora_ida_llegada}</span></div>
          </div>
          <div className="flex-1 border-t border-dashed" style={{ borderColor: sel ? 'rgba(247,242,233,0.3)' : C.line }} />
          <div>
            <div className="text-xs opacity-60">Vuelta</div>
            <div className="font-serif text-lg">{option.hora_vuelta_salida} <span className="opacity-60 text-sm">→ {option.hora_vuelta_llegada}</span></div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl">{option.precio}<span className="text-sm opacity-60">€</span></div>
          <div className="text-xs opacity-60">2 pax</div>
        </div>
        <div className="flex gap-2">
          {option.deeplink && (
            <a href={option.deeplink} target="_blank" rel="noreferrer"
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: sel ? 'rgba(247,242,233,0.15)' : C.cream, color: sel ? C.paper : C.ink }}
              onClick={e => e.stopPropagation()}>
              <ExternalLink size={14} />
            </a>
          )}
          <button onClick={onSelect}
            className="px-4 h-10 rounded-full text-sm flex items-center gap-1.5"
            style={{ background: sel ? C.paper : C.ink, color: sel ? C.ink : C.paper }}>
            {sel ? <><Check size={14} /> Elegido</> : 'Elegir'}
          </button>
        </div>
      </div>
      {sel && option.highlights?.length > 0 && (
        <div className="mt-4 pt-4 flex flex-wrap gap-2" style={{ borderTop: `1px solid rgba(247,242,233,0.15)` }}>
          {option.highlights.map((h: string) => (
            <span key={h} className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(247,242,233,0.1)' }}>{h}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function AlojamientoCard({ option, onSelect, featured }: any) {
  return (
    <div className="rounded-3xl overflow-hidden transition-all"
         style={{ background: C.paperDim, border: featured ? `2px solid ${C.ink}` : '2px solid transparent' }}>
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-0">
        <div className="relative aspect-[4/3] md:aspect-auto min-h-[280px]">
          <SafeImg src={option.img} alt={option.nombre} className="absolute inset-0 w-full h-full object-cover" />
          {featured && (
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs tracking-caps-sm flex items-center gap-1"
                 style={{ background: C.paper, color: C.ink }}>
              <Check size={12} strokeWidth={2.5} /> Elegido
            </div>
          )}
          {option.plataforma && (
            <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full text-xs backdrop-blur-md"
                 style={{ background: 'rgba(255,255,255,0.9)', color: C.ink }}>{option.plataforma}</div>
          )}
        </div>
        <div className="p-7 flex flex-col">
          <div className="tracking-caps-sm mb-2" style={{ color: C.aegean }}>{option.barrio}</div>
          <h3 className="font-display text-3xl leading-tight mb-2" style={{ color: C.ink }}>{option.nombre}</h3>
          <div className="text-sm italic mb-4" style={{ color: C.muted }}>{option.tipo}</div>
          {option.rating && (
            <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: C.inkSoft }}>
              <Star size={13} fill={C.gold} strokeWidth={0} />
              <span className="font-serif text-base">{option.rating}</span>
              <span style={{ color: C.muted }}>· {option.reviews?.toLocaleString('es-ES')} reseñas</span>
            </div>
          )}
          <ul className="space-y-1.5 mb-5 flex-1">
            {(option.highlights || []).map((h: string) => (
              <li key={h} className="flex items-start gap-2 text-sm" style={{ color: C.inkSoft }}>
                <div className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ background: C.aegean }} />
                {h}
              </li>
            ))}
          </ul>
          <div className="flex items-end justify-between pt-4 mt-auto" style={{ borderTop: `1px solid ${C.line}` }}>
            <div>
              <div className="font-display text-3xl" style={{ color: C.ink }}>
                {option.precio_noche}<span className="text-sm" style={{ color: C.muted }}>€</span>
                <span className="text-sm ml-1 italic-serif" style={{ color: C.muted }}>/noche</span>
              </div>
              {option.noches && (
                <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                  Total {option.noches} noches: <strong>{(option.precio_noche * option.noches).toLocaleString('es-ES')}€</strong>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {option.deeplink && (
                <a href={option.deeplink} target="_blank" rel="noreferrer"
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: C.cream, color: C.ink }}>
                  <ExternalLink size={14} />
                </a>
              )}
              <button onClick={onSelect}
                className="px-4 h-10 rounded-full text-sm"
                style={{ background: featured ? C.cream : C.ink, color: featured ? C.ink : C.paper }}>
                {featured ? 'Elegido' : 'Elegir'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActividadCard({ option, onSelect }: any) {
  const sel = option.seleccionado
  return (
    <div className="rounded-2xl overflow-hidden transition-all lift" style={{ background: C.paperDim, opacity: sel ? 1 : 0.55 }}>
      <div className="relative aspect-[5/3]">
        <SafeImg src={option.img} alt={option.nombre} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.5) 100%)' }} />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="tracking-caps-sm px-2.5 py-1 rounded-full backdrop-blur-md" style={{ background: 'rgba(255,255,255,0.9)', color: C.ink }}>Día {option.dia}</span>
          <span className="tracking-caps-sm px-2.5 py-1 rounded-full backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.4)', color: 'white' }}>{option.tipo}</span>
        </div>
        <button onClick={onSelect}
          className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all"
          style={{ background: sel ? C.ink : 'rgba(255,255,255,0.9)', color: sel ? C.paper : C.ink }}>
          {sel ? <Check size={15} strokeWidth={2.5} /> : <Plus size={16} strokeWidth={2} />}
        </button>
      </div>
      <div className="p-5">
        <h3 className="font-display text-2xl leading-tight mb-2" style={{ color: C.ink }}>{option.nombre}</h3>
        <p className="text-sm mb-4 leading-relaxed" style={{ color: C.inkSoft }}>{option.descripcion}</p>
        <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-3 text-xs" style={{ color: C.muted }}>
            <span className="flex items-center gap-1"><Clock size={12} /> {option.duracion}</span>
            <span>·</span>
            <span>{option.plataforma}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="font-display text-lg" style={{ color: C.ink }}>{option.precio > 0 ? `${option.precio}€` : 'Gratis'}</div>
            {option.deeplink && (
              <a href={option.deeplink} target="_blank" rel="noreferrer"
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: C.cream, color: C.ink }}
                onClick={e => e.stopPropagation()}>
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GastronomiaCard({ option, onSelect }: any) {
  const sel = option.seleccionado
  return (
    <div className="rounded-2xl overflow-hidden transition-all lift" style={{ background: C.paperDim, opacity: sel ? 1 : 0.55 }}>
      <div className="grid grid-cols-[1fr_1.2fr]">
        <div className="relative min-h-[180px]">
          <SafeImg src={option.img} alt={option.nombre} className="absolute inset-0 w-full h-full object-cover" />
        </div>
        <div className="p-5 flex flex-col">
          <div className="flex items-start justify-between mb-1.5 gap-2">
            <div className="tracking-caps-sm" style={{ color: C.aegean }}>{option.precio_rango}</div>
            <button onClick={onSelect}
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: sel ? C.ink : C.cream, color: sel ? C.paper : C.ink }}>
              {sel ? <Check size={12} strokeWidth={2.5} /> : <Plus size={13} strokeWidth={2} />}
            </button>
          </div>
          <h3 className="font-display text-xl leading-tight mb-1" style={{ color: C.ink }}>{option.nombre}</h3>
          <div className="text-xs italic mb-3" style={{ color: C.muted }}>{option.tipo_cocina} · {option.barrio}</div>
          <p className="text-xs leading-relaxed mb-3 flex-1" style={{ color: C.inkSoft }}>{option.descripcion}</p>
          <div className="flex items-center justify-between text-xs" style={{ color: C.muted }}>
            <span className="flex items-center gap-1">
              <Star size={10} fill={C.gold} strokeWidth={0} />
              <span style={{ color: C.inkSoft }}>{option.rating}</span>
            </span>
            {option.deeplink && (
              <a href={option.deeplink} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline"
                style={{ color: C.ink }} onClick={e => e.stopPropagation()}>
                Reservar <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyProposal({ viaje, travelers, onGenerate, error }: any) {
  const [intencion, setIntencion] = useState(viaje.intencion || '')

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-center">
      <div className="tracking-caps mb-6" style={{ color: C.aegean }}>La propuesta aún no existe</div>
      <h2 className="font-display text-5xl leading-[1.05] mb-8" style={{ color: C.ink }}>
        Un viaje a <span className="italic-serif" style={{ color: C.aegean }}>{viaje.destino}</span>.
        <br /><span className="italic-serif" style={{ color: C.muted }}>Por ahora, solo una idea.</span>
      </h2>
      <p className="text-lg leading-relaxed mb-10" style={{ color: C.inkSoft }}>
        Dejá que la IA lea los perfiles de {travelers.map((p: Persona) => p.nombre).join(' y ')} y
        diseñe una propuesta completa — vuelos, alojamientos, actividades y restaurantes —
        pensada específicamente para ustedes.
      </p>

      <div className="mb-8 text-left">
        <label className="tracking-caps-sm mb-3 block" style={{ color: C.muted }}>
          ¿Algo más que deba saber la IA? <span className="normal-case tracking-normal" style={{ fontWeight: 400 }}>(opcional)</span>
        </label>
        <textarea
          value={intencion}
          onChange={e => setIntencion(e.target.value)}
          rows={4}
          placeholder="Ej: voy un mes pero quiero una semana de vacaciones reales y el resto teletrabajar desde allá. Prefiero alojamiento con buen WiFi y espacio para trabajar…"
          className="w-full bg-white border rounded-2xl p-4 text-base leading-relaxed"
          style={{ borderColor: C.line, color: C.inkSoft }}
        />
        <p className="text-xs mt-2" style={{ color: C.muted }}>
          Tipo de viaje, ritmo, prioridades, restricciones. Cualquier cosa que ayude a la IA a personalizar.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl text-sm text-left"
             style={{ background: '#F5DDD4', color: '#7A2E1E' }}>
          <strong>Algo falló:</strong> {error}
        </div>
      )}

      <button onClick={() => onGenerate(intencion)}
        className="px-8 h-14 rounded-full inline-flex items-center gap-2 text-base btn-primary">
        <Sparkles size={18} /> Soñar este viaje
      </button>
      <p className="text-xs mt-6" style={{ color: C.muted }}>
        Tarda unos 30 segundos. Podés ajustar todo después.
      </p>
    </div>
  )
}

function GenerateModal({ viaje, travelers, onCancel, onConfirm }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 fade-in"
         style={{ background: 'rgba(11,30,42,0.6)', backdropFilter: 'blur(8px)' }}
         onClick={onCancel}>
      <div className="max-w-md w-full rounded-3xl p-8 slide-up"
           style={{ background: C.paper }}
           onClick={e => e.stopPropagation()}>
        <div className="tracking-caps mb-3" style={{ color: C.aegean }}>Generar con IA</div>
        <h3 className="font-display text-3xl mb-5 leading-tight" style={{ color: C.ink }}>
          ¿Soñamos <span className="italic-serif" style={{ color: C.aegean }}>{viaje.destino}</span>?
        </h3>
        <p className="mb-2 leading-relaxed" style={{ color: C.inkSoft }}>
          Voy a generar una propuesta completa para <strong>{viaje.destino}</strong>{' '}
          del {fmtDateShort(viaje.fecha_inicio)} al {fmtDateShort(viaje.fecha_fin)}{' '}
          para {travelers.map((p: Persona) => p.nombre).join(' y ')}.
        </p>
        <p className="text-sm mb-8" style={{ color: C.muted }}>
          3 vuelos · 3 alojamientos · 6 actividades · 6 restaurantes. Tarda unos 30 segundos.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 h-11 rounded-full btn-ghost border"
            style={{ borderColor: C.line }}>
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 h-11 rounded-full btn-primary flex items-center justify-center gap-2">
            <Sparkles size={14} /> Empezar a soñar
          </button>
        </div>
      </div>
    </div>
  )
}

function GeneratingOverlay({ destino }: { destino: string }) {
  const phrases = [
    `Soñando con ${destino}`,
    `Imaginando los mejores rincones`,
    `Buscando vuelos y horarios`,
    `Curando los alojamientos`,
    `Pensando actividades a medida`,
    `Seleccionando los restaurantes`,
    `Cerrando los últimos detalles`
  ]
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % phrases.length), 3500)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
         style={{ background: 'rgba(11,30,42,0.96)', backdropFilter: 'blur(20px)' }}>
      <div className="text-center max-w-2xl">
        <div className="tracking-caps mb-8" style={{ color: C.sand }}>La IA está imaginando</div>
        <div className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.05] fade-in"
             key={i}
             style={{ color: C.paper, fontWeight: 800 }}>
          <span className="italic-serif">{phrases[i]}</span>
          <span className="animate-pulse">…</span>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [state, setState] = useState<AppState>({ personas: [], relaciones: [], viajes: [] })
  const [view, setView] = useState<View>({ name: 'home' })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingAuth(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    db.loadAll().then(s => { setState(s); setLoaded(true) }).catch(console.error)
  }, [session])

  const reload = async () => {
    const s = await db.loadAll()
    setState(s)
  }

  const handleSavePersona = async (p: Persona, isNew: boolean) => {
    await db.savePersona(p, isNew)
    await reload()
  }
  const handleDeletePersona = async (id: string) => {
    await db.deletePersona(id)
    await reload()
  }
  const handleCreateViaje = async (draft: any): Promise<string> => {
    const newId = await db.createViaje(draft, draft.viajeros)
    await reload()
    return newId
  }
  const handleDeleteViaje = async (id: string) => {
    if (!confirm('¿Eliminar este viaje?')) return
    await db.deleteViaje(id)
    setView({ name: 'home' })
    await reload()
  }
  const handleLogout = async () => { await supabase.auth.signOut() }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.paper }}>
        <style>{fontStyles}</style>
        <div className="font-display italic text-4xl" style={{ color: C.muted, fontWeight: 650 }}>soñando…</div>
      </div>
    )
  }

  if (!session) return <LoginView />

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.paper }}>
        <style>{fontStyles}</style>
        <div className="font-display italic text-4xl" style={{ color: C.muted, fontWeight: 650 }}>soñando…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: C.paper, color: C.ink }}>
      <style>{fontStyles}</style>
      {view.name !== 'viaje' && <TopBar view={view} onNavigate={setView} userEmail={session.user?.email} onLogout={handleLogout} />}
      {view.name === 'home' && <HomeView state={state} onNavigate={setView} />}
      {view.name === 'personas' && <PersonasListView state={state} onNavigate={setView} />}
      {view.name === 'persona' && <PersonaView id={view.id} state={state} onSave={handleSavePersona} onDelete={handleDeletePersona} onNavigate={setView} />}
      {view.name === 'nuevo' && <NuevoViajeView state={state} onCreate={handleCreateViaje} onNavigate={setView} />}
      {view.name === 'viaje' && <ViajeView id={view.id} state={state} setState={setState} onNavigate={setView} onDeleteViaje={handleDeleteViaje} onReload={reload} />}
    </div>
  )
}
