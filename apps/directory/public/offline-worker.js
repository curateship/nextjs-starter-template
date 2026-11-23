/*
 * Pages that still open with no signal (docs/shell/offline-pages.md).
 *
 * An app lists the pages it keeps when it registers this worker, as path
 * starts in the address: `/offline-worker.js?pages=%2Ftrips`. Nothing else is
 * kept. With signal every request goes to the server as usual and the answer
 * is kept on the way back; with none, the kept answer is used. So a page is
 * only ever as old as the last time it was opened with signal.
 *
 * - A kept page's address, and every GET it makes to this site (its data and
 *   its code), are kept. A page is kept under its address without the part
 *   after "?", so the same page opened another way still finds its copy. A page that isn't listed, the admin pages among
 *   them, is never kept and passes straight through.
 * - A live feed, such as the notification bell's, never ends, so it passes
 *   straight through and is never kept. Every other answer goes back to the
 *   page first and is kept after, so keeping never slows a page down.
 * - Only GETs are kept. A change sends a POST, which with no signal fails as
 *   it would with no worker, so nothing is saved for later.
 * - Opening the sign-in page, or a different person signing in, empties what
 *   is kept, so the next person on the same phone never sees it.
 * - Code files under /assets/ carry a fingerprint in their names, so a kept
 *   one is used at once and never asked again.
 * - The local dev server's own source files (/src/, /node_modules/, /@vite/
 *   and the like) are left alone. The dev server answers a source file asked
 *   for by a worker with 404, because a worker's requests are marked as a
 *   plain fetch rather than a script, so passing them through would break
 *   every page. Locally, then, a kept page opens with no signal without its
 *   code; the live site has no such files and keeps its code under /assets/.
 *
 * Raise VERSION when this file changes: the new worker replaces the old one
 * on the next visit and empties the old version's stores.
 */

const VERSION = 1
const PAGES = `offline-pages-v${VERSION}`
const FILES = `offline-files-v${VERSION}`
const WHO = `offline-who-v${VERSION}`
const OURS = [PAGES, FILES, WHO]
/**
 * Enough for a few trips' pages, data and code; older answers make room. The
 * local dev server sends every source file on its own, hundreds of them, so
 * the room is for that as much as for the live site's few code files.
 */
const MOST_FILES = 2000
const MOST_PAGES = 60

const KEPT = (new URL(self.location.href).searchParams.get("pages") || "")
  .split(",")
  .map((path) => path.trim())
  .filter((path) => path.startsWith("/"))

/** Pages that mean nobody is signed in, or someone else is about to be. */
const SIGN_IN = ["/login", "/register", "/sign-in-link", "/forgot-password", "/reset-password"]

/** Paths only the local dev server has. */
const DEV_SOURCE = ["/src/", "/node_modules/", "/@", "/__"]
const isDevSource = (path) => DEV_SOURCE.some((start) => path.startsWith(start))

const isKept = (path) => KEPT.some((start) => path === start || path.startsWith(`${start}/`))
const isSignIn = (path) => SIGN_IN.some((start) => path === start || path.startsWith(`${start}/`))

self.addEventListener("install", () => {
  // A new worker takes over at once, rather than waiting for every tab to close.
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("offline-") && !OURS.includes(name)) await caches.delete(name)
      }
      await self.clients.claim()
    })()
  )
})

async function forget() {
  await Promise.all([caches.delete(PAGES), caches.delete(FILES)])
}

/** The person signed in now. Someone else than last time empties what was kept. */
async function signedIn(userId) {
  const store = await caches.open(WHO)
  const key = new Request("/__offline-who")
  const was = await store.match(key)
  const before = was ? await was.text() : ""
  if (before === String(userId || "")) return
  await forget()
  await store.put(key, new Response(String(userId || "")))
}

self.addEventListener("message", (event) => {
  const data = event.data || {}
  if (data.type === "signed-in") event.waitUntil(signedIn(data.userId))
  if (data.type === "forget") event.waitUntil(forget())
})

/** Drops the oldest answers past the most a store keeps. */
async function trim(store, most) {
  const keys = await store.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - most))) await store.delete(key)
}

/** A live feed (the notification bell's) never ends, so it can't be kept and is passed straight on. */
const isStream = (request) => (request.headers.get("accept") || "").includes("text/event-stream")
const keepable = (answer) =>
  answer.ok && answer.type === "basic" && !(answer.headers.get("content-type") || "").includes("text/event-stream")

/** Keeps an answer after it has gone back to the page, so keeping never slows it down. */
function keepLater(event, name, most, key, answer) {
  event.waitUntil(
    (async () => {
      const store = await caches.open(name)
      await store.put(key, answer)
      await trim(store, most)
    })().catch(() => undefined)
  )
}

/**
 * The server first, kept on the way back; the kept answer when there is no
 * signal. `key` is what the answer is kept under, the request itself unless
 * said otherwise.
 */
async function serverFirst(event, name, most, missing, key = event.request) {
  try {
    const answer = await fetch(event.request)
    if (keepable(answer)) keepLater(event, name, most, key, answer.clone())
    return answer
  } catch (error) {
    const store = await caches.open(name)
    const kept = await store.match(key)
    if (kept) return kept
    if (missing) return missing()
    throw error
  }
}

/** A kept code file at once; the server only for one not seen before. */
async function keptFirst(event) {
  const store = await caches.open(FILES)
  const kept = await store.match(event.request)
  if (kept) return kept
  const answer = await fetch(event.request)
  if (keepable(answer)) keepLater(event, FILES, MOST_FILES, event.request, answer.clone())
  return answer
}

/** What a kept page that was never opened with signal shows with none. */
function notKeptYet() {
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No signal</title></head>
<body style="font-family: system-ui, sans-serif; margin: 0; display: grid; min-height: 100vh; place-items: center; padding: 16px; box-sizing: border-box;">
<main style="max-width: 22rem; text-align: center;">
<h1 style="font-size: 1.125rem; margin: 0 0 8px;">No signal</h1>
<p style="margin: 0; color: #666; line-height: 1.5;">This page hasn't been opened on this phone with signal yet, so there's no copy of it. Open it once with signal first, then it opens without.</p>
</main></body></html>`
  return new Response(page, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } })
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    if (isSignIn(url.pathname)) {
      event.waitUntil(forget())
      return
    }
    if (!isKept(url.pathname)) return
    // A page is kept under its address without the part after "?", so a trip opened on another
    // card (?open=…) still finds the copy kept from the last visit.
    event.respondWith(serverFirst(event, PAGES, MOST_PAGES, notKeptYet, `${url.origin}${url.pathname}`))
    return
  }

  if (isDevSource(url.pathname) || isStream(request)) return

  // Anything else is kept only when a kept page asked for it.
  event.respondWith(
    (async () => {
      const client = event.clientId ? await self.clients.get(event.clientId) : null
      if (!client || !isKept(new URL(client.url).pathname)) return fetch(request)
      if (url.pathname.startsWith("/assets/")) return keptFirst(event)
      return serverFirst(event, FILES, MOST_FILES, null)
    })()
  )
})
