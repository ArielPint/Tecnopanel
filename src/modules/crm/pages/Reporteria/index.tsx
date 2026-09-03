import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Clock, Timer, Users, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { handleSupabaseError } from '@/modules/crm/lib/errors'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { fmtMontoCLP } from '@/lib/montoCLP'
import type {
  Oportunidad, OportunidadHistorialEtapa, TareaIngenieria, PerfilBasico,
} from '@/modules/crm/types/database'
import {
  diasOportunidad, esTerminal, etapaDeTarea, porEtapa, porVendedor,
  resumenOportunidades, responsablesDeEtapa, tareasPorAsignado, tendenciaMensual,
} from '@/modules/crm/lib/metricas'

const ETAPAS_ORDEN = [
  'Clasificación', 'Oportunidad', 'Ingeniería', 'Desarrollo',
  'Costos y Presupuestos', 'Ventas', 'Negociación', 'Ganado', 'Perdido',
]

const ETAPA_COLORS: Record<string, string> = {
  'Clasificación': '#64748b',
  'Oportunidad': '#10b981',
  'Ingeniería': '#3b82f6',
  'Desarrollo': '#8b5cf6',
  'Costos y Presupuestos': '#f97316',
  'Ventas': '#f59e0b',
  'Negociación': '#ef4444',
  'Ganado': '#22c55e',
  'Perdido': '#94a3b8',
}

const RANGOS = [
  { key: '3m', label: '3 meses', meses: 3 },
  { key: '6m', label: '6 meses', meses: 6 },
  { key: '12m', label: '12 meses', meses: 12 },
  { key: 'todo', label: 'Todo', meses: 0 },
] as const

const TIPOS = [
  { key: 'todos', label: 'Todos' },
  { key: 'tradicional', label: 'Tradicional' },
  { key: 'vit', label: 'VIT' },
] as const

type RangoKey = (typeof RANGOS)[number]['key']
type TipoKey = (typeof TIPOS)[number]['key']

const dLbl = (n: number | null) => (n == null ? '—' : `${n}d`)

function Kpi({ label, valor, detalle, icon, color = '#64748b' }: {
  label: string; valor: string; detalle: string; icon: React.ReactNode; color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + '1a', color }}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-800">{valor}</p>
      <p className="text-xs text-gray-400 mt-1.5">{detalle}</p>
    </div>
  )
}

function Card({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-700">{titulo}</h2>
      {subtitulo && <p className="text-[11px] text-gray-400 mt-0.5">{subtitulo}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

export default function Reporteria() {
  const navigate = useNavigate()
  const [opps, setOpps] = useState<Oportunidad[]>([])
  const [hist, setHist] = useState<OportunidadHistorialEtapa[]>([])
  const [tareas, setTareas] = useState<TareaIngenieria[]>([])
  const [asigs, setAsigs] = useState<{ tarea_id: string; usuario_id: string }[]>([])
  const [perfiles, setPerfiles] = useState<PerfilBasico[]>([])
  const [loading, setLoading] = useState(true)
  const [rango, setRango] = useState<RangoKey>('12m')
  const [tipo, setTipo] = useState<TipoKey>('todos')
  const [etapaAbierta, setEtapaAbierta] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [oppsRes, histRes, tareasRes, asigsRes, perfilesRes] = await Promise.all([
        supabase.from('oportunidades').select('*, cliente:clientes(razon_social)'),
        supabase.from('oportunidad_historial_etapas').select('*'),
        supabase.from('tareas_ingenieria').select('*'),
        supabase.from('tarea_asignaciones').select('tarea_id,usuario_id'),
        supabase.from('crm_perfiles_basicos').select('id,nombre,apellido,rol,activo'),
      ])
      handleSupabaseError(oppsRes.error, 'Reporteria.oportunidades')
      handleSupabaseError(histRes.error, 'Reporteria.historial')
      handleSupabaseError(tareasRes.error, 'Reporteria.tareas')
      handleSupabaseError(asigsRes.error, 'Reporteria.asignaciones')
      handleSupabaseError(perfilesRes.error, 'Reporteria.perfiles')
      setOpps((oppsRes.data as Oportunidad[]) ?? [])
      setHist((histRes.data as OportunidadHistorialEtapa[]) ?? [])
      setTareas((tareasRes.data as TareaIngenieria[]) ?? [])
      setAsigs(asigsRes.data ?? [])
      setPerfiles((perfilesRes.data as PerfilBasico[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const nombreDe = useMemo(() => {
    const m = new Map(perfiles.map((p) => [p.id, `${p.nombre} ${p.apellido}`.trim()]))
    return (id: string | null) => (id ? m.get(id) ?? 'Usuario dado de baja' : 'Sin responsable')
  }, [perfiles])

  const asignacionesPorTarea = useMemo(() => {
    const m = new Map<string, string[]>()
    asigs.forEach((a) => {
      const arr = m.get(a.tarea_id)
      if (arr) arr.push(a.usuario_id)
      else m.set(a.tarea_id, [a.usuario_id])
    })
    return m
  }, [asigs])

  /* El filtro se aplica sobre las oportunidades (por fecha de creacion y tipo de venta) y
     todo lo demas — historial, tareas — se recorta a ese conjunto. */
  const filtro = useMemo(() => {
    const meses = RANGOS.find((r) => r.key === rango)?.meses ?? 0
    const desde = meses ? new Date(Date.now() - meses * 30 * 86400000).toISOString() : null
    const oppsF = opps.filter((o) => {
      if (desde && o.created_at < desde) return false
      if (tipo === 'vit') return o.tipo_venta === 'VIT'
      if (tipo === 'tradicional') return o.tipo_venta !== 'VIT'
      return true
    })
    const ids = new Set(oppsF.map((o) => o.id))
    const histF = hist.filter((h) => ids.has(h.oportunidad_id))
    const tareasF = tareas.filter((t) => ids.has(t.oportunidad_id))
    return { opps: oppsF, hist: histF, tareas: tareasF }
  }, [opps, hist, tareas, rango, tipo])

  const resumen = useMemo(() => resumenOportunidades(filtro.opps), [filtro.opps])
  const etapas = useMemo(() => porEtapa(filtro.hist, ETAPAS_ORDEN), [filtro.hist])
  const vendedores = useMemo(() => porVendedor(filtro.opps), [filtro.opps])
  const tendencia = useMemo(() => tendenciaMensual(filtro.opps), [filtro.opps])
  const tareasGlobal = useMemo(() => tareasPorAsignado(filtro.tareas, asignacionesPorTarea), [filtro.tareas, asignacionesPorTarea])

  /* Cada tarea se atribuye a la etapa en que estaba su oportunidad al crearse (ver
     etapaDeTarea): la tabla de tareas por etapa sale de ese corte. */
  const tareasDeEtapa = useMemo(() => {
    const m = new Map<string, TareaIngenieria[]>()
    filtro.tareas.forEach((t) => {
      const e = etapaDeTarea(t, filtro.hist)
      if (!e) return
      const arr = m.get(e)
      if (arr) arr.push(t)
      else m.set(e, [t])
    })
    return m
  }, [filtro.tareas, filtro.hist])

  const lentas = useMemo(
    () => filtro.opps.filter((o) => !esTerminal(o)).sort((a, b) => diasOportunidad(b) - diasOportunidad(a)).slice(0, 12),
    [filtro.opps],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-crm-red border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const dataEtapas = etapas.filter((e) => !['Ganado', 'Perdido'].includes(e.etapa))
  const dataVendedores = vendedores.filter((v) => v.cicloProm != null || v.antiguedadActivas != null)

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Reportería</h1>
          <IndicadoresFecha />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            {RANGOS.map((r) => (
              <button key={r.key} onClick={() => setRango(r.key)}
                className={'px-3 py-1.5 text-xs font-medium transition-colors ' + (rango === r.key ? 'bg-crm-red text-white' : 'text-gray-500 hover:bg-slate-50')}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            {TIPOS.map((t) => (
              <button key={t.key} onClick={() => setTipo(t.key)}
                className={'px-3 py-1.5 text-xs font-medium transition-colors ' + (tipo === t.key ? 'bg-crm-red text-white' : 'text-gray-500 hover:bg-slate-50')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tiempo de oportunidad ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Ciclo promedio" valor={dLbl(resumen.cicloProm)} color="#3b82f6" icon={<Timer size={16} />}
          detalle={`${resumen.ganadas + resumen.perdidas} oportunidades cerradas · mediana ${dLbl(resumen.cicloMediana)}`} />
        <Kpi label="Ciclo ganadas" valor={dLbl(resumen.cicloPromGanadas)} color="#22c55e" icon={<Timer size={16} />}
          detalle={`${resumen.ganadas} ganadas en el período`} />
        <Kpi label="Ciclo perdidas" valor={dLbl(resumen.cicloPromPerdidas)} color="#ef4444" icon={<Timer size={16} />}
          detalle={`${resumen.perdidas} perdidas en el período`} />
        <Kpi label="Antigüedad activas" valor={dLbl(resumen.antiguedadPromActivas)} color="#f59e0b" icon={<Clock size={16} />}
          detalle={`${resumen.activas} activas de ${resumen.total} totales`} />
      </div>

      {/* ── Tendencias ── */}
      <Card titulo="Tendencia mensual"
        subtitulo="Creadas y cerradas por mes; la línea es el ciclo promedio de lo cerrado en ese mes">
        {tendencia.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Sin datos en el período</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={tendencia} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="n" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <YAxis yAxisId="d" orientation="right" tickFormatter={(v) => `${v}d`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="n" dataKey="creadas" name="Creadas" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="n" dataKey="ganadas" name="Ganadas" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="n" dataKey="cerradas" name="Cerradas" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
              <Line yAxisId="d" type="monotone" dataKey="cicloProm" name="Ciclo prom. (días)" stroke="#ef4444" strokeWidth={2} dot connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Tiempo por etapa ── */}
      <Card titulo="Promedio de días por etapa" subtitulo="Cada paso por la etapa cuenta como un tramo; los tramos abiertos se miden hasta hoy">
        {dataEtapas.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Sin historial en el período</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dataEtapas} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="etapa" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} angle={-25} textAnchor="end" height={64} interval={0} />
              <YAxis tickFormatter={(v) => `${v}d`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: unknown) => [`${v} días`, 'Promedio']} />
              <Bar dataKey="promDias" radius={[3, 3, 0, 0]}>
                {dataEtapas.map((e) => <Cell key={e.etapa} fill={ETAPA_COLORS[e.etapa] ?? '#64748b'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card titulo="Detalle por etapa" subtitulo="Abrí una etapa para ver responsables y tareas asignadas">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                <th className="text-left px-3 py-2">Etapa</th>
                <th className="text-right px-3 py-2">Tramos</th>
                <th className="text-right px-3 py-2">En curso</th>
                <th className="text-right px-3 py-2">Prom.</th>
                <th className="text-right px-3 py-2">Mediana</th>
                <th className="text-right px-3 py-2">Máx.</th>
                <th className="text-right px-3 py-2">Tareas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {etapas.map((e) => {
                const abierta = etapaAbierta === e.etapa
                const tsEtapa = tareasDeEtapa.get(e.etapa) ?? []
                return [
                  <tr key={e.etapa} onClick={() => setEtapaAbierta(abierta ? null : e.etapa)}
                    className="hover:bg-slate-50 cursor-pointer">
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        {abierta ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ETAPA_COLORS[e.etapa] ?? '#64748b' }} />
                        <span className="text-xs font-medium text-gray-700">{e.etapa}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-600">{e.tramos}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-600">{e.enCurso}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-800">{dLbl(e.promDias)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-600">{dLbl(e.medianaDias)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-400">{dLbl(e.maxDias)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-600">{tsEtapa.length || '—'}</td>
                  </tr>,
                  abierta && (
                    <tr key={e.etapa + '-detalle'} className="bg-slate-50/60">
                      <td colSpan={7} className="px-3 py-4">
                        <div className="grid gap-5 lg:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Responsables</p>
                            {responsablesDeEtapa(filtro.hist, e.etapa).length === 0 ? (
                              <p className="text-xs text-gray-400">Sin registros</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead><tr className="text-[10px] text-gray-400 uppercase">
                                  <th className="text-left py-1">Responsable</th>
                                  <th className="text-right py-1">Tramos</th>
                                  <th className="text-right py-1">Prom.</th>
                                  <th className="text-right py-1">Máx.</th>
                                </tr></thead>
                                <tbody>
                                  {responsablesDeEtapa(filtro.hist, e.etapa).map((r) => (
                                    <tr key={r.usuarioId ?? 'sin'} className="border-t border-slate-200/70">
                                      <td className="py-1.5 text-gray-700">{nombreDe(r.usuarioId)}</td>
                                      <td className="py-1.5 text-right text-gray-600">{r.tramos}</td>
                                      <td className="py-1.5 text-right font-semibold text-gray-800">{dLbl(r.promDias)}</td>
                                      <td className="py-1.5 text-right text-gray-400">{dLbl(r.maxDias)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Tareas asignadas</p>
                            {tareasPorAsignado(tsEtapa, asignacionesPorTarea).length === 0 ? (
                              <p className="text-xs text-gray-400">Sin tareas en esta etapa</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead><tr className="text-[10px] text-gray-400 uppercase">
                                  <th className="text-left py-1">Asignado</th>
                                  <th className="text-right py-1">Total</th>
                                  <th className="text-right py-1">Abiertas</th>
                                  <th className="text-right py-1">Resol.</th>
                                  <th className="text-right py-1">Vencidas</th>
                                </tr></thead>
                                <tbody>
                                  {tareasPorAsignado(tsEtapa, asignacionesPorTarea).map((t) => (
                                    <tr key={t.usuarioId} className="border-t border-slate-200/70">
                                      <td className="py-1.5 text-gray-700">{nombreDe(t.usuarioId)}</td>
                                      <td className="py-1.5 text-right text-gray-600">{t.total}</td>
                                      <td className="py-1.5 text-right text-gray-600">{t.abiertas}</td>
                                      <td className="py-1.5 text-right font-semibold text-gray-800">{dLbl(t.promDiasResolucion)}</td>
                                      <td className={'py-1.5 text-right ' + (t.vencidas ? 'text-red-600 font-semibold' : 'text-gray-400')}>{t.vencidas}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Tiempo por vendedor ── */}
      <Card titulo="Tiempo por vendedor" subtitulo="Ciclo promedio de lo cerrado y antigüedad de lo que sigue abierto">
        {dataVendedores.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Sin oportunidades en el período</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(180, dataVendedores.length * 34 + 60)}>
              <BarChart data={dataVendedores.map((v) => ({ ...v, nombre: nombreDe(v.vendedorId) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => `${v}d`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={130} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: unknown, n) => [`${v ?? '—'} días`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="cicloProm" name="Ciclo cerradas" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                <Bar dataKey="antiguedadActivas" name="Antigüedad activas" fill="#f59e0b" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-3 py-2">Vendedor</th>
                    <th className="text-right px-3 py-2">Total</th>
                    <th className="text-right px-3 py-2">Activas</th>
                    <th className="text-right px-3 py-2">Ganadas</th>
                    <th className="text-right px-3 py-2">Perdidas</th>
                    <th className="text-right px-3 py-2">Conv.</th>
                    <th className="text-right px-3 py-2">Ciclo</th>
                    <th className="text-right px-3 py-2">Antig.</th>
                    <th className="text-right px-3 py-2">Ganado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {vendedores.map((v) => (
                    <tr key={v.vendedorId ?? 'sin'} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-700">{nombreDe(v.vendedorId)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600">{v.total}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600">{v.activas}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-emerald-600">{v.ganadas}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-red-500">{v.perdidas}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600">{v.tasaConv == null ? '—' : `${v.tasaConv}%`}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-800">{dLbl(v.cicloProm)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-500">{dLbl(v.antiguedadActivas)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-700">{v.montoGanado ? fmtMontoCLP(v.montoGanado) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* ── Tareas asignadas (global) ── */}
      <Card titulo="Tareas asignadas" subtitulo="Carga y tiempo de resolución por persona, sobre todas las etapas del período">
        {tareasGlobal.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Sin tareas en el período</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-3 py-2">Asignado</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Abiertas</th>
                  <th className="text-right px-3 py-2">Completadas</th>
                  <th className="text-right px-3 py-2">Rechazadas</th>
                  <th className="text-right px-3 py-2">Prom. resolución</th>
                  <th className="text-right px-3 py-2">Vencidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tareasGlobal.map((t) => (
                  <tr key={t.usuarioId} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      <Users size={12} className="text-gray-300" />{nombreDe(t.usuarioId)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-600">{t.total}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-600">{t.abiertas}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-emerald-600">{t.completadas}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-red-500">{t.rechazadas}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-800">{dLbl(t.promDiasResolucion)}</td>
                    <td className={'px-3 py-2.5 text-right text-xs ' + (t.vencidas ? 'text-red-600 font-semibold' : 'text-gray-400')}>{t.vencidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Oportunidades más antiguas ── */}
      <Card titulo="Oportunidades activas más antiguas" subtitulo="Las que llevan más días abiertas — click para abrirlas">
        {lentas.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Sin oportunidades activas en el período</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-3 py-2">Oportunidad</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Etapa</th>
                  <th className="text-right px-3 py-2">Días abierta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lentas.map((o) => {
                  const d = diasOportunidad(o)
                  return (
                    <tr key={o.id} onClick={() => navigate(`/crm/oportunidad/${o.id}`)}
                      tabIndex={0} role="button" title={`Abrir ${o.codigo}`}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') navigate(`/crm/oportunidad/${o.id}`) }}
                      className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-medium text-gray-800 truncate max-w-[220px]">{o.nombre}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{o.codigo}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[160px]">{o.cliente?.razon_social ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
                          style={{ background: ETAPA_COLORS[o.etapa_actual] ?? '#64748b' }}>{o.etapa_actual}</span>
                      </td>
                      <td className={'px-3 py-2.5 text-right text-xs font-semibold ' + (d > 180 ? 'text-red-600' : 'text-gray-800')}>
                        <span className="inline-flex items-center gap-1">{d > 180 && <AlertTriangle size={11} />}{d}d</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
