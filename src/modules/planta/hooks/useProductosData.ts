import { useMemo } from 'react'
import { normCod } from '@/modules/logistica/lib/calc'
import { PRODUCTOS_BASE } from '@/modules/logistica/lib/productosBase'
import type { ParsedDashboardData, ProductoRow } from '../lib/excelParser'

export type ProductoConVar = ProductoRow & { varPrecio: number | null }

const CATALOGO_DESC = new Map(PRODUCTOS_BASE.map((p) => [normCod(p.codigo), p.descripcion]))

export function useProductosData(excelData: ParsedDashboardData | null) {
  return useMemo(() => {
    // Completa descripción faltante en el Excel con el catálogo fijo de productos
    // (mismo código normalizado) — evita filas "sin descripción" en tabla y gráficos.
    const productos: ProductoConVar[] = (excelData?.productos ?? []).map((raw) => {
      let p = raw
      if (!p.desc && !p.descCorta) {
        const fallback = CATALOGO_DESC.get(normCod(String(p.codigo ?? '')))
        if (fallback) p = { ...p, desc: fallback, descCorta: fallback }
      }
      // Variación de precio = precio unitario realmente pagado vs ppto unitario vigente.
      // La columna %VARIACION del Excel NO sirve acá: es PROYECCION COMPRA / PPTO TOTAL - 1,
      // o sea desviación de gasto proyectado, y depende de la cantidad que falta por comprar.
      const varPrecio =
        p.pptoUn != null && p.pptoUn > 0 && p.precioUN != null && p.precioUN > 0
          ? p.precioUN / p.pptoUn - 1
          : null
      return { ...p, varPrecio }
    })
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

    // |var| > 100% = unidad de medida distinta entre ppto y compra (ppto por m2 vs compra por rollo,
    // ppto por caja vs compra por unidad). No es variación de precio; se deja fuera del gráfico
    // para no aplastar la escala, pero sigue visible en la tabla.
    const variacion = productos
      .filter((p) => p.varPrecio != null && Math.abs(p.varPrecio) > 0.005 && Math.abs(p.varPrecio) <= 1)
      .sort((a, b) => Math.abs(b.varPrecio ?? 0) - Math.abs(a.varPrecio ?? 0))
      .slice(0, 15)
      .map((p) => ({
        producto: String(p.descCorta ?? '').substring(0, 20),
        variacion: +((p.varPrecio ?? 0) * 100).toFixed(2),
      }))

    return { kpis, avanceTeorico, avancePedidos, variacion, productos }
  }, [excelData])
}

export type ProductosData = ReturnType<typeof useProductosData>
