import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { Proveedor } from '@/modules/financiero/types/financiero'

export function useProveedores() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const cacheKey = proyectoSlug ? `proveedores:${proyectoSlug}` : null

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_proveedores')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('nombre')
    if (error) throw new Error(error.message)
    return data ?? []
  }, [proyectoSlug])

  // Catálogo, cambia poco: cache 5min.
  const { data, loading, refetch } = useCachedQuery<Proveedor[]>(cacheKey, fetcher, 5 * 60_000)

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

  return { proveedores: data ?? [], loading, refetch, crearProveedor }
}
