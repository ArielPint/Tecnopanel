import { useCallback, useEffect, useState } from 'react'
import { fetchWithCache, getCached, invalidate, subscribe } from '@/lib/queryCache'

export function useCachedQuery<T>(key: string | null, fetcher: () => Promise<T>, ttlMs = 60_000) {
  const [data, setData] = useState<T | undefined>(() => (key ? getCached<T>(key) : undefined))
  const [loading, setLoading] = useState(data === undefined)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (force = false) => {
      if (!key) return
      if (force) invalidate(key)
      setLoading(true)
      setError(null)
      try {
        setData(await fetchWithCache(key, fetcher, ttlMs))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar')
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  useEffect(() => {
    if (!key) return
    load()
    return subscribe(key, () => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data, loading, error, refetch: () => load(true) }
}
