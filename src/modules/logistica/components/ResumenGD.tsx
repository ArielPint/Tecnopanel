import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { calcCR, calcDifT, calcPct, getVTI, normCod } from '../lib/calc'
import type { RegistroCompra } from '../hooks/useRegistroCompras'

const MES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface ResumenGDProps {
  registros: RegistroCompra[]
  pptoMap: Record<string, number | null>
}

function getPPTO(r: RegistroCompra, pptoMap: Record<string, number | null>) {
  return pptoMap[normCod(r.codigo)] ?? r.valor_ppto ?? 0
}

function pctTono(pct: number) {
  return pct < 0 ? 'text-success' : pct > 0 ? 'text-destructive' : ''
}

export default function ResumenGD({ registros, pptoMap }: ResumenGDProps) {
  const [abierto, setAbierto] = useState(false)

  const kpis = useMemo(() => {
    let sumVTI = 0, sumPpto = 0, sumDifPos = 0, sumDifNeg = 0, sumPct = 0, nPct = 0, itemsMesActual = 0
    const gds = new Set<string>()
    const hoy = new Date()
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
    for (const r of registros) {
      const ppto = getPPTO(r, pptoMap)
      const cr = calcCR(r)
      const difT = calcDifT(r, ppto)
      sumVTI += getVTI(r)
      sumPpto += ppto * cr
      if (difT > 0) sumDifPos += difT
      if (difT < 0) sumDifNeg += difT
      const pct = calcPct(r, ppto)
      if (pct != null) { sumPct += pct; nPct++ }
      gds.add(r.gd)
      if (r.fecha_guia?.startsWith(mesActual)) itemsMesActual++
    }
    const pctProm = nPct ? sumPct / nPct : 0
    return {
      totalGDs: gds.size,
      sumVTI,
      sumPpto,
      diferencia: sumVTI - sumPpto,
      sumDifNeg,
      sumDifPos,
      itemsMesActual,
      pctProm,
    }
  }, [registros, pptoMap])

  const resumenMensual = useMemo(() => {
    interface Grupo { anio: string; mes: number; gds: Set<string>; items: number; montoTotal: number; pptoTotal: number; sumPct: number; nPct: number }
    const grupos = new Map<string, Grupo>()
    for (const r of registros) {
      if (!r.fecha_guia) continue
      const [anio, mesStr] = r.fecha_guia.split('-')
      const mes = Number(mesStr)
      const key = `${anio}-${mesStr}`
      let g = grupos.get(key)
      if (!g) { g = { anio, mes, gds: new Set(), items: 0, montoTotal: 0, pptoTotal: 0, sumPct: 0, nPct: 0 }; grupos.set(key, g) }
      const ppto = getPPTO(r, pptoMap)
      const pct = calcPct(r, ppto)
      g.gds.add(r.gd)
      g.items++
      g.montoTotal += getVTI(r)
      g.pptoTotal += ppto * calcCR(r)
      if (pct != null) { g.sumPct += pct; g.nPct++ }
    }
    return [...grupos.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, g]) => ({
        key,
        anio: g.anio,
        mes: MES_ABREV[g.mes - 1] ?? String(g.mes),
        gdsEmitidas: g.gds.size,
        items: g.items,
        montoTotal: g.montoTotal,
        pptoMensual: g.pptoTotal,
        desviacionProm: g.nPct ? g.sumPct / g.nPct : 0,
      }))
  }, [registros, pptoMap])

  const celdas = [
    { label: 'Total GDs', value: String(kpis.totalGDs), tono: 'text-primary' },
    { label: 'Monto total', value: formatCLP(kpis.sumVTI), tono: 'text-success' },
    { label: 'Ppto mensual (suma)', value: formatCLP(kpis.sumPpto), tono: 'text-warning' },
    { label: 'Diferencia (real − ppto)', value: formatCLP(kpis.diferencia), tono: pctTono(kpis.diferencia) },
    { label: 'Suma dif. negativas (ahorro)', value: formatCLP(kpis.sumDifNeg), tono: 'text-success' },
    { label: 'Suma dif. positivas (sobregasto)', value: `+${formatCLP(kpis.sumDifPos)}`, tono: 'text-destructive' },
    { label: 'Ítems mes actual', value: String(kpis.itemsMesActual), tono: 'text-warning' },
    { label: '% Desviación prom.', value: `${kpis.pctProm.toFixed(1)}%`, tono: pctTono(kpis.pctProm) },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-stretch rounded-md border bg-card text-sm">
        <div className="flex flex-1 flex-wrap divide-x">
          {celdas.map((c) => (
            <div key={c.label} className="min-w-[7.5rem] flex-1 px-3 py-2">
              <p className="text-[.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{c.label}</p>
              <p className={cn('mt-0.5 text-lg font-bold tabular-nums', c.tono)}>{c.value}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="shrink-0 border-l px-4 text-xs font-medium text-primary hover:bg-muted/40"
        >
          {abierto ? '✕ Cerrar resumen' : '📅 Resumen mes/año'}
        </button>
      </div>

      {abierto && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-2">Año</th>
                <th className="px-3 py-2">Mes</th>
                <th className="px-3 py-2 text-right">GDs emitidas</th>
                <th className="px-3 py-2 text-right">Ítems</th>
                <th className="px-3 py-2 text-right">Monto total</th>
                <th className="px-3 py-2 text-right">Ppto mensual</th>
                <th className="px-3 py-2 text-right">Desviación prom.</th>
              </tr>
            </thead>
            <tbody>
              {resumenMensual.map((g) => (
                <tr key={g.key} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{g.anio}</td>
                  <td className="px-3 py-1.5">{g.mes}</td>
                  <td className="px-3 py-1.5 text-right text-primary tabular-nums">{g.gdsEmitidas}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{g.items}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-success">{formatCLP(g.montoTotal)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-warning">{formatCLP(g.pptoMensual)}</td>
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', pctTono(g.desviacionProm))}>{g.desviacionProm.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
