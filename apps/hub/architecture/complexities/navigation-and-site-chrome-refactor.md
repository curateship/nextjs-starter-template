# Navigation And Site Chrome Refactor

This note records the navigation and footer cleanup that moved site chrome out of fake block patterns and into shared site structure.

## Why This Change Happened

We had several overlapping problems:

- navigation and footer were being treated like fake page blocks in some builders
- pages and account-pages were storing site chrome in separate nested settings paths
- public pages, account pages, and other content types were not all resolving chrome the same way
- preview behavior was confusing because site chrome looked like page content even though it was really site-level structure

The cleanup was intended to simplify the model instead of preserving multiple legacy shapes.

## Final Decisions

### 1. Navigation and footer are shared site structure

The canonical storage shape is:

- `sites.settings.navigation`
- `sites.settings.footer`

Navigation and footer are not page content blocks.

Primary source file:

- `src/lib/utils/site-structure.ts`

### 2. Navigation and footer are edited in dedicated Structure screens

We moved chrome editing out of the page block list and into dedicated Structure editors.

Relevant file:

- `src/components/admin/structure/SiteChromeEditorPage.tsx`

Practical result:

- pages and account-pages builders are for content blocks only
- Structure owns navigation and footer editing

### 3. Preview still shows navigation and footer

Removing fake blocks did not remove previewed site chrome.

Expected preview behavior:

- preview still renders navigation and footer
- clicking navigation should route to the dedicated navigation editor
- clicking footer should route to the dedicated footer editor

### 4. All frontend content types resolve site chrome the same way

After the cleanup, public pages, account pages, products, posts, categories, directories, and events all read chrome from shared site settings.

Rule:

- content rows render their own blocks
- shared site chrome comes from `sites.settings.navigation/footer`

Primary source file:

- `src/lib/utils/site-structure.ts`

### 5. Account page site resolution is host-based

Published account pages need to resolve against the current tenant host so they show the correct site chrome for the current site context.

Relevant file:

- `src/app/[...slug]/page.tsx`
- `src/lib/actions/account-pages/account-pages-frontend-actions.ts`

Rule:

- account page content should resolve against the current host, not the first site owned by the user

### 6. Shared frontend nav remains one component

We did not fork a second frontend navigation component for account-pages.

We kept one shared frontend nav renderer and made it auth-aware through shared settings.

Relevant file:

- `src/components/frontend/pages/navigation/PageNavigationBlock.tsx`

Why:

- one renderer is easier to reason about
- public pages and account-pages still need consistent site chrome behavior
- differences should come from settings, not duplicate runtime components

### 7. Old fake nav/footer patterns were intentionally removed

We removed the old compatibility-heavy pattern instead of keeping multiple fallback models alive indefinitely.

That cleanup included:

- removing old nested nav/footer runtime reads
- removing fake nav/footer blocks from pages and account-pages
- removing synthetic preview-only nav/footer block plumbing in remaining content-type builders

Reason:

- fallback-heavy code made the system harder to reason about
- shared top-level site chrome is simpler and matches the intended platform model

## Security Hardening That Landed With This Work

Shared navigation and footer links are now sanitized before storage and again before rendering.

Why:

- nav links, CTA buttons, footer links, and social links are public link sinks
- without sanitization they could be used for stored `javascript:`-style payloads

Relevant file:

- `src/lib/utils/site-structure.ts`

## Current Source Of Truth Files

If this area needs work again, inspect these first:

- `src/lib/utils/site-structure.ts`
- `src/components/admin/structure/SiteChromeEditorPage.tsx`
- `src/components/frontend/pages/navigation/PageNavigationBlock.tsx`
- `src/components/frontend/layout/site-layout.tsx`
- `src/components/frontend/pages/PageBlockRenderer.tsx`
- `src/components/frontend/products/ProductBlockRenderer.tsx`
- `src/components/frontend/posts/PostBlockRenderer.tsx`
- `src/components/frontend/categories/CategoryBlockRenderer.tsx`
- `src/components/frontend/directories/DirectoryBlockRenderer.tsx`
- `src/components/frontend/events/EventBlockRenderer.tsx`
- `src/app/[...slug]/page.tsx`
- `src/lib/actions/account-pages/account-pages-frontend-actions.ts`

## Practical Rules Going Forward

- Treat navigation and footer as shared site structure, never as page content blocks.
- Do not reintroduce fake nav/footer blocks into builders or preview adapters.
- Keep one shared frontend nav renderer unless there is a real runtime requirement to split it.
- Resolve site chrome from `sites.settings.navigation/footer` across all content types.
