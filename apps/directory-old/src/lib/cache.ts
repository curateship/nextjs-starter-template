// Server-side data cache for the Vite/TanStack port.
//
// Next.js used to provide this. The port replaced it with no-op stubs, which
// meant every visitor to every public page paid a full round trip to the
// database. This is a real implementation with the same surface, so the ~28
// existing `unstable_cache` call sites and the ~197 `revalidateTag` calls work
// again without changing any of them.
//
// Scope and limits, deliberately:
//   - The cache lives in this server process. A restart empties it (it refills
//     within seconds). If the app is ever run as more than one instance, each
//     gets its own copy and a `revalidateTag` on one will not reach the others.
//     The fix then is swapping `store` for Redis, inside this file only.
//   - `revalidatePath` stays a no-op. Nothing in this app relies on it doing
//     more; screens update client state themselves after a mutation.
type AsyncFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>

type CacheEntry = {
  value: unknown
  /** Epoch ms after which this entry is stale. `Infinity` = only tag eviction. */
  expiresAt: number
  tags: string[]
}

/**
 * Upper bound on retained entries. Cached values here are whole page payloads,
 * so this is a memory guard, not a tuning knob — a site with thousands of
 * listings must not be able to grow the cache until the process dies. Least
 * recently used entries are dropped first.
 */
const MAX_ENTRIES = 500

/** Insertion order doubles as LRU order: reads re-insert to move an entry last. */
const store = new Map<string, CacheEntry>()

/** tag -> keys carrying that tag, so one tag can evict many entries. */
const tagIndex = new Map<string, Set<string>>()

/**
 * Lookups currently running, so N simultaneous requests for the same cold key
 * make one database call and share its result instead of stampeding.
 */
const inFlight = new Map<string, Promise<unknown>>()

/**
 * Bumped by every `revalidateTag`. A lookup records this before it starts and
 * refuses to store its result if the number moved while it was running, because
 * the data it read may pre-date the save that triggered the invalidation.
 * Without this, an admin save landing mid-lookup leaves stale content cached
 * indefinitely (most entries use `revalidate: false`, so nothing would ever
 * expire it). Deliberately global rather than per-tag: it costs an occasional
 * skipped write, and it cannot grow unboundedly the way a per-tag map keyed on
 * `site-<id>`/`post-<id>` would.
 */
let invalidationEpoch = 0

/** NUL cannot appear in a slug, id or hostname, so keys cannot collide. */
const SEPARATOR = "\u0000"

/**
 * Key parts identify the query; arguments identify the row(s) it asks for. Both
 * matter: call sites use either style. The inline pattern bakes the variables
 * into the key parts and takes no arguments, while module-level cached
 * functions have fixed key parts and vary entirely by argument.
 */
function buildKey(keyParts: string[], args: unknown[]) {
  return `${keyParts.join(SEPARATOR)}${SEPARATOR}${JSON.stringify(args)}`
}

function indexTags(key: string, tags: string[]) {
  for (const tag of tags) {
    let keys = tagIndex.get(tag)
    if (!keys) {
      keys = new Set()
      tagIndex.set(tag, keys)
    }
    keys.add(key)
  }
}

/** Removes an entry and every tag reference to it, leaving no orphaned index. */
function deleteEntry(key: string) {
  const entry = store.get(key)
  if (!entry) return

  store.delete(key)

  for (const tag of entry.tags) {
    const keys = tagIndex.get(tag)
    if (!keys) continue
    keys.delete(key)
    if (keys.size === 0) tagIndex.delete(tag)
  }
}

function evictIfOverCapacity() {
  while (store.size > MAX_ENTRIES) {
    // Map iteration is insertion-ordered, so the first key is least recently used.
    const oldest = store.keys().next()
    if (oldest.done) return
    deleteEntry(oldest.value)
  }
}

function readFresh(key: string): { hit: true; value: unknown } | { hit: false } {
  const entry = store.get(key)
  if (!entry) return { hit: false }

  if (entry.expiresAt <= Date.now()) {
    deleteEntry(key)
    return { hit: false }
  }

  // Mark as most recently used.
  store.delete(key)
  store.set(key, entry)

  return { hit: true, value: entry.value }
}

function write(
  key: string,
  value: unknown,
  revalidate: number | false | undefined,
  tags: string[],
  startedAtEpoch: number
) {
  // Something was invalidated while this lookup ran, so the value may already
  // be out of date. Hand it to the caller, store nothing.
  if (invalidationEpoch !== startedAtEpoch) return

  // `revalidate: 0` (or negative) means the value is stale on arrival — hand it
  // back to this caller but keep nothing.
  if (typeof revalidate === "number" && revalidate <= 0) return

  // Matches Next.js: an absent or `false` revalidate caches until a tag evicts it.
  const expiresAt =
    typeof revalidate === "number" ? Date.now() + revalidate * 1000 : Number.POSITIVE_INFINITY

  deleteEntry(key)
  store.set(key, { value, expiresAt, tags })
  indexTags(key, tags)
  evictIfOverCapacity()
}

export function unstable_cache<TArgs extends unknown[], TResult>(
  fn: AsyncFunction<TArgs, TResult>,
  keyParts?: string[],
  options?: { revalidate?: number | false; tags?: string[] }
): AsyncFunction<TArgs, TResult> {
  // Without key parts there is nothing stable to key on — the inline call sites
  // rebuild the wrapper on every request, so function identity would never
  // match. Pass the call straight through rather than cache it wrongly.
  if (!keyParts || keyParts.length === 0) return fn

  const tags = options?.tags ?? []
  const revalidate = options?.revalidate

  return async (...args: TArgs): Promise<TResult> => {
    const key = buildKey(keyParts, args)

    const cached = readFresh(key)
    if (cached.hit) return cached.value as TResult

    const pending = inFlight.get(key)
    if (pending) return pending as Promise<TResult>

    const startedAtEpoch = invalidationEpoch

    const promise = fn(...args)
      .then(value => {
        write(key, value, revalidate, tags, startedAtEpoch)
        return value
      })
      // Only a fulfilled lookup reaches the write above, so failures are never
      // cached and the next caller retries. This just frees the in-flight slot
      // either way; it does not swallow the rejection.
      .finally(() => {
        inFlight.delete(key)
      })

    inFlight.set(key, promise)

    return promise
  }
}

/**
 * Drops every cached entry carrying `tag`. Most entries also carry `'all'`,
 * which is what the admin "Clear Cache" button relies on.
 */
export function revalidateTag(tag: string, _profile?: string) {
  // Bumped before the early return below: a lookup that is still running has no
  // entry to drop yet, and this is what stops it storing its now-stale result.
  invalidationEpoch += 1

  const keys = tagIndex.get(tag)
  if (!keys) return

  // deleteEntry mutates this set, so iterate a copy. It also drops the tag from
  // the index once the last key carrying it is gone.
  for (const key of [...keys]) deleteEntry(key)
}

export function revalidatePath(_path: string, _type?: "layout" | "page") {}

/** Test-only reset so suites do not leak cached state into each other. */
export function __resetCacheForTests() {
  store.clear()
  tagIndex.clear()
  inFlight.clear()
  invalidationEpoch = 0
}
