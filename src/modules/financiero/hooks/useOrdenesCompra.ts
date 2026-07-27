import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { asegurarProveedor } from '@/modules/financiero/services/proveedores'
import type { OrdenCompra } from '@/modules/financiero/types/financiero'

type NuevaOrdenCompra = Pick<
  OrdenCompra,
  | 'numero_oc'
  | 'presupuesto_id'
  | 'proveedor_rut'
  | 'nombre_proveedor_raw'
  | 'fecha'
  | 'neto'
  | 'detalle'
  | 'pdf_path'
>

export function useOrdenesCompra(presupuestoId?: string) {
  const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Evita que una request vieja (ej. sin filtro, emitida antes de que
  // presupuestoId se asiente) resuelva después de una más nueva y la pise.
  const ultimaRequestId = useRef(0)

  const refetch = useCallback(async () => {
    const idDeEstaRequest = ++ultimaRequestId.current
    setLoading(true)
    setError(null)
    let query = supabase
      .from('financiero_ordenes_compra')
      .select('*')
      .order('fecha', { ascending: false })
    if (presupuestoId) query = query.eq('presupuesto_id', presupuestoId)
    const { data, error } = await query
    if (idDeEstaRequest !== ultimaRequestId.current) return
    if (error) setError(error.message)
    else setOrdenesCompra(data ?? [])
    setLoading(false)
  }, [presupuestoId])

  useEffect(() => {
    refetch()

    const channel = supabase
      .channel(`financiero_ordenes_compra_${presupuestoId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'financiero_ordenes_compra' },
        () => refetch(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch, presupuestoId])

  const createOrdenCompra = useCallback(
    async (input: NuevaOrdenCompra) => {
      await asegurarProveedor(input.proveedor_rut)
      const { data: userData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('financiero_ordenes_compra')
        .insert({ ...input, created_by: userData.user?.id ?? null })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as OrdenCompra
    },
    [refetch],
  )

  const updateOrdenCompra = useCallback(
    async (id: string, patch: Partial<NuevaOrdenCompra & { estado: OrdenCompra['estado'] }>) => {
      await asegurarProveedor(patch.proveedor_rut)
      const { data, error } = await supabase
        .from('financiero_ordenes_compra')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as OrdenCompra
    },
    [refetch],
  )

  const deleteOrdenCompra = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('financiero_ordenes_compra').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { ordenesCompra, loading, error, refetch, createOrdenCompra, updateOrdenCompra, deleteOrdenCompra }
}
