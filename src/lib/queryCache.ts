// Cache en memoria con dedup de requests en vuelo. Mismo patrón que proyectoIds.ts,
// generalizado. Vive mientras la pestaña esté abierta, no persiste (multi-proyecto).

type Entry<T> = { data: T; expiresAt: number }

const cache = new Map<string, Entry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()
const listeners = new Map<string, Set<() => void>>()

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn())
}

export function subscribe(key: string, fn: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set())
  listeners.get(key)!.add(fn)
  return () => {
    listeners.get(key)?.delete(fn)
  }
}

export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt < Date.now()) return undefined
  return entry.data as T
}

export function fetchWithCache<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
  const cached = getCached<T>(key)
  if (cached !== undefined) return Promise.resolve(cached)
  if (inFlight.has(key)) return inFlight.get(key) as Promise<T>
  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + ttlMs })
      inFlight.delete(key)
      notify(key)
      return data
    })
    .catch((err) => {
      inFlight.delete(key)
      throw err
    })
  inFlight.set(key, promise)
  return promise
}

export function invalidate(key: string) {
  cache.delete(key)
  notify(key)
}

export function invalidatePrefix(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k)
  for (const k of listeners.keys()) if (k.startsWith(prefix)) notify(k)
}
