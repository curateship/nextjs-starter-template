# Performance

## Prefer Joined Reads

When a request needs related data together, prefer one joined query over sequential lookups.

Good candidates:

- Loading a site and its page content
- Fetching listing items with their owner/site metadata
- Filtering content by category relationships

Avoid this shape when possible:

```text
1. Look up site by host
2. Look up the same site again by subdomain
3. Look up page by siteId + slug
```

Prefer this shape:

```text
1. Look up site + matching page in one joined query
```

## Example: Public Site Resolver

The public homepage used to resolve the site first, then reload the site by subdomain, then fetch the page:

```text
resolveSiteByHost(host)
getSiteBySubdomain(subdomain)
getCachedPage(siteId, "home")
```

That was reduced to a single cached joined read:

```text
sites
left join pages
  on pages.site_id = sites.id
  and pages.slug = pageSlug
  and pages.is_published = true
```

The public render path now loads `site + page` together through `getSiteByHost()`.

Result:

```text
Before: 3 + N queries
After:  1 + N queries
```

`N` is the number of listing-view blocks on the page. Each listing-view block should also stay at one query, including category filtering, by joining category relationships instead of making a separate relationship lookup.
