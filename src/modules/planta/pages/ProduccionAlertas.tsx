import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { fmt, fmtDate } from '../lib/format'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { useProduccionModulos } from '../hooks/useProduccionModulos'
import { ALL_PARTIDAS, CATEGORIAS, isNA, isDone, pS } from '../lib/partidas'
import type { ParsedDashboardData } from '../lib/excelParser'

function Kpi({ label, value, sub, tono }: { label: string; value: string; sub?: string; tono?: 'destructive' | 'warning' }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={'mt-1 text-2xl font-bold tabular-nums ' + (tono ? `text-${tono}` : '')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function PctBar({ v }: { v: number }) {
  const pct = Math.min(v * 100, 100)
  const color = pct >= 100 ? '#3fb950' : pct >= 75 ? '#58a6ff' : pct >= 50 ? '#e3903e' : '#f85149'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${pct}%`, background: color }} /></div>
      <span className="text-xs tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  )
}

export default function ProduccionAlertas({ excelData }: { excelData: ParsedDashboardData | null }) {
  const { modulos, rows, loading } = useProduccionModulos(excelData)
  const [torre, setTorre] = useState('Todas')
  const [tipo, setTipo] = useState('Todos')
  const [cat, setCat] = useState('Todas')
  const [torreP, setTorreP] = useState('Todas')
  const [partidaIdx, setPartidaIdx] = useState(0)

  const torres = useMemo(() => ['Todas', ...new Set(modulos.map((m) => m.torre).filter(Boolean))].sort(), [modulos])
  const tipos = useMemo(() => ['Todos', ...new Set(modulos.map((m) => m.tipo).filter(Boolean))], [modulos])

  const filtrados = useMemo(
    () =>
      modulos.filter((m) => {
        if (torre !== 'Todas' && m.torre !== torre) return false
        if (tipo !== 'Todos' && m.tipo !== tipo) return false
        if (cat !== 'Todas' && !m.catPend.includes(cat)) return false
        return true
      }),
    [modulos, torre, tipo, cat],
  )

  const listas = useMemo(() => {
    const atrasados = filtrados.filter((m) => m.diasRetraso > 0).sort((a, b) => b.diasRetraso - a.diasRetraso).slice(0, 60)
    const sinMov = filtrados.filter((m) => m.iniciado && !m.terminado && (m.diasSinMov ?? 0) >= 7).sort((a, b) => (b.diasSinMov ?? 0) - (a.diasSinMov ?? 0)).slice(0, 60)
    const vencidos = filtrados.filter((m) => m.iniciado && !m.terminado && m.termPlan && m.diasRetraso > 0).slice(0, 100)
    const retrasoProm = atrasados.length ? Math.round(atrasados.reduce((s, m) => s + m.diasRetraso, 0) / atrasados.length) : null
    return { atrasados, sinMov, vencidos, retrasoProm }
  }, [filtrados])

  const partidaPend = useMemo(() => {
    const p = ALL_PARTIDAS[partidaIdx] ?? ALL_PARTIDAS[0]
    const items = rows
      .map((r, i) => ({ r, m: modulos[i] }))
      .filter(({ m }) => m.iniciado)
      .filter(({ m }) => torreP === 'Todas' || m.torre === torreP)
      .filter(({ r }) => {
        const s = pS(r, p.c)
        return !isNA(s) && !isDone(s)
      })
    return { partida: p, items }
  }, [rows, modulos, partidaIdx, torreP])

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={torre} onValueChange={setTorre}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{torres.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todas">Todas</SelectItem>
            {CATEGORIAS.map((c) => <SelectItem key={c.key} value={c.label}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <IndicadoresFecha />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Módulos atrasados" value={fmt(listas.atrasados.length)} sub="días retraso > 0" tono="destructive" />
        <Kpi label="Retraso promedio" value={listas.retrasoProm != null ? `${listas.retrasoProm} d` : '—'} tono="warning" />
        <Kpi label="Sin movimiento ≥7d" value={fmt(listas.sinMov.length)} sub="módulos iniciados" />
        <Kpi label="Término vencido" value={fmt(listas.vencidos.length)} sub="fecha plan superada" tono="destructive" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Módulos con mayor retraso</CardTitle></CardHeader>
        <CardContent className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/40 text-muted-foreground"><th className="px-2 py-1.5 text-left">Torre</th><th className="px-2 py-1.5 text-left">Módulo</th><th className="px-2 py-1.5 text-left">Tipo</th><th className="px-2 py-1.5 text-right">Días retraso</th><th className="px-2 py-1.5 text-left">Avance</th><th className="px-2 py-1.5 text-left">Término plan</th><th className="px-2 py-1.5 text-left">Partidas pend.</th></tr></thead>
            <tbody>
              {listas.atrasados.map((m) => (
                <tr key={m.modulo} className="border-b last:border-0">
                  <td className="px-2 py-1.5">{m.torre}</td><td className="px-2 py-1.5">{m.modulo}</td><td className="px-2 py-1.5">{m.tipo}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-destructive">{m.diasRetraso}d</td>
                  <td className="px-2 py-1.5"><PctBar v={m.avance} /></td>
                  <td className="px-2 py-1.5">{fmtDate(m.termPlan)}</td>
                  <td className="max-w-72 truncate px-2 py-1.5 text-xs text-muted-foreground" title={m.partidasPend}>{m.partidasPend || '—'}</td>
                </tr>
              ))}
              {!listas.atrasados.length && <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Sin módulos atrasados</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Sin movimiento ≥ 7 días</CardTitle></CardHeader>
          <CardContent className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/40 text-muted-foreground"><th className="px-2 py-1.5 text-left">Torre</th><th className="px-2 py-1.5 text-left">Módulo</th><th className="px-2 py-1.5 text-right">Días sin mov.</th><th className="px-2 py-1.5 text-left">Avance</th></tr></thead>
              <tbody>
                {listas.sinMov.map((m) => (
                  <tr key={m.modulo} className="border-b last:border-0">
                    <td className="px-2 py-1.5">{m.torre}</td><td className="px-2 py-1.5">{m.modulo}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-warning">{m.diasSinMov}d</td>
                    <td className="px-2 py-1.5"><PctBar v={m.avance} /></td>
                  </tr>
                ))}
                {!listas.sinMov.length && <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Sin módulos</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Término planificado vencido</CardTitle></CardHeader>
          <CardContent className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/40 text-muted-foreground"><th className="px-2 py-1.5 text-left">Torre</th><th className="px-2 py-1.5 text-left">Módulo</th><th className="px-2 py-1.5 text-left">Término plan</th><th className="px-2 py-1.5 text-right">Días vencido</th></tr></thead>
              <tbody>
                {listas.vencidos.map((m) => (
                  <tr key={m.modulo} className="border-b last:border-0">
                    <td className="px-2 py-1.5">{m.torre}</td><td className="px-2 py-1.5">{m.modulo}</td>
                    <td className="px-2 py-1.5">{fmtDate(m.termPlan)}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-destructive">+{m.diasRetraso}d</td>
                  </tr>
                ))}
                {!listas.vencidos.length && <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Sin módulos</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Módulos pendientes por partida específica</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={torreP} onValueChange={setTorreP}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{torres.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(partidaIdx)} onValueChange={(v) => setPartidaIdx(parseInt(v))}>
              <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{ALL_PARTIDAS.map((p, i) => <SelectItem key={p.c} value={String(i)}>{p.l}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{partidaPend.items.length} módulo{partidaPend.items.length !== 1 ? 's' : ''} pendientes</span>
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/40 text-muted-foreground"><th className="px-2 py-1.5 text-left">Torre</th><th className="px-2 py-1.5 text-left">Módulo</th><th className="px-2 py-1.5 text-left">Tipo</th><th className="px-2 py-1.5 text-left">Avance global</th><th className="px-2 py-1.5 text-left">{partidaPend.partida.l}</th></tr></thead>
              <tbody>
                {partidaPend.items.map(({ r, m }) => (
                  <tr key={m.modulo} className="border-b last:border-0">
                    <td className="px-2 py-1.5">{m.torre}</td><td className="px-2 py-1.5">{m.modulo}</td><td className="px-2 py-1.5">{m.tipo}</td>
                    <td className="px-2 py-1.5"><PctBar v={m.avance} /></td>
                    <td className="px-2 py-1.5">
                      {pS(r, partidaPend.partida.c).c1 ? <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">Parcial</span> : <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">Pendiente</span>}
                    </td>
                  </tr>
                ))}
                {!partidaPend.items.length && <tr><td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">Sin pendientes con este filtro</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
