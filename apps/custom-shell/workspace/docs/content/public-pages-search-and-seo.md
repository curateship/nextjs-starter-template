# Public pages, search, and SEO

Custom Shell combines two types of public page:

- A coded page is a route with a nearby `*.page.ts` declaration. The declaration
  gives the page its public address, label, source, and visibility rules. The
  registry rejects duplicate or invalid addresses when the app starts.
- A written page lives in the active workspace's database. The Pages dashboard
  can create, edit, publish, hide, and delete it. The body uses structured
  content rather than saved HTML.

A page can be visible to everyone, limited to signed-in members, or turned off.

## Public frame and navigation

Signed-out pages share the public header and footer. Settings control the links,
footer wording, branding, and page-level overrides. Public links use the app
router when the destination belongs to this site, so moving around the public
site does not reload the whole application.

Public search reads visible written pages and any search results supplied by the
app. It performs simple text matching and returns at most 40 results. Search
must apply the same visibility rule as opening the result.

## Robots and sitemap

`robots.txt` and `sitemap.xml` come from the public page registry and the active
site configuration. The sitemap includes public pages, can split a large set
into chunks, and excludes member-only or disabled pages. The repo's
`docs/shell/public-files.md` holds the exact discovery and multi-site rules.

See [Public page load errors](public-page-load-errors.md) for the difference
between a missing page and a page whose data failed to load.
