import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { MESES_ORDER } from '../lib/format'
import type { DetalleGdRow, ParsedDashboardData } from '../lib/excelParser'
import { loadCompras, loadPptoCatalogo, loadPresupuestoTotal } from '../lib/supaData'

function aplicarCatalogo(compras: DetalleGdRow[], catalogo: Record<string, number>) {
  if (!Object.keys(catalogo).length) return compras
  return compras.map((row) => {
    const livePpto = catalogo[String(row.codigo ?? '').trim().toUpperCase()]
    if (livePpto == null) return row
    const totalPpto = (row.cantRec ?? 0) * livePpto
    const difTotal = totalPpto - (row.valorTotal ?? 0)
    return { ...row, valorPpto: livePpto, totalPpto, difTotal, difPct: totalPpto ? difTotal / totalPpto : null }
  })
}

export function useComprasData(excelData: ParsedDashboardData | null) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [supaCompras, setSupaCompras] = useState<DetalleGdRow[]>([])
  const [presupuestoTotal, setPresupuestoTotal] = useState<number | null>(null)
  const [pptoCatalogo, setPptoCatalogo] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelado = false
    getProyectoId(proyectoSlug!).then((proyectoId) =>
      Promise.all([loadCompras(proyectoId), loadPresupuestoTotal(), loadPptoCatalogo()]).then(([compras, ppto, catalogo]) => {
        if (cancelado) return
        setSupaCompras(compras)
        setPresupuestoTotal(ppto)
        setPptoCatalogo(catalogo)
      }),
    )
    return () => {
      cancelado = true
    }
  }, [proyectoSlug])

  return useMemo(() => {
    const base = supaCompras.length ? supaCompras : (excelData?.detalleGD ?? [])
    const compras = aplicarCatalogo(base, pptoCatalogo)

    const total = compras.reduce((s, c) => s + (c.valorTotal ?? 0), 0)
    const totalPpto = compras.reduce((s, c) => s + (c.totalPpto ?? 0), 0)
    const ppto = presupuestoTotal ?? compras.find((c) => c.presupuesto)?.presupuesto ?? null
    const nGD = new Set(compras.map((c) => c.gd).filter(Boolean)).size

    const kpis = {
      total,
      totalPpto,
      difRealPpto: total - totalPpto,
      nGD,
      pptoTotalProyecto: ppto,
      ejecPptoTotal: ppto ? (total / ppto) * 100 : null,
      ejecSobrePresupuesto: !!(ppto && total > ppto),
    }

    const mesReal: Record<string, number> = {}
    const mesPpto: Record<string, number> = {}
    for (const c of compras) {
      const key = `${c.mes}-${c.anioGuia}`
      mesReal[key] = (mesReal[key] || 0) + (c.valorTotal ?? 0)
      mesPpto[key] = (mesPpto[key] || 0) + (c.totalPpto ?? 0)
    }
    const comprasPorMes = MESES_ORDER.filter((m) => mesReal[`${m.n}-${m.y}`] || mesPpto[`${m.n}-${m.y}`]).map((m) => ({
      mes: m.lbl,
      real: Math.round(mesReal[`${m.n}-${m.y}`] || 0),
      presupuesto: Math.round(mesPpto[`${m.n}-${m.y}`] || 0),
    }))

    const matMap: Record<string, number> = {}
    for (const c of compras) {
      const k = String(c.desc ?? 'SIN DESC')
      matMap[k] = (matMap[k] || 0) + (c.valorTotal ?? 0)
    }
    const topMateriales = Object.entries(matMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([material, monto]) => ({ material: material.substring(0, 25), monto: Math.round(monto) }))

    const tipoMap: Record<string, number> = {}
    for (const c of compras) {
      const t = String(c.tipoProd ?? 'OTRO')
      tipoMap[t] = (tipoMap[t] || 0) + (c.valorTotal ?? 0)
    }
    const porTipo = Object.entries(tipoMap).map(([tipo, monto]) => ({ tipo, monto: Math.round(monto) }))

    const criticos = compras.filter((c) => c.tipoProd === 'PRODUCTO CRITICO')

    return { kpis, comprasPorMes, topMateriales, porTipo, criticos }
  }, [excelData, supaCompras, presupuestoTotal, pptoCatalogo])
}

export type ComprasData = ReturnType<typeof useComprasData>
