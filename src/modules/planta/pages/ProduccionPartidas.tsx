import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { fmtPr } from '../lib/format'
import { useProduccionModulos } from '../hooks/useProduccionModulos'
import { ALL_PARTIDAS, CATEGORIAS, partidaAvg } from '../lib/partidas'
import { VBarChart, HBarChart, GroupedVBarChart, colorPorAvance, COLOR_AZUL, COLOR_MORADO } from '../components/ProduccionCharts'
import type { ParsedDashboardData } from '../lib/excelParser'

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

export default function ProduccionPartidas({ excelData }: { excelData: ParsedDashboardData | null }) {
  const { modulos, rows, loading } = useProduccionModulos(excelData)
  const [torreSel, setTorreSel] = useState('Todas')
  const [catSel, setCatSel] = useState('Todas')

  const torres = useMemo(() => ['Todas', ...new Set(modulos.map((m) => m.torre).filter(Boolean))].sort(), [modulos])

  const data = useMemo(() => {
    const iniciados = modulos.filter((m) => m.iniciado)
    const n = iniciados.length || 1
    const ogP = iniciados.reduce((s, m) => s + m.og, 0) / n
    const sanP = iniciados.reduce((s, m) => s + m.san, 0) / n
    const elP = iniciados.reduce((s, m) => s + m.elec, 0) / n
    const trmP = iniciados.reduce((s, m) => s + m.term, 0) / n
    const avG = modulos.length ? modulos.reduce((s, m) => s + m.avance, 0) / modulos.length : 0

    const porPartida = ALL_PARTIDAS.map((p) => ({ label: p.l, avance: +(partidaAvg(rows, p.c) * 100).toFixed(1) })).sort((a, b) => b.avance - a.avance)

    const porCategoria = [
      { cat: 'Obra Gruesa', avance: +(ogP * 100).toFixed(1) },
      { cat: 'Sanitario', avance: +(sanP * 100).toFixed(1) },
      { cat: 'Eléctrico', avance: +(elP * 100).toFixed(1) },
      { cat: 'Terminaciones', avance: +(trmP * 100).toFixed(1) },
    ]

    const torresActivas = [...new Set(modulos.filter((m) => m.iniciado && !m.terminado).map((m) => m.torre))].sort()
    const ogVsTerm = torresActivas.map((t) => {
      const mm = modulos.filter((m) => m.torre === t && m.iniciado)
      const nn = mm.length || 1
      return {
        torre: t.replace('TORRE ', 'T'),
        obraGruesa: +((mm.reduce((s, m) => s + m.og, 0) / nn) * 100).toFixed(1),
        terminaciones: +((mm.reduce((s, m) => s + m.term, 0) / nn) * 100).toFixed(1),
      }
    })

    return { ogP, sanP, elP, trmP, avG, porPartida, porCategoria, ogVsTerm }
  }, [modulos, rows])

  const pendientes = useMemo(() => {
    let base = modulos.filter((m) => m.iniciado && !m.terminado)
    if (torreSel !== 'Todas') base = base.filter((m) => m.torre === torreSel)
    if (catSel !== 'Todas') base = base.filter((m) => m.catPend.includes(catSel))
    return base
      .map((m) => ({ label: `${m.torre.replace('TORRE ', 'T')}/${m.modulo}`, pendientes: m.nPendientes }))
      .filter((d) => d.pendientes > 0)
      .sort((a, b) => b.pendientes - a.pendientes)
      .slice(0, 40)
  }, [modulos, torreSel, catSel])

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Obra Gruesa" value={fmtPr(data.ogP * 100)} />
        <Kpi label="Sanitario" value={fmtPr(data.sanP * 100)} />
        <Kpi label="Eléctrico" value={fmtPr(data.elP * 100)} />
        <Kpi label="Terminaciones" value={fmtPr(data.trmP * 100)} />
        <Kpi label="Avance global" value={fmtPr(data.avG * 100)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance por partida — % de módulos con la partida aprobada</CardTitle></CardHeader>
        <CardContent><HBarChart data={data.porPartida} labelKey="label" valueKey="avance" pct colorFn={colorPorAvance} /></CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance por categoría</CardTitle></CardHeader>
          <CardContent><VBarChart data={data.porCategoria} labelKey="cat" valueKey="avance" pct colorFn={colorPorAvance} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Obra Gruesa vs Terminaciones (torres activas)</CardTitle></CardHeader>
          <CardContent>
            {data.ogVsTerm.length ? (
              <GroupedVBarChart
                data={data.ogVsTerm}
                labelKey="torre"
                series={[{ key: 'obraGruesa', label: 'Obra Gruesa', color: COLOR_AZUL }, { key: 'terminaciones', label: 'Terminaciones', color: COLOR_MORADO }]}
              />
            ) : (
              <p className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Sin torres activas</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Partidas pendientes por módulo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={torreSel} onValueChange={setTorreSel}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{torres.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={catSel} onValueChange={setCatSel}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todas">Todas</SelectItem>
                {CATEGORIAS.map((c) => <SelectItem key={c.key} value={c.label}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {pendientes.length ? (
            <HBarChart data={pendientes} labelKey="label" valueKey="pendientes" colorFn={(v) => (v >= 5 ? '#f85149' : v >= 3 ? '#e3903e' : '#58a6ff')} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Sin módulos pendientes con este filtro</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
