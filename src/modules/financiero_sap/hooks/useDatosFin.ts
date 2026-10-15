import { useEffect, useState } from 'react'
import { cargarCatalogos, cargarEerr, cargarEstado, type Catalogos, type EstadoSync, type FilaEerr } from '../lib/api'

/** Catálogos y estado de la sincronización (una vez por sesión). */
export function useCatalogos() {
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null)
  const [estado, setEstado] = useState<EstadoSync | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelado = false
    Promise.all([cargarCatalogos(), cargarEstado()])
      .then(([c, e]) => {
        if (cancelado) return
        setCatalogos(c)
        setEstado(e)
      })
      .catch((e) => !cancelado && setError(e))
    return () => {
      cancelado = true
    }
  }, [])

  return { catalogos, estado, error }
}

// Las mismas consultas se repiten al cambiar de pestaña: se guardan las últimas por rango.
const cache = new Map<string, Promise<FilaEerr[]>>()

/** Filas de fin_eerr entre dos meses ('YYYY-MM'), con o sin prorrateo. */
export function useEerr(desde: string | null, hasta: string | null, prorratear: boolean) {
  const [filas, setFilas] = useState<FilaEerr[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!desde || !hasta) return
    const clave = `${desde}|${hasta}|${prorratear}`
    if (!cache.has(clave)) {
      if (cache.size > 8) cache.clear()
      const p = cargarEerr(desde, hasta, prorratear)
      p.catch(() => cache.delete(clave))
      cache.set(clave, p)
    }
    let cancelado = false
    setLoading(true)
    setError(null)
    cache
      .get(clave)!
      .then((f) => !cancelado && setFilas(f))
      .catch((e) => !cancelado && setError(e))
      .finally(() => !cancelado && setLoading(false))
    return () => {
      cancelado = true
    }
  }, [desde, hasta, prorratear])

  return { filas, loading, error }
}

/** Al guardar otro prorrateo, lo cargado con prorrateo queda viejo. */
export function olvidarEerr() {
  cache.clear()
}
