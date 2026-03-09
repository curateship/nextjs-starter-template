---
name: caching
description: Add server-side caching to Supabase data fetchers using Next.js unstable_cache. Use this skill whenever adding a new cached fetcher, wrapping an existing query in a cache, or adding cache invalidation to an admin action. Also trigger when the user mentions caching, cache tags, revalidation, or asks to speed up a data query — even if they don't say "cache" explicitly.
---

# Caching Skill

This project caches server-side Supabase queries using `unstable_cache` from `next/cache`. Every cached entry gets a domain-specific tag plus the global `'all'` tag (so the admin "Clear Cache" button works).

## When to Cache

Cache any Supabase query that runs on public page loads and doesn't need real-time freshness. Don't cache admin/dashboard queries — those should always be fresh.

## Adding a Cached Fetcher

### 1. Choose your parameters

- **Cache key**: Descriptive name + all dynamic parameters as an array
- **Domain tag**: A short label for this data type (e.g., `'event-lookup'`, `'directory-listing'`)
- **TTL**: `revalidate: false` for content that only changes when a user edits it; `revalidate: 3600` for listing/aggregate data

### 2. Write the cached function

Two patterns exist in the codebase. Use whichever fits:

**Pattern A — function that returns the cache call** (preferred for per-parameter caching):
```ts
import { unstable_cache } from 'next/cache'

export async function getCachedEventBySlug(siteId: string, slug: string) {
  return unstable_cache(
    async () => {
      const { data, error } = await supabaseAdmin
        .from('events')
        .select('*')
        .eq('site_id', siteId)
        .eq('slug', slug)
        .eq('is_published', true)
        .single()

      if (error || !data) return null
      return data
    },
    ['event-by-slug', siteId, slug],
    { revalidate: false, tags: ['event-lookup', 'all'] }
  )()
}
```

**Pattern B — module-level cached const** (used for listing queries with many params):
```ts
const getCachedListingData = unstable_cache(
  async (siteId: string, sortBy: string, limit: number, offset: number) => {
    // ... query logic
  },
  ['listing-data'],
  { revalidate: 3600, tags: ['listing-views', 'all'] }
)
```

### 3. Add cache invalidation

In the admin action file that modifies this data, add a `revalidateTag()` call:

```ts
import { revalidateTag } from 'next/cache'

// Inside the action that creates/updates/deletes the data:
revalidateTag('event-lookup')
```

Look at the existing admin actions for the content type — the revalidateTag call goes right after the successful Supabase mutation.

## Checklist

- [ ] `unstable_cache` wraps the Supabase query
- [ ] Cache key array includes all dynamic parameters
- [ ] Tags include both a domain-specific tag AND `'all'`
- [ ] TTL is appropriate (`false` for edited content, `3600` for listings)
- [ ] `revalidateTag('your-tag')` added to the relevant admin create/update/delete actions
- [ ] The cached function is used in place of the original direct query

## Reference Files

- `src/lib/actions/pages/page-frontend-actions.ts` — site/page cache examples (Pattern A)
- `src/lib/actions/pages/page-listing-views-actions.ts` — listing cache example (Pattern B)
- `src/lib/actions/posts/related-posts-actions.ts` — related posts cache
- `src/lib/actions/sites/site-actions.ts` — invalidation example (`revalidateTag('site-lookup')`)
- `src/app/api/cache/clear/route.ts` — global clear endpoint (uses `revalidateTag('all')`)
- `docs/performance/Caching.md` — full caching documentation
