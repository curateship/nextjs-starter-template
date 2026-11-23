import assert from "node:assert/strict"
import test, { beforeEach } from "node:test"

import { __resetCacheForTests, revalidateTag, unstable_cache } from "./cache"

beforeEach(() => {
  __resetCacheForTests()
})

/** Counts how many times the underlying (expensive) lookup actually ran. */
function counted<T>(value: T) {
  let calls = 0
  const fn = async () => {
    calls += 1
    return value
  }
  return { fn, calls: () => calls }
}

test("second call for the same key skips the lookup", async () => {
  const { fn, calls } = counted("page")
  const cached = unstable_cache(fn, ["page-data", "site-1", "plumbers"], {
    revalidate: false,
    tags: ["categories", "all"],
  })

  assert.equal(await cached(), "page")
  assert.equal(await cached(), "page")
  assert.equal(calls(), 1)
})

test("different key parts do not share an entry", async () => {
  const { fn, calls } = counted("page")

  await unstable_cache(fn, ["page-data", "site-1", "plumbers"], { revalidate: false })()
  await unstable_cache(fn, ["page-data", "site-1", "electricians"], { revalidate: false })()

  assert.equal(calls(), 2)
})

test("arguments are part of the key for module-level cached functions", async () => {
  let calls = 0
  const cached = unstable_cache(
    async (siteId: string, limit: number) => {
      calls += 1
      return `${siteId}:${limit}`
    },
    ["listing-data"],
    { revalidate: false, tags: ["all"] }
  )

  assert.equal(await cached("site-1", 10), "site-1:10")
  assert.equal(await cached("site-1", 20), "site-1:20")
  assert.equal(await cached("site-1", 10), "site-1:10")

  assert.equal(calls, 2)
})

test("entries expire once revalidate seconds have passed", async t => {
  t.mock.timers.enable({ apis: ["Date"] })

  const { fn, calls } = counted("related")
  const cached = unstable_cache(fn, ["related-posts"], { revalidate: 3600, tags: ["all"] })

  await cached()
  t.mock.timers.tick(3599 * 1000)
  await cached()
  assert.equal(calls(), 1, "still fresh just before the window closes")

  t.mock.timers.tick(2 * 1000)
  await cached()
  assert.equal(calls(), 2, "re-fetched once stale")
})

test("revalidate: false keeps the entry until a tag evicts it", async t => {
  t.mock.timers.enable({ apis: ["Date"] })

  const { fn, calls } = counted("settings")
  const cached = unstable_cache(fn, ["admin-settings"], {
    revalidate: false,
    tags: ["admin-settings"],
  })

  await cached()
  t.mock.timers.tick(30 * 24 * 3600 * 1000)
  await cached()
  assert.equal(calls(), 1)

  revalidateTag("admin-settings")
  await cached()
  assert.equal(calls(), 2)
})

test("revalidateTag clears every entry carrying the tag and leaves others alone", async () => {
  const posts = counted("posts")
  const events = counted("events")
  const settings = counted("settings")

  const cachedPosts = unstable_cache(posts.fn, ["post-page", "site-1"], {
    revalidate: false,
    tags: ["posts", "site-1", "all"],
  })
  const cachedEvents = unstable_cache(events.fn, ["event-page", "site-1"], {
    revalidate: false,
    tags: ["events", "site-1", "all"],
  })
  const cachedSettings = unstable_cache(settings.fn, ["admin-settings"], {
    revalidate: false,
    tags: ["admin-settings"],
  })

  await cachedPosts()
  await cachedEvents()
  await cachedSettings()

  revalidateTag("posts")
  await cachedPosts()
  await cachedEvents()
  await cachedSettings()

  assert.equal(posts.calls(), 2, "the tagged entry was dropped")
  assert.equal(events.calls(), 1, "an untagged entry survived")
  assert.equal(settings.calls(), 1)

  // 'all' is on most entries; it is what the admin Clear Cache button uses.
  revalidateTag("all")
  await cachedPosts()
  await cachedEvents()
  await cachedSettings()

  assert.equal(posts.calls(), 3)
  assert.equal(events.calls(), 2)
  assert.equal(settings.calls(), 1, "entries without 'all' are untouched")
})

test("revalidateTag on an unknown tag is a no-op", async () => {
  const { fn, calls } = counted("page")
  const cached = unstable_cache(fn, ["page-data"], { revalidate: false, tags: ["all"] })

  await cached()
  revalidateTag("never-used")
  await cached()

  assert.equal(calls(), 1)
})

test("a tag stays usable after the entries it pointed at were replaced", async () => {
  const { fn, calls } = counted("page")
  const cached = unstable_cache(fn, ["page-data"], { revalidate: false, tags: ["posts", "all"] })

  await cached()
  revalidateTag("posts")
  await cached()
  revalidateTag("posts")
  await cached()

  assert.equal(calls(), 3, "the tag index was rebuilt on each write")
})

test("simultaneous callers of a cold key share one lookup", async () => {
  let calls = 0
  let release: (value: string) => void = () => {}
  const pending = new Promise<string>(resolve => {
    release = resolve
  })

  const cached = unstable_cache(
    async () => {
      calls += 1
      return pending
    },
    ["stampede"],
    { revalidate: false, tags: ["all"] }
  )

  const inFlight = [cached(), cached(), cached()]
  release("once")

  assert.deepEqual(await Promise.all(inFlight), ["once", "once", "once"])
  assert.equal(calls, 1)
})

test("a save landing mid-lookup is not overwritten by the stale in-flight result", async () => {
  let calls = 0
  let release: (value: string) => void = () => {}
  const pending = new Promise<string>(resolve => {
    release = resolve
  })

  const cached = unstable_cache(
    async () => {
      calls += 1
      // Only the first lookup is slow; later ones return the saved value.
      return calls === 1 ? pending : "after-save"
    },
    ["mid-flight-save"],
    { revalidate: false, tags: ["posts", "all"] }
  )

  const slow = cached()

  // The admin saves while the first lookup is still running.
  revalidateTag("posts")

  release("before-save")
  assert.equal(await slow, "before-save", "the in-flight caller still gets its own result")

  // The stale value must not have been stored, so the next visitor re-reads.
  assert.equal(await cached(), "after-save")
  assert.equal(calls, 2)

  // Normal caching resumes once no save is racing the lookup.
  assert.equal(await cached(), "after-save")
  assert.equal(calls, 2)
})

test("a failed lookup is not cached and the next caller retries", async () => {
  let calls = 0
  const cached = unstable_cache(
    async () => {
      calls += 1
      if (calls === 1) throw new Error("db down")
      return "recovered"
    },
    ["flaky"],
    { revalidate: false, tags: ["all"] }
  )

  await assert.rejects(cached(), /db down/)
  assert.equal(await cached(), "recovered")
  assert.equal(calls, 2)
})

test("a failure rejects every caller waiting on the same lookup", async () => {
  let calls = 0
  const cached = unstable_cache(
    async () => {
      calls += 1
      throw new Error("db down")
    },
    ["flaky-shared"],
    { revalidate: false }
  )

  const results = await Promise.allSettled([cached(), cached()])

  assert.deepEqual(
    results.map(r => r.status),
    ["rejected", "rejected"]
  )
  assert.equal(calls, 1)
})

test("least recently used entries are evicted once the cache is full", async () => {
  let calls = 0
  const cached = unstable_cache(
    async (id: number) => {
      calls += 1
      return id
    },
    ["capacity"],
    { revalidate: false, tags: ["all"] }
  )

  // MAX_ENTRIES is 500; fill it exactly, then keep entry 0 hot.
  for (let id = 0; id < 500; id += 1) await cached(id)
  assert.equal(calls, 500)

  await cached(0)
  assert.equal(calls, 500, "entry 0 is still cached, and is now most recently used")

  // Overflow by one: the least recently used entry (1) goes, entry 0 stays.
  await cached(500)
  assert.equal(calls, 501)

  await cached(0)
  assert.equal(calls, 501, "recently used entry survived eviction")

  await cached(1)
  assert.equal(calls, 502, "least recently used entry was evicted")
})

test("revalidate: 0 returns a value but caches nothing", async () => {
  const { fn, calls } = counted("uncacheable")
  const cached = unstable_cache(fn, ["no-store"], { revalidate: 0, tags: ["all"] })

  assert.equal(await cached(), "uncacheable")
  assert.equal(await cached(), "uncacheable")
  assert.equal(calls(), 2)
})

test("missing key parts fall back to calling through uncached", async () => {
  const { fn, calls } = counted("passthrough")

  const noParts = unstable_cache(fn)
  await noParts()
  await noParts()

  const emptyParts = unstable_cache(fn, [])
  await emptyParts()

  assert.equal(calls(), 3)
})
