import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { useCurvaData } from '../hooks/useCurvaData'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmt, fmtDate, fmtPr } from '../lib/format'
import { CurvaSChart, GalponBarChart, ModulosLineChart, TiempoTorreChart } from '../components/CurvaCharts'
import { cn } from '@/lib/utils'

const SECCIONES = [
  { key: 'kpis', label: 'Indicadores' },
  { key: 'curvaS', label: 'Curva S' },
  { key: 'modIniciados', label: 'Módulos iniciados' },
  { key: 'modTerminados', label: 'Módulos terminados' },
  { key: 'galpon', label: 'Salida galpón' },
  { key: 'tiempoTorre', label: 'Tiempo por torre' },
  { key: 'tablaRitmo', label: 'Tabla ritmo torre' },
] as const

type SeccionKey = (typeof SECCIONES)[number]['key']

const VISIBLE_STORAGE_KEY = 'curva.seccionesVisibles'

function useSeccionesVisibles() {
  const [ocultas, setOcultas] = useState<Set<SeccionKey>>(() => {
    try {
      const raw = localStorage.getItem(VISIBLE_STORAGE_KEY)
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    localStorage.setItem(VISIBLE_STORAGE_KEY, JSON.stringify([...ocultas]))
  }, [ocultas])

  const toggle = (key: SeccionKey) =>
    setOcultas((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  return { esVisible: (key: SeccionKey) => !ocultas.has(key), toggle }
}

function KpiCards({ kpis }: { kpis: ReturnType<typeof useCurvaData>['kpis'] }) {
  const items = [
    { label: '% Avance Real (hoy)', value: fmtPr(kpis.realPct), tono: 'success' as const },
    { label: '% Avance Teórico (hoy)', value: fmtPr(kpis.teoPct) },
    {
      label: 'Brecha módulos terminados',
      value: (kpis.brechaTerms >= 0 ? '+' : '') + fmt(kpis.brechaTerms),
      sub: `real ${fmt(kpis.modsTerminados)} vs plan ${fmt(kpis.termPlanHoy)}`,
      tono: kpis.brechaTerms >= 0 ? ('success' as const) : ('destructive' as const),
    },
    { label: 'Módulos activos', value: fmt(kpis.modsActivos), sub: 'iniciados sin terminar', tono: 'warning' as const },
    { label: 'Módulos iniciados', value: fmt(kpis.modsIniciados) },
    { label: 'Módulos terminados', value: fmt(kpis.modsTerminados), tono: 'success' as const },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((kpi) => (
        <div key={kpi.label} className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', kpi.tono === 'success' && 'text-success', kpi.tono === 'warning' && 'text-warning', kpi.tono === 'destructive' && 'text-destructive')}>
            {kpi.value}
          </p>
          {kpi.sub && <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
        active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted/30 text-muted-foreground',
      )}
    >
      {label}
    </button>
  )
}

function SectionCard({
  title,
  extra,
  visible,
  onToggle,
  children,
}: {
  title: string
  extra?: React.ReactNode
  visible: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {extra}
          <button
            type="button"
            onClick={onToggle}
            aria-label={visible ? 'Minimizar' : 'Expandir'}
            className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-muted/50"
          >
            {visible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </CardHeader>
      {visible && <CardContent>{children}</CardContent>}
    </Card>
  )
}

export default function Curva({ excelData }: { excelData: ParsedDashboardData }) {
  const data = useCurvaData(excelData)
  const { esVisible, toggle } = useSeccionesVisibles()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">🗓 Filtrar por mes:</span>
        {data.mesesDisponibles.map((m) => (
          <Chip key={m.key} label={m.lbl} active={data.mesesSeleccionados == null || data.mesesSeleccionados.has(m.key)} onClick={() => data.toggleMes(m.key)} />
        ))}
      </div>

      <SectionCard title="Indicadores" visible={esVisible('kpis')} onToggle={() => toggle('kpis')}>
        <KpiCards kpis={data.kpis} />
      </SectionCard>

      <SectionCard title="Curva S — % Avance Teórico vs Real por semana" visible={esVisible('curvaS')} onToggle={() => toggle('curvaS')}>
        <CurvaSChart data={data.curvaByWeek} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Módulos iniciados acumulados: real vs planificado" visible={esVisible('modIniciados')} onToggle={() => toggle('modIniciados')}>
          <ModulosLineChart data={data.avByWeek} planKey="planAcum" realKey="realAcum" title="Iniciados" />
        </SectionCard>
        <SectionCard title="Módulos terminados acumulados: real vs planificado" visible={esVisible('modTerminados')} onToggle={() => toggle('modTerminados')}>
          <ModulosLineChart data={data.avByWeek} planKey="termPlanAcum" realKey="termRealAcum" title="Terminados" />
        </SectionCard>
      </div>

      <SectionCard title="Módulos que salen del galpón por semana" visible={esVisible('galpon')} onToggle={() => toggle('galpon')}>
        <GalponBarChart data={data.galponByWeek} />
      </SectionCard>

      <SectionCard title="Tiempo real vs proyectado por torre" visible={esVisible('tiempoTorre')} onToggle={() => toggle('tiempoTorre')}>
        <TiempoTorreChart data={data.torreTiempo} />
      </SectionCard>

      <SectionCard
        title="Promedio de días en galpón por torre (inicio módulo → término Membrana Cielo)"
        visible={esVisible('tablaRitmo')}
        onToggle={() => toggle('tablaRitmo')}
      >
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Torre</th>
                <th className="px-2 py-1.5 text-right">Módulos torre</th>
                <th className="px-2 py-1.5 text-right">Días Obra Gruesa</th>
                <th className="px-2 py-1.5 text-right">Módulos por día</th>
                <th className="px-2 py-1.5 text-right">Días Terminaciones</th>
                <th className="px-2 py-1.5 text-right">Módulos por día</th>
                <th className="px-2 py-1.5 text-right">Días Totales Torre</th>
                <th className="px-2 py-1.5 text-left">Salida Galpón</th>
                <th className="px-2 py-1.5 text-left">Fecha Término</th>
              </tr>
            </thead>
            <tbody>
              {data.ritmoTorreRows.length === 0 ? (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Sin datos</td></tr>
              ) : (
                data.ritmoTorreRows.map((r) => (
                  <tr key={r.torre} className="border-b last:border-0">
                    <td className="px-2 py-1.5">{r.torre}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.total}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.diasOG != null ? r.diasOG.toFixed(0) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.promOG != null ? r.promOG.toFixed(2) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.diasTerm != null ? r.diasTerm.toFixed(0) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.promTerm != null ? r.promTerm.toFixed(2) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.diasTotal != null ? r.diasTotal.toFixed(0) : '—'}</td>
                    <td className="px-2 py-1.5">{r.fechaMembrana ? fmtDate(r.fechaMembrana) : '—'}</td>
                    <td className="px-2 py-1.5">
                      {r.fechaTermino ? fmtDate(r.fechaTermino) : '—'}
                      {r.enCurso && <span className="ml-1 text-primary">(en curso)</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
