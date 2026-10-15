import { useCallback, useEffect, useState } from 'react'
import {
  cargarBalance,
  cargarCatalogos,
  cargarEerr,
  cargarEstado,
  cargarIfrs,
  type Catalogos,
  type EstadoSync,
  type FilaBalance,
  type FilaEerr,
  type MapeoIfrs,
  type RubroIfrs,
} from '../lib/api'
import type { Corte } from '../lib/balance'

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

// ---------------------------------------------------------------- balance

const cacheBalance = new Map<string, Promise<FilaBalance[]>>()

/** fin_balance para varios cortes ('YYYY-MM'); los que se repiten se piden una vez. */
export function useBalance(cortes: string[]) {
  const [datos, setDatos] = useState<Corte[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const clave = cortes.join('|')

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setError(null)
    Promise.all(
      cortes.map((c) => {
        if (!cacheBalance.has(c)) {
          if (cacheBalance.size > 12) cacheBalance.clear()
          const p = cargarBalance(c)
          p.catch(() => cacheBalance.delete(c))
          cacheBalance.set(c, p)
        }
        return cacheBalance.get(c)!.then((filas) => ({ clave: c, filas }))
      }),
    )
      .then((d) => !cancelado && setDatos(d))
      .catch((e) => !cancelado && setError(e))
      .finally(() => !cancelado && setLoading(false))
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  return { datos, loading, error }
}

/** Rubros y clasificación IFRS; recargar() tras guardar cambios. */
export function useIfrs() {
  const [rubros, setRubros] = useState<RubroIfrs[]>([])
  const [mapeo, setMapeo] = useState<MapeoIfrs[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const recargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await cargarIfrs()
      setRubros(r.rubros)
      setMapeo(r.mapeo)
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
  return { rubros, mapeo, loading, error, recargar }
}
