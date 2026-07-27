import { useMemo } from 'react'
import type { ParsedDashboardData, ProductoRow } from '../lib/excelParser'

export function useProductosData(excelData: ParsedDashboardData | null) {
  return useMemo(() => {
    const productos: ProductoRow[] = excelData?.productos ?? []
    const criticos = productos.filter((p) => p.critico === 'PRODUCTO CRITICO')
    const conAv = productos.filter((p) => p.avTeorico != null)
    const sobre100 = conAv.filter((p) => (p.avTeorico ?? 0) > 100).length
    const bajo50 = conAv.filter((p) => (p.avTeorico ?? 0) < 50).length

    const kpis = { total: productos.length, criticos: criticos.length, sobre100, bajo50 }

    const avanceTeorico = criticos
      .filter((p) => p.avTeorico != null)
      .sort((a, b) => (b.avTeorico ?? 0) - (a.avTeorico ?? 0))
      .map((p) => ({
        producto: String(p.descCorta ?? p.desc ?? '').substring(0, 22),
        avance: +(p.avTeorico ?? 0).toFixed(2),
      }))

    const avancePedidos = criticos
      .filter((p) => p.pctAvPedidos != null)
      .sort((a, b) => (b.pctAvPedidos ?? 0) - (a.pctAvPedidos ?? 0))
      .slice(0, 15)
      .map((p) => ({
        producto: String(p.descCorta ?? '').substring(0, 20),
        avance: +((p.pctAvPedidos ?? 0) * 100).toFixed(2),
      }))

    const variacion = productos
      .filter((p) => p.variacion != null && Math.abs(p.variacion ?? 0) > 0.01)
      .sort((a, b) => Math.abs(b.variacion ?? 0) - Math.abs(a.variacion ?? 0))
      .slice(0, 15)
      .map((p) => ({
        producto: String(p.descCorta ?? '').substring(0, 20),
        variacion: +((p.variacion ?? 0) * 100).toFixed(2),
      }))

    return { kpis, avanceTeorico, avancePedidos, variacion, productos }
  }, [excelData])
}

export type ProductosData = ReturnType<typeof useProductosData>
