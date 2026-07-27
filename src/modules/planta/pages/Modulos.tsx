import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { useModulosData } from '../hooks/useModulosData'
import type { ModuloRow, ParsedDashboardData } from '../lib/excelParser'
import { fmt, fmtDate, fmtPr, parseDate } from '../lib/format'
import { AvancePorTorreChart, DistribucionAvanceChart, M2SemanalAcumChart, M2SemanalDiarioChart } from '../components/ModulosCharts'

interface Kpi {
  label: string
  value: string
  sub?: string
  tono?: 'success' | 'warning'
}

function KpiCards({ kpis }: { kpis: ReturnType<typeof useModulosData>['kpis'] }) {
  const items: Kpi[] = [
    { label: '% Avance promedio', value: fmtPr(kpis.avanceProm) },
    {
      label: 'Terminados',
      value: fmt(kpis.terminados),
      sub: kpis.pctTerminados != null ? `${fmtPr(kpis.pctTerminados)} del total` : undefined,
      tono: 'success',
    },
    { label: 'En proceso', value: fmt(kpis.enProceso), tono: 'warning' },
    {
      label: 'Total iniciados',
      value: fmt(kpis.totalIniciados),
      sub: kpis.pctIniciados != null ? `${fmtPr(kpis.pctIniciados)} del total` : undefined,
    },
    { label: 'Despachados', value: fmt(kpis.despachados), tono: 'success' },
    { label: 'Listos — pend. despacho', value: fmt(kpis.listosPendDesp) },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((kpi) => (
        <div key={kpi.label} className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
          <p className={'mt-1 text-2xl font-bold tabular-nums ' + (kpi.tono === 'success' ? 'text-success' : kpi.tono === 'warning' ? 'text-warning' : '')}>
            {kpi.value}
          </p>
          {kpi.sub && <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function estadoBadge(m: ModuloRow) {
  const pct = (m.avance ?? 0) * 100
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const tp = parseDate(m.termPlan)
  const atrasado = tp && tp < hoy && pct < 100
  if (pct >= 100 || m.termReal) return <span className="rounded bg-success/15 px-1.5 py-0.5 text-xs font-medium text-success">Terminado</span>
  if (atrasado) return <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">Atrasado</span>
  return <span className="rounded bg-info/15 px-1.5 py-0.5 text-xs font-medium text-info">En proceso</span>
}

type SortKey = 'modulo' | 'torre' | 'tipo' | 'avance' | 'initTeorico' | 'initReal' | 'gapInicio' | 'termPlan' | 'termReal' | 'gapTermino' | 'duracion'

function sortValue(m: ModuloRow, key: SortKey): number | string {
  switch (key) {
    case 'avance':
      return m.avance ?? 0
    case 'gapInicio':
      return m.gapInicio ?? -Infinity
    case 'gapTermino': {
      const tr = parseDate(m.termReal)
      const tp = parseDate(m.termPlan)
      return tr && tp ? Math.round((tr.getTime() - tp.getTime()) / 86400000) : -Infinity
    }
    case 'duracion': {
      const tr = parseDate(m.termReal)
      const ir = parseDate(m.initReal)
      return tr && ir ? Math.round((tr.getTime() - ir.getTime()) / 86400000) : -Infinity
    }
    case 'initTeorico':
    case 'initReal':
    case 'termPlan':
    case 'termReal': {
      const d = parseDate(m[key])
      return d ? d.getTime() : -Infinity
    }
    default:
      return String(m[key] ?? '')
  }
}

function ModulosTable({ modulos }: { modulos: ModuloRow[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [torre, setTorre] = useState('Todas')
  const [estado, setEstado] = useState('Todos')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'modulo', dir: 1 })

  const torres = useMemo(() => ['Todas', ...new Set(modulos.map((m) => String(m.torre ?? '')).filter(Boolean))], [modulos])
  const estados = useMemo(() => ['Todos', ...new Set(modulos.map((m) => String(m.estado ?? '')).filter(Boolean))], [modulos])

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    const rows = modulos.filter((m) => {
      if (torre !== 'Todas' && String(m.torre ?? '') !== torre) return false
      if (estado !== 'Todos' && String(m.estado ?? '') !== estado) return false
      if (q) {
        const hay = `${m.modulo ?? ''} ${m.torre ?? ''} ${m.tipo ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    rows.sort((a, b) => {
      const av = sortValue(a, sort.key)
      const bv = sortValue(b, sort.key)
      if (av < bv) return -1 * sort.dir
      if (av > bv) return 1 * sort.dir
      return 0
    })
    return rows.slice(0, 200)
  }, [modulos, busqueda, torre, estado, sort])

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'modulo', label: 'Módulo' },
    { key: 'torre', label: 'Torre' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'avance', label: '% Avance' },
    { key: 'initTeorico', label: 'Inicio proy.' },
    { key: 'initReal', label: 'Inicio real' },
    { key: 'gapInicio', label: 'GAP inicio (días)' },
    { key: 'termPlan', label: 'Término plan.' },
    { key: 'termReal', label: 'Término real' },
    { key: 'gapTermino', label: 'GAP término (días)' },
    { key: 'duracion', label: 'Duración real (días)' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar módulo, torre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-9 max-w-56" />
        <Select value={torre} onValueChange={setTorre}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {torres.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {estados.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtrados.length} de {modulos.length} módulos (máx. 200 mostrados)</span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className="cursor-pointer px-2 py-1.5 text-left whitespace-nowrap select-none" onClick={() => toggleSort(c.key)}>
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th className="px-2 py-1.5 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((m, i) => {
              const pct = (m.avance ?? 0) * 100
              const gapT = sortValue(m, 'gapTermino')
              const dur = sortValue(m, 'duracion')
              const gapI = m.gapInicio
              return (
                <tr key={`${m.modulo}-${i}`} className="border-b last:border-0">
                  <td className="px-2 py-1.5">{String(m.modulo ?? '—')}</td>
                  <td className="px-2 py-1.5">{String(m.torre ?? '—')}</td>
                  <td className="px-2 py-1.5">{String(m.tipo ?? '—')}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={'h-full ' + (pct >= 100 ? 'bg-success' : pct >= 75 ? 'bg-primary' : pct >= 50 ? 'bg-warning' : 'bg-destructive')}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="tabular-nums">{pct.toFixed(2)}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">{fmtDate(m.initTeorico)}</td>
                  <td className="px-2 py-1.5">{fmtDate(m.initReal)}</td>
                  <td className={'px-2 py-1.5 tabular-nums ' + (typeof gapI === 'number' ? (gapI > 0 ? 'text-destructive' : gapI < 0 ? 'text-success' : '') : '')}>
                    {gapI ?? '—'}
                  </td>
                  <td className="px-2 py-1.5">{fmtDate(m.termPlan)}</td>
                  <td className="px-2 py-1.5">{fmtDate(m.termReal)}</td>
                  <td className={'px-2 py-1.5 tabular-nums ' + (typeof gapT === 'number' && isFinite(gapT) ? (gapT > 0 ? 'text-destructive' : gapT < 0 ? 'text-success' : '') : '')}>
                    {typeof gapT === 'number' && isFinite(gapT) ? gapT : '—'}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{typeof dur === 'number' && isFinite(dur) ? dur : '—'}</td>
                  <td className="px-2 py-1.5">{estadoBadge(m)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Modulos({ excelData }: { excelData: ParsedDashboardData }) {
  const data = useModulosData(excelData)

  return (
    <div className="space-y-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores</p>
      <KpiCards kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Distribución % avance módulos</CardTitle>
          </CardHeader>
          <CardContent>
            <DistribucionAvanceChart data={data.distribucionAvance} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance por torre</CardTitle>
          </CardHeader>
          <CardContent>
            <AvancePorTorreChart data={data.avancePorTorre} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">M² acumulados — real vs. programado (por semana)</CardTitle>
        </CardHeader>
        <CardContent>
          <M2SemanalAcumChart data={data.m2SemanalAcum} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">M² avance diario (por semana)</CardTitle>
        </CardHeader>
        <CardContent>
          <M2SemanalDiarioChart data={data.m2SemanalDiario} />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Detalle módulos</p>
        <ModulosTable modulos={data.modulos} />
      </div>
    </div>
  )
}
