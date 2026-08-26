import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { invalidate } from '@/lib/queryCache'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { loadObraCrConfig, loadObraCrModulos } from '../lib/supaData'
import { combinarModulos, type ModuloCombinado } from '../lib/matrix'
import type { ObraSubcontrato } from '../lib/categorias'

export function obraCrCacheKey(proyectoSlug: string) {
  return `obra_cr:${proyectoSlug}`
}

// Mapea el valor del permiso (mismo enum que planta_modulos.subcontrato, WEDO/CONBES)
// al código de una letra que usa obra_cr_config/categorias (W/C).
const SUBCONTRATO_PERMISO_A_OBRA: Record<'WEDO' | 'CONBES', ObraSubcontrato> = { WEDO: 'W', CONBES: 'C' }

export function useObraCrData() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const { subcontrato } = usePermisosProyecto(proyectoSlug ?? '')

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const [modulos, config] = await Promise.all([loadObraCrModulos(proyectoId), loadObraCrConfig(proyectoId)])
    return { modulos, config }
  }, [proyectoSlug])

  const { data, loading, error } = useCachedQuery(proyectoSlug ? obraCrCacheKey(proyectoSlug) : null, fetcher, 60_000)

  const todosLosModulos: ModuloCombinado[] = useMemo(
    () => (data ? combinarModulos(data.modulos, data.config) : []),
    [data],
  )
  // Si el usuario tiene un subcontrato asociado, Avance Obra se restringe a los
  // módulos asignados a ese subcontrato en la categoría "terminaciones" (Wedo/Conbes) —
  // las otras categorías (eléctrico/sanitario/ventanas) son de otras empresas fijas.
  const modulos = useMemo(() => {
    if (!subcontrato) return todosLosModulos
    const codigo = SUBCONTRATO_PERMISO_A_OBRA[subcontrato]
    return todosLosModulos.filter((m) => m.asignaciones.terminaciones.subcontrato === codigo)
  }, [todosLosModulos, subcontrato])

  return { modulos, loading, error, hayCR: (data?.modulos.length ?? 0) > 0 }
}

export function invalidateObraCr(proyectoSlug: string) {
  invalidate(obraCrCacheKey(proyectoSlug))
}
