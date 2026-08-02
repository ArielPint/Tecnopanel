import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { fmt, fmtPr } from '../lib/format'
import { useProduccionModulos } from '../hooks/useProduccionModulos'
import { ALL_PARTIDAS, CATEGORIAS, partidaAvg } from '../lib/partidas'
import { VBarChart, GroupedVBarChart, HBarChart, colorPorAvance, COLOR_VERDE, COLOR_AZUL } from '../components/ProduccionCharts'
import type { ParsedDashboardData } from '../lib/excelParser'

const BUCKETS = ['10-19%', '20-29%', '30-39%', '40-49%', '50-59%', '60-69%', '70-79%', '80-89%', '90-99%', 'Completado']

function Kpi({ label, value, sub, tono }: { label: string; value: string; sub?: string; tono?: 'success' | 'warning' | 'destructive' }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={'mt-1 text-2xl font-bold tabular-nums ' + (tono ? `text-${tono}` : '')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function ProduccionResumen({ excelData }: { excelData: ParsedDashboardData | null }) {
  const { modulos, rows, loading } = useProduccionModulos(excelData)

  const stats = useMemo(() => {
    const tot = modulos.length
    const term = modulos.filter((m) => m.terminado).length
    const proc = modulos.filter((m) => m.iniciado && !m.terminado).length
    const sinI = modulos.filter((m) => !m.iniciado).length
    const avP = tot ? modulos.reduce((s, m) => s + m.avance, 0) / tot : 0
    const atras = modulos.filter((m) => m.diasRetraso > 0).length

    const bv: Record<string, number> = Object.fromEntries(BUCKETS.map((b) => [b, 0]))
    for (const m of modulos) {
      const p = m.avance * 100
      if (m.terminado || p >= 100) { bv['Completado']++; continue }
      const bucket = BUCKETS.find((b) => b !== 'Completado' && p >= parseInt(b))
      if (bucket) bv[bucket]++
    }
    const distribucion = BUCKETS.map((b) => ({ bucket: b, cantidad: bv[b] }))

    const iniciados = modulos.filter((m) => m.iniciado)
    const n = iniciados.length || 1
    const especialidad = [
      { cat: 'Obra Gruesa', avance: +((iniciados.reduce((s, m) => s + m.og, 0) / n) * 100).toFixed(1) },
      { cat: 'Sanitario', avance: +((iniciados.reduce((s, m) => s + m.san, 0) / n) * 100).toFixed(1) },
      { cat: 'Eléctrico', avance: +((iniciados.reduce((s, m) => s + m.elec, 0) / n) * 100).toFixed(1) },
      { cat: 'Terminaciones', avance: +((iniciados.reduce((s, m) => s + m.term, 0) / n) * 100).toFixed(1) },
    ]

    const tipos = [...new Set(modulos.map((m) => m.tipo).filter(Boolean))].sort()
    const porTipo = tipos.map((t) => ({
      tipo: t,
      terminados: modulos.filter((m) => m.tipo === t && m.terminado).length,
      enProceso: modulos.filter((m) => m.tipo === t && m.iniciado && !m.terminado).length,
    }))

    const criticas = ALL_PARTIDAS.map((p) => ({ label: p.l, avance: +(partidaAvg(rows, p.c) * 100).toFixed(1) }))
      .sort((a, b) => a.avance - b.avance)
      .slice(0, 10)

    return { tot, term, proc, sinI, avP, atras, distribucion, especialidad, porTipo, criticas }
  }, [modulos, rows])

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total módulos" value={fmt(stats.tot)} />
        <Kpi label="Terminados" value={fmt(stats.term)} sub={stats.tot ? `${fmtPr((stats.term / stats.tot) * 100)} del total` : undefined} tono="success" />
        <Kpi label="En proceso" value={fmt(stats.proc)} tono="warning" />
        <Kpi label="Sin iniciar" value={fmt(stats.sinI)} />
        <Kpi label="Avance promedio" value={fmtPr(stats.avP * 100)} />
        <Kpi label="Con retraso" value={fmt(stats.atras)} sub="días retraso > 0" tono="destructive" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Distribución por % avance</CardTitle></CardHeader>
          <CardContent><VBarChart data={stats.distribucion} labelKey="bucket" valueKey="cantidad" colorFn={() => COLOR_AZUL} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance por especialidad</CardTitle></CardHeader>
          <CardContent><VBarChart data={stats.especialidad} labelKey="cat" valueKey="avance" pct colorFn={colorPorAvance} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Módulos por tipo y estado</CardTitle></CardHeader>
          <CardContent>
            <GroupedVBarChart
              data={stats.porTipo}
              labelKey="tipo"
              series={[{ key: 'terminados', label: 'Terminados', color: COLOR_VERDE }, { key: 'enProceso', label: 'En proceso', color: COLOR_AZUL }]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Top 10 partidas con menor avance</CardTitle></CardHeader>
          <CardContent><HBarChart data={stats.criticas} labelKey="label" valueKey="avance" pct colorFn={(v) => (v < 50 ? '#f85149' : '#e3903e')} /></CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Categorías: {CATEGORIAS.map((c) => c.label).join(', ')}. Fuente: estado real de planta (Control Planta), en vivo.
      </p>
    </div>
  )
}
