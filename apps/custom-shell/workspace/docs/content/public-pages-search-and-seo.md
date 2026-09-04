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

Public > Navigation also controls the full header's layout across the app. The
header can scroll with the page or stay at the top, and its desktop menu can sit
in the normal header flow or in the exact centre of the page. Logo sizes are
fixed at 32px, 48px, or 64px high. Phone navigation remains behind the menu
button for both positions. The header still shows the logo, site name, search,
and colour-mode choice when no menu or footer has been added. Empty navigation
adds no empty menu control.

Search is a built-in item in Public > Navigation. Dragging the Search chip
among the link chips sets the desktop header order. On phones the same position
becomes a Search entry in the menu because the full input would not fit there.
The Search chip's Visible checkbox hides both versions without removing the
chip or its saved position. Switching off the public search page also hides the
item from the public header and keeps its position for later.

Public menu links can stay in the header as individual links or sit inside a
named dropdown group such as Product or Resources. A group opens on click on
desktop and supports the usual keyboard controls, including Enter, arrow keys,
Escape, and moving focus through its links. The phone menu shows the group name
as a heading with its links beneath it. Groups stop at one level, so a group
cannot contain another group. The same address checks used by direct menu links
remove unsafe addresses inside groups too.

The public menu has no menu-specific link limit. The old 20-link limit existed
because every link occupied the flat header, which groups no longer require.
Menus saved before dropdown groups continue to render as the same flat list.
The missing-page screen flattens group links into its existing discovery list,
so a page does not disappear there just because its menu link moved into a
group.

A one-site app has one app-wide public menu and footer, so switching workspaces
in the admin area does not change the public site. A deployment with workspace
domains reads the menu and footer from the workspace named by the domain. Page
visibility still follows the workspace that owns the public content.

The root page load also puts the app-wide favicon set in the document head.
Public pages and signed-in pages therefore use the same light favicon, optional
dark favicon, and generated browser sizes. With no saved favicon the document
adds no custom icon links, which keeps the app's built-in browser behavior.

Every public page also gets its sharing title and description in the first HTML
response. Coded pages use the summary in their page declaration. Written pages
use their title and the app-wide fallback description. This covers the front
page, pricing, search, written pages, sign-in and registration pages, password
recovery, the missing-page screen, and maintenance mode.

Public > Social can add one app-wide share image, choose a small or large X card,
and name the site's X account. The account is stored without its leading `@`.
Clearing the image still leaves title and description tags, and clearing the
account removes its tag. The image must belong to the admin's media library.
Selecting a replacement gives the public image URL a new version so social
preview caches see a different address.

Settings under Public > Styling control the site's brand colour, corner rounding
from 0 to 24px, font, colour mode, canvas colour, content width, content
alignment, vertical spacing, background pattern, button treatment, and the
header and footer divider lines. The system face, Inter, serif, and mono are
available. Inter comes from the app; the other choices use fonts already on the
visitor's device. Public pages never fetch a font from another site. Frame,
font, and corner choices are app-wide. Apps with public workspace domains keep
a brand colour per site. An app without
those domains uses one brand colour for its public frontend.

An admin can also upload one WOFF2 font under Public > Styling. The first page
response preloads the font and declares it before the browser paints. The
browser requests `/public-font.woff2` from the same site rather than
contacting the object store or a font service. The address includes the upload
version, so a replacement gets a fresh browser cache entry. If the file cannot
load, the saved built-in font remains the CSS fallback.

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
before the first paint. Public styling settings never change the signed-in app,
which keeps its own Styling settings.

Public search reads visible written pages and any search results supplied by the
app. It performs simple text matching and returns at most 40 results. Search
must apply the same visibility rule as opening the result.

Public SEO settings hold a home-page title, a home-page description, title and
description templates for written pages, a default description for pages
without one, and a default share image. A written-page template accepts
`{{page_title}}` and `{{site_title}}`. The server replaces those codes with the
current page and site names, removes HTML and extra whitespace, and trims a
leading or trailing `|`, `-`, or `:` when one code is empty. A written page's
own SEO value takes priority when per-page SEO supplies one. Empty templates
preserve the former browser and social titles.

The two home fields apply only at `/`. Other pages keep their own description
when they have one and use the site default only when they do not. Empty
settings preserve the former browser title and description. The default share
image is the same app-wide image used by Open Graph and X preview tags, and the
server changes its address when an admin replaces it so cached previews can
refresh.

Every real public page also includes one JSON-LD structured-data script in its
first HTML response. The script holds one `Organization` record with the
current site name and visited site address, plus one `WebPage` record with the
resolved browser title, public address, and description. The same path covers
the front page, coded pages, and written pages, so their machine-readable text
cannot drift from their visible search metadata. Signed-in screens, unknown
domains, and missing pages do not claim to be public web pages. Empty optional
organization fields are left out. The emitter already accepts a logo and
social profile addresses for Technical SEO to supply later.

The missing-page card includes the public search field while Search is
available and lists the site's saved main-menu links in their saved order. A
search moves to `/search` with the entered words. Switching Search off removes
both the header search and the missing-page search. With no saved menu, the
missing-page card adds no empty navigation section.

Dots and grid patterns are drawn in CSS over the public canvas in light and
dark mode. The public theme limits their opacity to 20%. None and 0% add no
pattern image, so the canvas matches an unpatterned site. Public primary buttons
can use their normal solid fill or a brand-coloured outline. Public button
labels can display as written or in capitals. These rules are attached only to
signed-out documents, so signed-in buttons keep the platform styling.

Public > Pages holds the app-wide heading and body for the 404 and maintenance
pages. Both are plain text and show a preview while the admin types. Empty
fields preserve the built-in wording. The maintenance page reads this copy
from the root branding response, so it does not add another settings query
while the app is deliberately unavailable.

The signed-in action on the public front page opens Overview directly for an
admin and Home directly for a member. The action does not pass through the
configurable home redirect, because a stale home setting must not turn the
front page into a missing-page link.

Public > Pages can replace that built-in front page with up to six ordered
rows. A plain-text row shows its heading and optional introduction. A plans row
adds the app's current public plans beneath the same two fields. Full-width rows
use the configured public page width, while narrow rows stop at 768px and still
follow the site's content alignment. The first row owns the page's main
heading, and later rows use section headings.

Testimonials, FAQ, logo-strip, and screenshot rows add fixed marketing content
without allowing arbitrary page blocks. Testimonials hold a required quote and
name plus an optional role and picture. FAQ entries require a question and
answer. Logos require an image and accessible name, while screenshots require
an image and caption. Testimonial and screenshot rows hold up to six entries;
FAQ and logo rows hold up to twelve. Cards and images collapse into a readable
single column on phones.

Rows are app-wide and render in the order saved by the drag editor. A saved row
without its required heading is dropped before it reaches the public page. An
incomplete content entry is dropped too, and a content row with no complete
entries does not render. If no usable rows remain, the former pricing front page
renders unchanged. An app that answers `/` through its catch-all or replaces
the landing page through app options still wins before the shell considers
these rows.

## Robots and sitemap

`robots.txt` and `sitemap.xml` come from the public page registry and the active
site configuration. The sitemap includes public pages, can split a large set
into chunks, and excludes member-only or disabled pages. The repo's
`docs/shell/public-files.md` holds the exact discovery and multi-site rules.

See [Public page load errors](public-page-load-errors.md) for the difference
between a missing page and a page whose data failed to load.
