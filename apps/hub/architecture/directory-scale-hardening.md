# Directory Scale Hardening

## Why This Exists

HUB directories are expected to grow to at least:

- `100k` directory items on a single site
- `1m` total directory items across multiple sites

The goal was to make that scale work **without** changing the product model.

We did **not** want to:

- replace directories with a separate listings system
- add a second main table for directory items
- remove page-builder editing from directory items

## Core Decision

Keep the existing `directory` table as the canonical model.

That means:

- one `directory` row is still one directory item
- directory detail pages still load the canonical row by `site_id + slug`
- `content_blocks` remains the source of truth for page-builder content

The scale fix is at the **physical/query layer**, not the product layer.

## The Real Bottleneck

The main problem was not just “too many rows”.

The real issue was:

- `directory` rows are relatively heavy because they include `content_blocks`
- some read paths were doing too much work for large datasets

At scale, list/search/admin flows should not keep touching the heavy JSON payload.

The rule is:

- summary/list/search/admin paths read lean indexed columns only
- detail-page and builder-edit paths can read full `content_blocks`

## What We Built

### 1. Kept The Existing Table

We did **not** add a new main directory table.

The canonical table is still:

- `src/lib/db/schema/directories.ts`

We now use one top-level state field:

- `status`

Allowed values:

- `draft`
- `published`

### 2. Added Read-Path Indexes

Directory indexes now support:

- site-scoped slug lookup
- site-scoped default ordering
- published/private list filters
- updated-at sorting
- lowercased title sorting

Category relationships also got a reverse index so category-filtered directory queries are cheaper.

### 3. Added A Lean Directory Summary Query Layer

Large directory lists now go through:

- `src/lib/actions/directories/directory-list-actions.ts`

This layer:

- returns lightweight summary rows
- avoids `content_blocks`
- supports server-side search
- supports server-side status/category filters
- uses cursor pagination instead of deep offset pagination in admin UI

### 4. Updated Admin Directory Listing

The directory admin page now:

- loads summary rows instead of full directory records
- uses server-side counts and filters
- uses cursor pagination
- loads the full directory only when opening settings

Relevant file:

- `src/app/admin/directories/page.tsx`

### 5. Updated Directory Builder Loading

The directory builder no longer preloads large site-wide directory datasets.

Instead it:

- loads the selected directory item
- loads a small searchable picker for switching items

Relevant files:

- `src/app/admin/directories/builder/[siteId]/page.tsx`
- `src/components/admin/directory-builder/config/useDirectoryData.ts`

### 6. Unified Directory State Around `status`

Directory create/update flows now use a single `status` field.

The rule is:

- `draft` means not publicly visible
- `published` means live

There is no separate directory privacy state anymore.

Relevant files:

- `src/app/api/directories/route.ts`
- `src/app/api/directories/[directoryId]/route.ts`
- `src/lib/actions/directories/directory-actions.ts`
- `src/components/admin/directory-builder/layout/DirectorySettingsModal.tsx`

### 7. Hardened Sitemap Generation

Large directory sites cannot safely dump every directory URL into one naive sitemap flow.

The sitemap now works like this:

- `/sitemap.xml` returns a sitemap index
- `/content-sitemap` returns non-directory published content
- `/directory-sitemaps/[chunk]` returns directory URLs in chunks

Relevant files:

- `src/app/sitemap.xml/route.ts`
- `src/app/content-sitemap/route.ts`
- `src/app/directory-sitemaps/[chunk]/route.ts`
- `src/lib/utils/sitemap.ts`

### 8. Batched Directory Reads In Site Audit

Site-audit directory reads were updated so they do not assume the full directory dataset can be loaded in one naive read path.

Relevant file:

- `src/lib/actions/site-audit/site-audit-actions.ts`

### 9. Added Operational Support

Supporting pieces added:

- migration for directory scale indexes and the later `status` conversion
- seed script for large directory datasets
- env-driven Postgres pool sizing

Relevant files:

- `migrations/129_harden_directory_scale.sql`
- `migrations/130_replace_directory_publish_privacy_with_status.sql`
- `scripts/seed-directory-scale.ts`
- `src/lib/db/index.ts`

## What Did Not Change

These things are still true:

- `directory` is still the source of truth
- `content_blocks` is still canonical for directory page-builder content
- directory detail pages still render the real full row
- this is still one HUB app, not a split-out directory service

## Working Rule Going Forward

If a future directory feature needs to search, sort, or filter on some value at scale:

1. Do **not** query that value out of `content_blocks` for large list paths.
2. Mirror that value into a normal top-level column.
3. Add the index that matches the actual query.
4. Keep summary/list paths lean.

## Operational Notes

Recommended production posture for large directory datasets:

- run HUB app and Postgres on separate servers
- keep Postgres on dedicated NVMe-backed resources
- tune the PG pool with env vars instead of hardcoded values

The code now supports:

- `PGPOOL_MAX`
- `PG_IDLE_TIMEOUT_MS`
- `PG_CONNECT_TIMEOUT_MS`

## Summary

The architecture choice was:

- keep the existing directory product model
- avoid premature redesign
- harden the query layer now so `100k/site` and `1m total` are realistic targets

That is what this implementation does.
