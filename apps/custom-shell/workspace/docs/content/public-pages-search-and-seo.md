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

Settings under Public > Look control the site's brand colour, corner rounding
from 0 to 24px, font, colour mode, canvas colour, content width, content
alignment, vertical spacing, and the header and footer divider lines. The
system face, Inter, serif, and mono are available. Inter comes from the app;
the other choices use fonts already on the visitor's device. Public pages never
fetch a font from another site. Frame, font, and corner choices are app-wide.
Apps with public workspace domains keep a brand colour per site. An app without
those domains uses one brand colour for its public frontend.

The app-wide colour mode follows the visitor's device by default. In that mode,
the public header or top-right corner offers Light, Dark, and System choices and
remembers the visitor's choice in the browser. An admin can instead pin the
public site to light or dark, which hides the visitor menu. The server puts the
pinned class in the page head before styles load, so a hard reload does not
briefly paint the other mode. Public settings never override a signed-in
person's own mode.

The public frame reads each coded page's layout declaration. The front page,
pricing, and search use the full shared width from the top. Auth pages use the
card layout, and written pages stay cards until
their own per-page layout choice is added. Main content is centred by default
in both layouts. The app-wide content alignment can move it left or right.

The root page load starts with the app's default public theme, then adds the
saved app-wide values and the brand colour for the domain being visited. An app
that supplies no default starts with Custom Shell's built-in look. The server
writes the resolved values into the first HTML response, before the browser
paints or React starts. Missing saved fields keep the app default. The resolver
checks saved values and app defaults before they reach the page. Saved manual
shades replace only matching app shades, and sending a shade back to automatic
removes that inherited manual value. The brand colour writes the shell's
primary and focus-ring variables. The shell derives the public button hover,
selection tint, readable button text, and dark-mode brand from the same colour
before the first paint. Public look settings never change the signed-in app,
which keeps its own Styling settings.

Public search reads visible written pages and any search results supplied by the
app. It performs simple text matching and returns at most 40 results. Search
must apply the same visibility rule as opening the result.

The signed-in action on the public front page opens Overview directly for an
admin and Home directly for a member. The action does not pass through the
configurable home redirect, because a stale home setting must not turn the
front page into a missing-page link.

## Robots and sitemap

`robots.txt` and `sitemap.xml` come from the public page registry and the active
site configuration. The sitemap includes public pages, can split a large set
into chunks, and excludes member-only or disabled pages. The repo's
`docs/shell/public-files.md` holds the exact discovery and multi-site rules.

See [Public page load errors](public-page-load-errors.md) for the difference
between a missing page and a page whose data failed to load.
