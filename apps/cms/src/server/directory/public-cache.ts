/**
 * Short-lived answers for public directory pages.
 *
 * Only shared public data belongs here. A cached value may depend on the site
 * and the page request, but never on the signed-in viewer, their session, or
 * any other request state. Viewer-specific pieces must be read after this
 * cache returns.
 */

const PUBLIC_DIRECTORY_CACHE_TTL_MS = 2 * 60 * 1000

// Match the edit-form prefetch cache. Public pages are larger, so letting this
// grow without the same hard stop would turn traffic into a memory leak.
const MAX_ENTRIES = 60

type CacheEntry = {
  siteId: string
  expiresAt: number
  value: unknown
}

type PendingEntry = {
  generation: number
  promise: Promise<unknown>
}

const entries = new Map<string, CacheEntry>()
const pending = new Map<string, PendingEntry>()
let generation = 0

function cacheKey(siteId: string, page: string, request: unknown): string {
  return JSON.stringify([siteId, page, request])
}

/** Remember one public page, sharing an in-progress read with matching visits. */
export async function cachedPublicDirectoryRead<T>(
  siteId: string,
  page: string,
  request: unknown,
  read: () => Promise<T>,
  shouldCache: (value: T) => boolean = (value) => value !== null
): Promise<T> {
  const key = cacheKey(siteId, page, request)
  const existing = entries.get(key)
  if (existing) {
    if (existing.expiresAt > Date.now()) return existing.value as T
    entries.delete(key)
  }

  const currentGeneration = generation
  const waiting = pending.get(key)
  if (waiting?.generation === currentGeneration) {
    return waiting.promise as Promise<T>
  }

  const promise = read()
  const pendingEntry: PendingEntry = { generation: currentGeneration, promise }
  pending.set(key, pendingEntry)

  try {
    const value = await promise
    // A write that landed while the read was running makes its answer stale.
    if (generation === currentGeneration && shouldCache(value)) {
      while (entries.size >= MAX_ENTRIES) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
      entries.set(key, {
        siteId,
        expiresAt: Date.now() + PUBLIC_DIRECTORY_CACHE_TTL_MS,
        value,
      })
    }
    return value
  } finally {
    if (pending.get(key) === pendingEntry) pending.delete(key)
  }
}

/** Forget every public page for this site, leaving every other site alone. */
export function clearPublicDirectoryCache(siteId: string): number {
  generation += 1
  let cleared = 0
  for (const [key, entry] of entries) {
    if (entry.siteId !== siteId) continue
    entries.delete(key)
    cleared += 1
  }
  return cleared
}

/** Test isolation for this process-local cache. */
export function resetPublicDirectoryCacheForTests(): void {
  generation += 1
  entries.clear()
  pending.clear()
}

/** Test evidence for the hard cap and site-specific clearing. */
export function publicDirectoryCacheSizeForTests(): number {
  return entries.size
}
