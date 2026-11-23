# Who may show CMS inside a frame

CMS refuses to be shown inside another site's frame. A hidden frame is how a
page tricks someone into clicking buttons they cannot see, so every CMS page
says no. `src/start.ts` sets the rule on every response.

- **On the live site:** only CMS itself may frame a CMS page
  (`X-Frame-Options: SAMEORIGIN`), and the content rules add
  `frame-ancestors 'none'`.
- **On this Mac, in development:** CMS itself and Personal's dev server,
  `http://localhost:3021`, may frame a CMS page
  (`Content-Security-Policy: frame-ancestors 'self' http://localhost:3021`).
  Personal shows CMS's admin screens in its middle panel, as
  `apps/personal/workspace/docs/app-panels.md` explains. `X-Frame-Options` can
  name only CMS's own address, so the development rule uses `frame-ancestors`.
  Tyler chose this on 16 Oct 2026, local only.
- **The listing badge is the one exception everywhere.** Any website may frame
  it. `embeddable-listing-badge.md` says why that is safe.

Letting Personal frame CMS on the live site waits until every app is reachable
under one domain of Tyler's. That address would then go into the live rule.
