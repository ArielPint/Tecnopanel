import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { invalidatePrefix } from '@/lib/queryCache'
import { loadModulosSubcontrato, guardarSubcontratoModulo, type ModuloSubcontratoRow } from '../lib/supaData'

export function useModulosSubcontrato() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    return loadModulosSubcontrato(proyectoId)
  }, [proyectoSlug])

  const { data, loading, error } = useCachedQuery<ModuloSubcontratoRow[]>(
    proyectoSlug ? `modulos_subcontrato:${proyectoSlug}` : null,
    fetcher,
    60_000,
  )

  const guardar = useCallback(
    async (nombre: string, subcontrato: 'WEDO' | 'CONBES') => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      await guardarSubcontratoModulo(proyectoId, nombre, subcontrato)
      invalidatePrefix(`modulos_subcontrato:${proyectoSlug}`)
    },
    [proyectoSlug],
  )

  return { modulos: data ?? [], loading, error, guardar }
}
