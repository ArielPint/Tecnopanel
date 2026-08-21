import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'

// Monto contractual total del proyecto (ingresos) — un solo valor por
// proyecto, escritura admin-only vía RLS (mismo patrón que la tabla `config`).
export function useConfigIngresos() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [montoContractual, setMontoContractual] = useState(0)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('estados_pago_ingresos_config')
      .select('monto_contractual')
      .eq('proyecto_id', proyectoId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    setMontoContractual(data?.monto_contractual ?? 0)
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  const guardar = useCallback(
    async (valor: number) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('estados_pago_ingresos_config')
        .upsert({ proyecto_id: proyectoId, monto_contractual: valor, actualizado_por: userData.user?.id ?? null }, { onConflict: 'proyecto_id' })
      if (error) throw new Error(error.message)
      setMontoContractual(valor)
    },
    [proyectoSlug],
  )

  return { montoContractual, loading, guardar }
}
