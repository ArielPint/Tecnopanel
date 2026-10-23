import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/**
 * Un proyecto de SAP con alguna nota de venta abierta (`sap_backlog`, solo en el servidor propio; la
 * llena la sincronización horaria de ventas). Backlog = contratado − facturado.
 */
export interface FilaBacklog {
  proyectoCodigo: string
  proyecto: string
  cliente: string | null
  linea: string | null
  sucursal: string | null
  pedidosAbiertos: number
  ultimoPedido: string | null
  contratado: number
  facturado: number
  backlog: number
}

function esTablaInexistente(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST205' || err?.code === '42P01'
}

export function useBacklog() {
  const [filas, setFilas] = useState<FilaBacklog[]>([])
  const [disponible, setDisponible] = useState(true)
  const [sincronizadoEn, setSincronizadoEn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [datos, estado] = await Promise.all([
      supabase
        .from('sap_backlog')
        .select('proyecto_codigo, proyecto_nombre, cliente_nombre, linea, sucursal, pedidos_abiertos, ultimo_pedido, contratado, facturado'),
      supabase.from('sap_backlog_estado').select('sincronizado_en').maybeSingle(),
    ])
    if (esTablaInexistente(datos.error)) {
      setDisponible(false)
      setFilas([])
    } else if (datos.error) {
      setError(datos.error.message)
    } else {
      setDisponible(true)
      setSincronizadoEn(estado.data?.sincronizado_en ?? null)
      setFilas(
        (datos.data ?? []).map((d) => {
          const contratado = Number(d.contratado)
          const facturado = Number(d.facturado)
          return {
            proyectoCodigo: d.proyecto_codigo,
            proyecto: d.proyecto_nombre ? `${d.proyecto_codigo} · ${d.proyecto_nombre}` : d.proyecto_codigo,
            cliente: d.cliente_nombre,
            linea: d.linea,
            sucursal: d.sucursal,
            pedidosAbiertos: d.pedidos_abiertos,
            ultimoPedido: d.ultimo_pedido,
            contratado,
            facturado,
            backlog: contratado - facturado,
          }
        }),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  return { filas, disponible, sincronizadoEn, loading, error, recargar: cargar }
}
