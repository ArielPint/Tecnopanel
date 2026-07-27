import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface ItemPedido {
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export type UrgenciaPedido = 'normal' | 'urgente' | 'critico'
export type EstadoPedido = 'borrador' | 'enviado' | 'aprobado' | 'en_camino' | 'recibido' | 'cancelado'

export interface Pedido {
  id: string
  numero_pedido: string
  usuario_id: string | null
  username: string | null
  nombre: string | null
  proveedor_id: string | null
  proveedor_nombre: string | null
  items: ItemPedido[]
  urgencia: UrgenciaPedido
  fecha_requerida: string | null
  observacion: string | null
  total_estimado: number | null
  estado: EstadoPedido
  nota_estado: string | null
  created_at: string
}

export interface PedidoInput {
  numero_pedido: string
  usuario_id: string | null
  username: string | null
  nombre: string | null
  proveedor_id: string | null
  proveedor_nombre: string | null
  items: ItemPedido[]
  urgencia: UrgenciaPedido
  fecha_requerida: string | null
  observacion: string | null
  total_estimado: number | null
  estado: EstadoPedido
}

export function usePedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('pedidos').select('*').order('created_at', { ascending: false })
    if (!error) setPedidos((data ?? []) as Pedido[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const crear = useCallback(
    async (input: PedidoInput) => {
      const { error } = await supabase.from('pedidos').insert(input)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const actualizarEstado = useCallback(
    async (id: string, estado: EstadoPedido, nota: string | null) => {
      const { error } = await supabase.from('pedidos').update({ estado, nota_estado: nota }).eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { pedidos, loading, crear, actualizarEstado }
}
