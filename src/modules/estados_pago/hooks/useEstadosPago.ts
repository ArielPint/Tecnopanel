import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { EstadoEP, EstadoPago } from '../types'

type NuevoEstadoPago = Pick<
  EstadoPago,
  'subcontrato_id' | 'numero_ep' | 'periodo' | 'fecha_emision' | 'fecha_recepcion' | 'monto_bruto' | 'descuentos' | 'retenciones' | 'monto_neto' | 'observaciones' | 'documento_principal_path'
>

export function useEstadosPago() {
  const [estadosPago, setEstadosPago] = useState<EstadoPago[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelNameRef = useRef(`estados_pago_la_chacra_${Math.random().toString(36).slice(2)}`)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId('la-chacra')
    const { data, error } = await supabase
      .from('estados_pago')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setEstadosPago(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estados_pago' }, () => refetch())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const crear = useCallback(
    async (input: NuevoEstadoPago) => {
      const proyectoId = await getProyectoId('la-chacra')
      const { data: userData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('estados_pago')
        .insert({ ...input, proyecto_id: proyectoId, estado: 'emitido', creado_por: userData.user?.id ?? null })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as EstadoPago
    },
    [refetch],
  )

  const actualizar = useCallback(
    async (id: string, patch: Partial<NuevoEstadoPago>) => {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('estados_pago')
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
    async (id: string, estado: EstadoEP) => {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('estados_pago')
        .update({ estado, actualizado_por: userData.user?.id ?? null })
        .eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const registrarPago = useCallback(
    async (id: string, montoPagado: number) => {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('estados_pago')
        .update({ estado: 'pagado', monto_pagado: montoPagado, actualizado_por: userData.user?.id ?? null })
        .eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { estadosPago, loading, error, refetch, crear, actualizar, cambiarEstado, registrarPago }
}
