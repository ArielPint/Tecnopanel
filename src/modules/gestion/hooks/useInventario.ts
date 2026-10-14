import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/** Stock de un artículo en una bodega, desde SAP (`sap_stock`, solo en el servidor propio). */
export interface FilaStock {
  bodegaCodigo: string
  bodega: string
  sucursal: string | null
  codigo: string
  articulo: string
  grupo: string | null
  unidad: string | null
  enStock: number
  /** Reservado por pedidos de clientes u órdenes. */
  comprometido: number
  /** Por llegar (órdenes de compra o de fabricación). */
  pedido: number
  /** Como en SAP: en stock − comprometido + pedido. */
  disponible: number
  stockMinimo: number
  costoPromedio: number
  /** enStock × costo promedio, CLP. */
  valor: number
  inactivo: boolean
}

interface FilaSap {
  bodega_codigo: string
  bodega_nombre: string | null
  sucursal: string | null
  articulo_codigo: string
  articulo_nombre: string | null
  grupo: string | null
  unidad: string | null
  en_stock: number | string
  comprometido: number | string
  pedido: number | string
  stock_minimo: number | string
  costo_promedio: number | string
  valor: number | string
  inactivo: boolean
}

// La tabla de SAP existe solo en el servidor propio: en Supabase PostgREST responde "no existe".
function noExiste(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST205' || err?.code === '42P01'
}

const PAGINA = 1000

async function cargarSap(): Promise<FilaSap[]> {
  const filas: FilaSap[] = []
  // PostgREST corta en max-rows: se pide por páginas hasta que una vuelva incompleta.
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from('sap_stock')
      .select('*')
      .order('bodega_codigo')
      .order('articulo_codigo')
      .range(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as FilaSap[]))
    if (!data || data.length < PAGINA) return filas
  }
}

export function useInventario() {
  const [filas, setFilas] = useState<FilaStock[]>([])
  /** false donde no existe la tabla de SAP (Supabase): no hay inventario que mostrar. */
  const [disponible, setDisponible] = useState(true)
  const [sincronizadoEn, setSincronizadoEn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const estado = await supabase.from('sap_stock_estado').select('sincronizado_en').maybeSingle()
      if (estado.error) {
        if (!noExiste(estado.error)) throw new Error(estado.error.message)
        setDisponible(false)
        setFilas([])
        setError(null)
        return
      }
      setDisponible(true)
      setSincronizadoEn(estado.data?.sincronizado_en ?? null)
      setFilas(
        (await cargarSap()).map((s) => {
          const enStock = Number(s.en_stock)
          const comprometido = Number(s.comprometido)
          const pedido = Number(s.pedido)
          return {
            bodegaCodigo: s.bodega_codigo,
            bodega: s.bodega_nombre ? `${s.bodega_codigo} · ${s.bodega_nombre}` : s.bodega_codigo,
            sucursal: s.sucursal,
            codigo: s.articulo_codigo,
            articulo: s.articulo_nombre ?? s.articulo_codigo,
            grupo: s.grupo,
            unidad: s.unidad,
            enStock,
            comprometido,
            pedido,
            disponible: enStock - comprometido + pedido,
            stockMinimo: Number(s.stock_minimo),
            costoPromedio: Number(s.costo_promedio),
            valor: Number(s.valor),
            inactivo: s.inactivo,
          }
        }),
      )
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  return { filas, disponible, sincronizadoEn, loading, error, recargar: cargar }
}
