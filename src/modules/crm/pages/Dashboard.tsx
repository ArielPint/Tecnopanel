import { useEffect, useState } from 'react'
import { Briefcase, Target, CheckCircle2, TrendingUp, Clock, ArrowUpRight } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/modules/crm/contexts/AuthContext'
import type { Oportunidad, OportunidadHistorialEtapa } from '@/modules/crm/types/database'
import { fmtMontoCLP as fmtCLP } from '@/lib/montoCLP'

const ETAPAS = [
  'Clasificación','Oportunidad','Ingeniería','Desarrollo','Costos y Presupuestos',
  'Ventas','Negociación',
]

// Las oportunidades VIT no pasan por Ingenieria, Desarrollo, Costos y Presupuestos ni Ventas.
const ETAPAS_VIT = ['Clasificación','Oportunidad','Negociación']

const ETAPA_COLORS: Record<string, string> = {
  'Clasificación':          '#64748b',
  'Oportunidad':            '#10b981',
  'Ingeniería':             '#3b82f6',
  'Desarrollo':             '#8b5cf6',
  'Costos y Presupuestos':  '#f97316',
  'Ventas':      '#f59e0b',
  'Negociación':            '#ef4444',
}

const TIPO_COLOR: Record<string,string> = {
  Proyecto: 'bg-purple-100 text-purple-700',
  Producto: 'bg-blue-100 text-blue-700',
  Kit: 'bg-amber-100 text-amber-700',
  VIT: 'bg-emerald-100 text-emerald-700',
}

const TIPO_VENTA_LABELS: Record<string, string> = {
  Proyecto: 'Proyecto',
  Producto: 'Venta Directa',
  Kit: 'Viviendas Industrializadas',
  VIT: 'VIT',
}

interface Notif {
  id: string
  tipo: string
  titulo: string
  mensaje: string | null
  created_at: string
}

function fmtFull(n: number) {
  return '$' + n.toLocaleString('es-CL')
}

function diffDias(from: string, to: string | null) {
  return Math.max(0, Math.floor(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 86400000))
}

function tiempoRel(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ayer' : `hace ${d}d`
}

const NOTIF_ICON: Record<string, string> = {
  oportunidad_nueva: '📋',
  etapa_cambio: '→',
  asignacion: '👤',
  estado_final: '✓',
}

/* Los KPIs se calculan sobre un subconjunto de oportunidades para poder mostrar
   VIT y Tradicional por separado sin duplicar la logica. */
function calcStats(opps: Oportunidad[], etapas: string[]) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const activas = opps.filter(o => !['Ganado','Perdido'].includes(o.etapa_actual))
  const pipelineMonto = activas.reduce((s, o) => s + (o.monto_estimado ?? 0), 0)
  const pipelineLastMonth = opps
    .filter(o => !['Ganado','Perdido'].includes(o.etapa_actual) && new Date(o.created_at) < startOfMonth && new Date(o.created_at) >= startOfLastMonth)
    .reduce((s, o) => s + (o.monto_estimado ?? 0), 0)
  const pipelineTrend = pipelineLastMonth > 0 ? Math.round(((pipelineMonto - pipelineLastMonth) / pipelineLastMonth) * 100) : null

  const ganadasMes = opps.filter(o => o.etapa_actual === 'Ganado' && new Date(o.updated_at) >= startOfMonth)
  const ganadasMesMonto = ganadasMes.reduce((s, o) => s + (o.monto_estimado ?? 0), 0)

  const ganadas = opps.filter(o => o.etapa_actual === 'Ganado')
  const perdidas = opps.filter(o => o.etapa_actual === 'Perdido')
  const tasaConv = (ganadas.length + perdidas.length) > 0
    ? Math.round(ganadas.length / (ganadas.length + perdidas.length) * 100)
    : 0

  const montoByEtapa: Record<string, number> = {}
  const countByEtapa: Record<string, number> = {}
  etapas.forEach(e => {
    const subset = activas.filter(o => o.etapa_actual === e)
    countByEtapa[e] = subset.length
    montoByEtapa[e] = subset.reduce((s, o) => s + (o.monto_estimado ?? 0), 0)
  })
  const maxMonto = Math.max(...Object.values(montoByEtapa), 1)

  return { activas, pipelineMonto, pipelineTrend, ganadasMes, ganadasMesMonto, tasaConv, montoByEtapa, countByEtapa, maxMonto }
}

function promedioDias(hist: OportunidadHistorialEtapa[]): Record<string, number> {
  const porEtapa: Record<string, number[]> = {}
  hist.forEach(h => {
    if (!porEtapa[h.etapa]) porEtapa[h.etapa] = []
    porEtapa[h.etapa].push(diffDias(h.fecha_entrada, h.fecha_salida))
  })
  const avg: Record<string, number> = {}
  Object.entries(porEtapa).forEach(([e, vals]) => {
    avg[e] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  })
  return avg
}

function SeccionPipeline({ titulo, opps, hist, etapas = ETAPAS }: { titulo: string; opps: Oportunidad[]; hist: OportunidadHistorialEtapa[]; etapas?: string[] }) {
  const st = calcStats(opps, etapas)
  const avgDias = promedioDias(hist)

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{titulo}</h2>
        <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">{st.activas.length} activas</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Pipeline Total</p>
            <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Briefcase size={16} className="text-slate-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-800 truncate" title={fmtFull(st.pipelineMonto)}>{fmtCLP(st.pipelineMonto)}</p>
          {st.pipelineTrend !== null ? (
            <p className={`text-xs mt-1.5 flex items-center gap-0.5 ${st.pipelineTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              <ArrowUpRight size={11} className={st.pipelineTrend < 0 ? 'rotate-180' : ''} />
              {Math.abs(st.pipelineTrend)}% vs mes anterior
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1.5">Monto en pipeline activo</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Oport. Activas</p>
            <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Target size={16} className="text-red-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-800">{st.activas.length}</p>
          <p className="text-xs text-gray-400 mt-1.5">En pipeline activo</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Ganados (mes)</p>
            <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={16} className="text-emerald-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-800 truncate" title={fmtFull(st.ganadasMesMonto)}>{st.ganadasMesMonto > 0 ? fmtCLP(st.ganadasMesMonto) : st.ganadasMes.length}</p>
          <p className="text-xs text-emerald-600 mt-1.5">{st.ganadasMes.length} oportunidad{st.ganadasMes.length !== 1 ? 'es' : ''} cerrada{st.ganadasMes.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Tasa Conversion</p>
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <TrendingUp size={16} className="text-blue-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-800">{st.tasaConv}%</p>
          <p className="text-xs text-gray-400 mt-1.5">Ganadas vs cerradas totales</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-5">Pipeline por Etapa</h3>
        <div className="space-y-3.5">
          {etapas.map(etapa => (
            <div key={etapa} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-24 sm:w-40 truncate flex-shrink-0">{etapa}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                <div
                  className="h-4 rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max((st.montoByEtapa[etapa] ?? 0) / st.maxMonto * 100, st.montoByEtapa[etapa] ? 4 : 0)}%`,
                    background: ETAPA_COLORS[etapa] ?? '#64748b',
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-700 w-24 text-right flex-shrink-0 whitespace-nowrap" title={fmtFull(st.montoByEtapa[etapa] ?? 0)}>
                {fmtCLP(st.montoByEtapa[etapa] ?? 0)}
              </span>
              <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">
                {st.countByEtapa[etapa] ?? 0}
              </span>
              {avgDias[etapa] !== undefined && (
                <span className="text-xs text-gray-300 w-14 text-right flex-shrink-0 hidden xl:block">
                  {avgDias[etapa]}d prom.
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [opps, setOpps] = useState<Oportunidad[]>([])
  const [hist, setHist] = useState<OportunidadHistorialEtapa[]>([])
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: rawOpps }, { data: rawHist }, { data: rawNotifs }] = await Promise.all([
        supabase.from('oportunidades').select('*,cliente:clientes(razon_social),vendedor:profiles(nombre,apellido)'),
        supabase.from('oportunidad_historial_etapas').select('*'),
        supabase.from('notifications').select('id,tipo,titulo,mensaje,created_at').order('created_at',{ascending:false}).limit(10),
      ])
      setOpps((rawOpps as Oportunidad[]) ?? [])
      setHist((rawHist as OportunidadHistorialEtapa[]) ?? [])
      setNotifs((rawNotifs as Notif[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const oppsVit = opps.filter(o => o.tipo_venta === 'VIT')
  const oppsTrad = opps.filter(o => o.tipo_venta !== 'VIT')
  const idsVit = new Set(oppsVit.map(o => o.id))

  const avgDias = promedioDias(hist)

  /* ── Actividad reciente: notificaciones + historial como fallback ──
     Solo admin y gerente_ventas ven la actividad de todos; el resto, solo la propia. */
  const veTodo = profile?.rol === 'admin' || profile?.rol === 'gerente_ventas'
  const actReciente = notifs.length >= 3 ? notifs : [
    ...notifs,
    ...hist
      .filter(h => veTodo || h.usuario_id === profile?.id)
      .sort((a, b) => new Date(b.fecha_entrada).getTime() - new Date(a.fecha_entrada).getTime())
      .slice(0, 8 - notifs.length)
      .map(h => ({
        id: h.id,
        tipo: 'etapa_cambio',
        titulo: `Movimiento a ${h.etapa}`,
        mensaje: null,
        created_at: h.fecha_entrada,
      })),
  ].slice(0, 8)

  /* ── Oportunidades recientes ── */
  const oppsRecientes = [...opps]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-crm-red border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <p className="text-sm text-gray-500">
        Bienvenido, <span className="font-semibold text-gray-700">{profile?.nombre} {profile?.apellido}</span>
      </p>

      <SeccionPipeline titulo="Oportunidades VIT" opps={oppsVit} hist={hist.filter(h => idsVit.has(h.oportunidad_id))} etapas={ETAPAS_VIT} />
      <SeccionPipeline titulo="Oportunidades Tradicional" opps={oppsTrad} hist={hist.filter(h => !idsVit.has(h.oportunidad_id))} />

      {/* Actividad reciente */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Actividad Reciente</h2>
        {actReciente.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Sin actividad reciente</p>
        ) : (
          <div className="space-y-1">
            {actReciente.map(n => (
              <div key={n.id} className="flex gap-2.5 py-2.5 border-b border-slate-50 last:border-0">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                  {NOTIF_ICON[n.tipo] ?? '📌'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 leading-snug">{n.titulo}</p>
                  {n.mensaje && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{n.mensaje}</p>}
                  <p className="text-[10px] text-gray-300 mt-0.5">{tiempoRel(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tiempo promedio por etapa */}
      {Object.keys(avgDias).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Clock size={15} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Tiempo promedio por etapa (días)</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {ETAPAS.map(etapa => avgDias[etapa] !== undefined && (
              <div key={etapa} className="rounded-lg p-4 text-center bg-slate-50 border border-slate-200">
                <p className="text-2xl font-bold" style={{ color: ETAPA_COLORS[etapa] }}>{avgDias[etapa]}</p>
                <p className="text-[11px] text-gray-400 mt-1 leading-tight">{etapa}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Oportunidades recientes */}
      {oppsRecientes.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Oportunidades Recientes</h2>
            <a href="/crm/oportunidades/tradicional" className="text-xs text-crm-red hover:underline font-medium">Ver todas →</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Oportunidad</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Etapa</th>
                  <th className="text-right px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Importe / Prob.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {oppsRecientes.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <p className="text-sm font-medium text-gray-800 truncate max-w-[180px]">{o.nombre}</p>
                      <p className="text-[11px] text-gray-400 font-mono">{o.codigo}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-600 truncate max-w-[140px]">
                      {o.cliente ? (o.cliente as { razon_social: string }).razon_social : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${TIPO_COLOR[o.tipo_venta] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TIPO_VENTA_LABELS[o.tipo_venta] ?? o.tipo_venta}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium text-white"
                        style={{ background: ETAPA_COLORS[o.etapa_actual] ?? '#64748b' }}>
                        {o.etapa_actual}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {o.monto_estimado != null && (
                        <p className="text-sm font-bold text-gray-700">{fmtFull(o.monto_estimado)}</p>
                      )}
                      <div className="flex items-center justify-end gap-2 mt-1">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-crm-red" style={{ width: `${o.probabilidad}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-400">{o.probabilidad}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
