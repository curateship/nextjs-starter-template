# Admin Dashboard Performance Optimization — Phase 2

**Date**: March 15, 2026
**Goal**: Reduce admin page load from ~0.6s to ~0.3-0.4s
**Predecessor**: Phase 1 brought loads from ~1.5-2s to ~0.6s (server layout, cached settings, combined actions, site context)

---

## Changes Made

### 1. Pass User Data from Server Layout to Sidebar (~50-100ms saved)

**Problem**: `AppSidebar` called `supabase.auth.getSession()` + set up `onAuthStateChange` listener client-side on every page mount just to get name/email for the user menu.

**Fix**: The server layout already had the authenticated `user` object. Extracted `{ name, email }` and passed it as a prop through `AdminClientShell` to `AppSidebar`.

**Files modified**:
- `src/app/admin/layout.tsx` — extract name/email from user object, pass as prop
- `src/app/admin/admin-client-shell.tsx` — accept and forward `user` prop
- `src/components/admin/layout/sidebar/AppSidebar.tsx` — accept `user` prop, removed entire `useEffect` (40 lines), removed `loading`/`user` state, removed `createClient` import

**What was removed**: Client-side Supabase auth call, WebSocket `onAuthStateChange` listener, `loading` and `user` state, `createClient` import.

---

### 2. Synchronous Site Initialization (~50-100ms saved)

**Problem**: `SiteProvider` set `currentSite` inside a `useEffect`, meaning child components didn't see it until the next render cycle. Their own `useEffect` to fetch data then fired one render cycle late.

**Fix**: Moved site selection logic into `useState` initializer callback. Reads `localStorage` synchronously during the first render (with UUID regex validation). `currentSite` is now available on the very first render.

**File modified**: `src/contexts/site-context.tsx`

**Before**:
```ts
const [currentSite, setCurrentSite] = useState<SiteWithTheme | null>(null)
// useEffect to read localStorage and setCurrentSite...
```

**After**:
```ts
const [currentSite, setCurrentSite] = useState<SiteWithTheme | null>(() => {
  if (!initialSites || initialSites.length === 0) return null
  if (typeof window === 'undefined') return initialSites[0]
  const savedId = localStorage.getItem('selectedSiteId')
  // UUID validation + find in initialSites...
  return initialSites[0]
})
```

---

### 3. Removed Unused `useRouter` Imports (~10-20ms saved)

**Problem**: Several list pages imported `useRouter` and called `useRouter()` but never used the returned `router` object (navigation was done via `<Link>` instead).

**Files cleaned**:
- `src/app/admin/posts/page.tsx`
- `src/app/admin/products/page.tsx`
- `src/app/admin/directories/page.tsx`
- `src/app/admin/events/page.tsx`
- `src/app/admin/sites/[siteId]/pages/page.tsx`
- `src/app/admin/user-pages/[siteId]/page.tsx`

Also cleaned unused Dialog imports (`DialogContent`, `DialogTrigger`) from posts, products, directories, and events pages.

---

### 4. Lazy-Loaded Modals with `dynamic()` (~30-50ms saved)

**Problem**: Every list page statically imported heavy modal components (CreatePostModal, PostSettingsModal, etc.) at mount time, even though modals only show on button click.

**Fix**: Converted to `next/dynamic` imports with `{ ssr: false }`:

```ts
const CreatePostModal = dynamic(() =>
  import("@/components/admin/post-builder/layout/CreatePostModal")
    .then(m => ({ default: m.CreatePostModal })),
  { ssr: false }
)
```

**Files modified** (14 modal components across 7 pages):
- `src/app/admin/posts/page.tsx` — CreatePostModal, PostSettingsModal
- `src/app/admin/products/page.tsx` — CreateProductModal, ProductSettingsModal
- `src/app/admin/directories/page.tsx` — CreateDirectoryModal, DirectorySettingsModal
- `src/app/admin/events/page.tsx` — CreateEventModal, EventSettingsModal
- `src/app/admin/newsletters/page.tsx` — CreateNewsletterModal, NewsletterSettingsModal
- `src/app/admin/sites/[siteId]/pages/page.tsx` — CreatePageModal, PageSettingsModal
- `src/app/admin/user-pages/[siteId]/page.tsx` — CreateUserPageModal, UserPageSettingsModal

---

### 5. Batched Segment Contact Counts (Segments Page Fix)

**Problem**: The newsletter segments page fired N separate `getSegmentContactCount` server action calls (one per segment), each doing its own `verifyAuth()` + `verifySiteOwnership()` + DB query. For 10 segments, that's 10 auth checks + 10 ownership checks + 10 DB queries.

**Fix**: Created a new `getSegmentContactCounts` batch action that does one auth check, one ownership check, then runs all count queries in parallel. Also switched the page from hardcoded `pageSize = 50` to using `contextPageSize` from `SiteProvider`.

**Files modified**:
- `src/lib/actions/newsletters/segment-actions.ts` — added `getSegmentContactCounts()` batch function
- `src/app/admin/newsletters/segments/page.tsx` — use batch function, use `contextPageSize`

---

## Expected Performance Impact

| Optimization | Estimated Savings |
|---|---|
| Sidebar auth removal | ~50-100ms |
| Synchronous site init | ~50-100ms |
| Lazy modals | ~30-50ms |
| Dead code cleanup | ~10-20ms |
| Segment batch counts | ~200-500ms (segments page only) |
| **Total (general admin pages)** | **~140-270ms** |

From ~0.6s target to ~0.3-0.45s on general admin pages.

---

## Security Notes

- User data passed as props is display-only (name, email) — extracted server-side from authenticated user object
- `localStorage` read in `useState` initializer uses UUID regex validation before matching against server-provided sites array
- `getSegmentContactCounts` validates siteId format, verifies auth, and verifies site ownership before any DB queries
- Known improvement area: the batch function currently trusts client-supplied `filter_rules` instead of fetching from DB — low risk since Supabase parameterizes queries, but could be hardened by fetching segment rules from the database by ID
