import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { invalidate } from '@/lib/queryCache'
import { loadObraCrConfig, loadObraCrModulos } from '../lib/supaData'
import { combinarModulos, type ModuloCombinado } from '../lib/matrix'

export function obraCrCacheKey(proyectoSlug: string) {
  return `obra_cr:${proyectoSlug}`
}

export function useObraCrData() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const [modulos, config] = await Promise.all([loadObraCrModulos(proyectoId), loadObraCrConfig(proyectoId)])
    return { modulos, config }
  }, [proyectoSlug])

  const { data, loading, error } = useCachedQuery(proyectoSlug ? obraCrCacheKey(proyectoSlug) : null, fetcher, 60_000)

  const modulos: ModuloCombinado[] = useMemo(
    () => (data ? combinarModulos(data.modulos, data.config) : []),
    [data],
  )

  return { modulos, loading, error, hayCR: (data?.modulos.length ?? 0) > 0 }
}

export function invalidateObraCr(proyectoSlug: string) {
  invalidate(obraCrCacheKey(proyectoSlug))
}
