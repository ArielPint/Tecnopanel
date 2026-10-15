import { useCallback, useEffect, useMemo, useState } from 'react'
import { cargarProrrateo, type Prorrateo } from '../lib/api'

/** % de prorrateo de la administración, por año y CECO de línea. */
export function useProrrateo() {
  const [filas, setFilas] = useState<Prorrateo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const recargar = useCallback(async () => {
    setLoading(true)
    try {
      setFilas(await cargarProrrateo())
      setError(null)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const aniosConProrrateo = useMemo(() => new Set(filas.map((f) => f.anio)), [filas])
  return { filas, aniosConProrrateo, loading, error, recargar }
}
