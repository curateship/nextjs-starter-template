# Navigation blank-flash (the "clicking reloads the page" bug)

## Symptom

Clicking a link — most visibly a card in a listing-view block — makes the whole
page flash **blank white** for a fraction of a second, then the new page draws
in. Users describe it as "the page keeps refreshing" or "some links load like an
SPA and others don't."

Key facts that pin down what it is (and isn't):

- **Not a real browser reload.** The browser tab shows no loading spinner, and a
  `window` marker set before the click survives, so the document is never
  reloaded. It is a client-side navigation with a blank gap in the middle.
- **Not hydration timing.** It still happens 10s after load and after hovering
  the link, so it is not "the page isn't interactive yet."
- **Deployment only.** Invisible on localhost, visible on every deployed site.
- **Intermittent.** A page that's already cached swaps instantly; an uncached
  one flashes.

## Root cause

Every public page is server-rendered by the `loadRenderedPage` server function
(`src/lib/page-renderer.tsx`) and delivered as a single RSC `Renderable` through
the catch-all route `src/routes/$.tsx`. There is no client-side rendering of a
destination page — the server rebuilds the entire page (nav + layout + content)
on every navigation.

On navigation the `/$` route component re-renders (same instance, no remount)
with the **new** page's `Renderable`. Rendering that new tree **suspends** while
its client-component chunks and RSC stream load. Nothing tells React to hold the
current page during that suspense, so React unmounts the current page and shows
**nothing** until the new one is ready.

- On localhost the server round-trip is ~instant, so the blank is a frame or two
  — invisible.
- On a deployed server it is a few hundred ms (network + DB + render), so the
  blank is long enough to read as a reload.

The "some links are fine" behaviour is just caching: a route whose loader data
is already cached swaps synchronously (no suspense, no blank); an uncached route
has to wait for the server, so it flashes.

## The fix

`src/routes/$.tsx`, in the route component:

```tsx
function RenderedPage() {
  const data = Route.useLoaderData()
  const shown = useDeferredValue(data)
  if (!shown) return null
  return <>{shown.Renderable}</>
}
```

`useDeferredValue` marks the swap as non-urgent. React keeps the **current**
page committed and visible while it renders the next page in the background; if
that background render suspends, React keeps showing the current page and only
swaps once the next page is fully ready. Net result: a navigation is a plain
content swap with **zero blank frames**.

This works only because the `/$` component instance is **reused** across
navigations (verified with a mount counter — the id stays constant), so the
deferred value correctly lags to the previously rendered page.

## Why the obvious fixes do NOT work

The blank is a React **suspense** of the new content, not a missing-data or a
router-pending problem. Confirmed by instrumentation: during the flash the
component renders exactly once, with `hasData === true` and the new path, and
never unmounts. Therefore these all failed and were discarded:

- `if (!data) return null` fallback / holding the previous data in a `useRef` —
  `data` is never null here, so the fallback never fires.
- A module-scoped "last renderable" held across remounts — the component doesn't
  remount, and it still blanks because the new render suspends.
- Route-level `pendingComponent` + `pendingMs: 0` — the blank isn't the router's
  pending state; it's React suspending the committed tree.

Only deferring the value (keeping the old tree during the new tree's suspense)
addresses it.

## Possible complications / caveats

- **It hides the delay, it doesn't remove it.** The navigation still costs a
  full server round-trip. With the fix there's no blank, but the current page
  stays on screen with **no loading indicator** for that time, so a click can
  feel unresponsive and a user may click again. If this becomes a problem, add a
  top progress bar driven by the router's pending state — do **not** revert to
  showing blank.
- **Brief URL/content mismatch.** During the deferred window the URL is already
  the new path while the visible content is still the old page. The document
  `head` (title/meta) comes from `loaderData`, which is **not** deferred, so the
  browser tab title can change to the new page slightly before its content does.
  Cosmetic only.
- **Depends on the `/$` component not remounting.** The fix relies on TanStack
  Router reusing the same component instance across param changes. If a future
  router upgrade remounts it, or someone adds a `key`/`remountDeps` to the route,
  the deferred value resets every navigation and the blank returns. If the flash
  ever comes back, check this first.
- **Not an architectural fix.** The deeper cost is that every navigation
  re-renders the entire page (including the unchanged nav/layout) on the server.
  `useDeferredValue` is a targeted patch for the visible symptom. A real fix
  would render destinations on the client or keep the layout stable across
  navigations; until then, page loads that get much slower will feel laggy even
  without the blank.
- **`/admin/$` has the same latent bug.** `src/routes/admin/$.tsx` uses the same
  `if (!data) return null` shape and will flash the same way on a slow server.
  Apply the identical `useDeferredValue` fix there if it surfaces.
- **SEO: no impact.** `useDeferredValue` is client-only. Server-side it returns
  the value straight through and renders the full page, so a crawler (which
  fetches each URL directly rather than doing in-app swaps) gets complete HTML —
  title, headings, body text, and links — exactly as before.

## How to reproduce / verify

The flash exists only in a **production build** (dev doesn't code-split, so
there's no suspense gap). It is invisible without added latency because the
local server is instant.

1. Build: `npm run build` (needs `VITE_APP_URL` / `VITE_APP_DOMAIN`).
2. Serve the output on a spare port:
   `PORT=3099 NODE_ENV=production node --env-file=.env.development.local .output/server/index.mjs`
   (tenant host `test-site.localhost:3099`).
3. Drive it with Playwright and add latency via CDP
   `Network.emulateNetworkConditions({ latency: 300, ... })` so the server
   round-trip is visible, then poll `document.body.innerText.length` every ~80ms
   through a click.

`textLen` dropping to `0` mid-navigation is the flash. Before the fix:
`........████▁▁` (blank for ~4 frames). After: `........▁▁▁▁` (never 0).

The naive check — "did the document reload?" via a surviving `window` marker —
always reports "no", which is why this looks like a non-bug from the outside.
Measure the blank by watching the rendered text length, not by checking for a
reload.
