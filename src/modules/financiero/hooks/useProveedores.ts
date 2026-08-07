import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { Proveedor } from '@/modules/financiero/types/financiero'

export function useProveedores() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data } = await supabase
      .from('financiero_proveedores')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('nombre')
    setProveedores(data ?? [])
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  const crearProveedor = useCallback(
    async (rut: string, nombre: string) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { data, error } = await supabase
        .from('financiero_proveedores')
        .upsert({ rut, nombre, proyecto_id: proyectoId }, { onConflict: 'rut,proyecto_id' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Proveedor
    },
    [refetch, proyectoSlug],
  )

  return { proveedores, loading, refetch, crearProveedor }
}
