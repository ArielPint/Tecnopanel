import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { asegurarProveedor } from '@/modules/financiero/services/proveedores'
import type { Factura } from '@/modules/financiero/types/financiero'

type NuevaFactura = Pick<
  Factura,
  'numero_factura' | 'ordenes_compra_id' | 'proveedor_rut' | 'fecha' | 'monto' | 'observacion' | 'pdf_path'
>

export function useFacturas(ordenesCompraId?: string) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Evita que una request vieja (ej. sin filtro, emitida antes de que
  // ordenesCompraId se asiente) resuelva después de una más nueva y la pise.
  const ultimaRequestId = useRef(0)

  const refetch = useCallback(async () => {
    const idDeEstaRequest = ++ultimaRequestId.current
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId(proyectoSlug!)
    let query = supabase
      .from('financiero_facturas')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('fecha', { ascending: false })
    if (ordenesCompraId) query = query.eq('ordenes_compra_id', ordenesCompraId)
    const { data, error } = await query
    if (idDeEstaRequest !== ultimaRequestId.current) return
    if (error) setError(error.message)
    else setFacturas(data ?? [])
    setLoading(false)
  }, [ordenesCompraId, proyectoSlug])

  useEffect(() => {
    refetch()

    const channel = supabase
      .channel(`financiero_facturas_${ordenesCompraId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'financiero_facturas' },
        () => refetch(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch, ordenesCompraId])

  // La validación automática (estado VALIDADA/SUPERA_OC) la resuelve el
  // trigger fn_financiero_factura_calcular_estado en el servidor — el hook
  // solo inserta y devuelve la fila ya validada por Supabase.
  const createFactura = useCallback(
    async (input: NuevaFactura) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      await asegurarProveedor(input.proveedor_rut, proyectoId)
      const { data: userData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('financiero_facturas')
        .insert({ ...input, proyecto_id: proyectoId, created_by: userData.user?.id ?? null })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Factura
    },
    [refetch, proyectoSlug],
  )

  const updateFactura = useCallback(
    async (id: string, patch: Partial<NuevaFactura & { estado: Factura['estado'] }>) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      await asegurarProveedor(patch.proveedor_rut, proyectoId)
      const { data, error } = await supabase
        .from('financiero_facturas')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Factura
    },
    [refetch, proyectoSlug],
  )

  const deleteFactura = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('financiero_facturas').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { facturas, loading, error, refetch, createFactura, updateFactura, deleteFactura }
}
