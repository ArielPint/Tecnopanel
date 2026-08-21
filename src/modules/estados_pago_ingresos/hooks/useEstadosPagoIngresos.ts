import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { EstadoEPIngreso, EstadoPagoIngreso } from '../types'

type NuevoEstadoPagoIngreso = Pick<
  EstadoPagoIngreso,
  'numero_ep' | 'periodo' | 'fecha_emision' | 'fecha_recepcion' | 'monto_bruto' | 'descuentos' | 'retenciones' | 'monto_neto' | 'observaciones' | 'documento_principal_path'
>

export function useEstadosPagoIngresos() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [estadosPago, setEstadosPago] = useState<EstadoPagoIngreso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelNameRef = useRef(`estados_pago_ingresos_${Math.random().toString(36).slice(2)}`)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('estados_pago_ingresos')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setEstadosPago(data ?? [])
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estados_pago_ingresos' }, () => refetch())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const crear = useCallback(
    async (input: NuevoEstadoPagoIngreso) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { data: userData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('estados_pago_ingresos')
        .insert({ ...input, proyecto_id: proyectoId, estado: 'emitido', creado_por: userData.user?.id ?? null })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as EstadoPagoIngreso
    },
    [refetch, proyectoSlug],
  )

  const actualizar = useCallback(
    async (id: string, patch: Partial<NuevoEstadoPagoIngreso>) => {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('estados_pago_ingresos')
        .update({ ...patch, actualizado_por: userData.user?.id ?? null })
        .eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  // La validación de la transición la hace el trigger en la base — acá solo se
  // manda el nuevo estado, si es inválido Supabase devuelve el error del trigger.
  const cambiarEstado = useCallback(
    async (id: string, estado: EstadoEPIngreso) => {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('estados_pago_ingresos')
        .update({ estado, actualizado_por: userData.user?.id ?? null })
        .eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const registrarCobro = useCallback(
    async (id: string, montoCobrado: number) => {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('estados_pago_ingresos')
        .update({ estado: 'pagado', monto_cobrado: montoCobrado, actualizado_por: userData.user?.id ?? null })
        .eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { estadosPago, loading, error, refetch, crear, actualizar, cambiarEstado, registrarCobro }
}
