// ponytail: self-check, no test runner installed. Run: node src/lib/queryCache.selfcheck.ts
import assert from 'node:assert'
import { fetchWithCache, getCached, invalidate, invalidatePrefix, subscribe } from './queryCache.ts'

async function main() {
  // dedup: 3 concurrent calls to the same key hit the fetcher once
  let calls = 0
  const fetcher = async () => {
    calls++
    return 'a'
  }
  const [r1, r2, r3] = await Promise.all([
    fetchWithCache('k1', fetcher, 1000),
    fetchWithCache('k1', fetcher, 1000),
    fetchWithCache('k1', fetcher, 1000),
  ])
  assert.equal(calls, 1, 'dedup: fetcher debe llamarse una sola vez')
  assert.deepEqual([r1, r2, r3], ['a', 'a', 'a'])

  // cache hit: segunda llamada no vuelve a invocar el fetcher
  await fetchWithCache('k1', fetcher, 1000)
  assert.equal(calls, 1, 'cache hit: no debe refetchear dentro del TTL')
  assert.equal(getCached('k1'), 'a')

  // TTL expirado: refetchea
  await fetchWithCache('k2', fetcher, -1)
  assert.equal(calls, 2)
  assert.equal(getCached('k2'), undefined, 'TTL negativo expira al instante')

  // invalidate: borra y notifica subscriptores
  let notified = 0
  const unsub = subscribe('k1', () => notified++)
  invalidate('k1')
  assert.equal(getCached('k1'), undefined)
  assert.equal(notified, 1)
  unsub()

  // invalidatePrefix: borra todo lo que matchea, no lo demás
  await fetchWithCache('p:1', fetcher, 1000)
  await fetchWithCache('p:2', fetcher, 1000)
  await fetchWithCache('other', fetcher, 1000)
  invalidatePrefix('p:')
  assert.equal(getCached('p:1'), undefined)
  assert.equal(getCached('p:2'), undefined)
  assert.equal(getCached('other'), 'a')

  console.log('queryCache: OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
