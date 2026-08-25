import { useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { guardarDotacionPersonal, loadDotacionPersonal, type DotacionPersonalRow } from '../lib/supaData'

const VACIA: DotacionPersonalRow = {
  administrativos: 0, supervisores: 0, operarios: 0, contratistas: 0, sanitarios: 0, electricos: 0, terminaciones: 0,
}

export function useDotacionData() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [guardando, setGuardando] = useState(false)

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    return loadDotacionPersonal(proyectoId)
  }, [proyectoSlug])

  const { data, loading, refetch } = useCachedQuery<DotacionPersonalRow>(
    proyectoSlug ? `dotacion_data:${proyectoSlug}` : null,
    fetcher,
    60_000,
  )

  const guardar = useCallback(
    async (valores: DotacionPersonalRow) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      setGuardando(true)
      try {
        await guardarDotacionPersonal(proyectoId, valores)
        await refetch()
      } finally {
        setGuardando(false)
      }
    },
    [proyectoSlug, refetch],
  )

  return { valores: data ?? VACIA, loading, guardando, guardar }
}
