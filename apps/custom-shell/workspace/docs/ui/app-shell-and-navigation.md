# App shell and navigation

The signed-in shell draws:

- The sidebar, top bar, and page area.
- The account menu and notification tray.
- The feedback window and maintenance notice.
- The global toast region.

The shell also applies the active workspace's:

- Name and workspace-switcher image.
- Colors and font.
- Border style and width choices.

The browser title and tab icon are app-wide. The tab icon is one version of the
signed-out logo, named by the Browser tab icon setting and the same on signed-in
and public pages. There is no second icon for the browser to choose between.

## Who the sidebar says this site is

The top of the sidebar names the site and shows its logo, for everybody. That
logo is the one uploaded in Settings → General. A per-site picture wins over it
only in an app that builds distinct sites, meaning `workspaces.siteBranding` is
on. With neither, the plain shape from the site editor's Icon list is drawn
instead.

An admin gets a chevron beside the name that opens the list of sites they may
switch between. **A member gets the name and the logo and no chevron**, because
a member may not change site. Clicking either the logo or the name goes home,
for both.

The address under the name is drawn only for an admin. It is there to tell two
sites apart, and a member has only the one.

The header used to render nothing at all for a member. The workspace list is
the sites a person may switch to, a member owns none, so their list arrived
empty and there was nothing to name. The name and logo now come from the shell
config instead of from that list, and the config answers for everybody — see
below. With no site on the deployment at all, the header is drawn as nothing
rather than as an empty box.

## Whose settings a page is drawn with

Everything a site decides about itself is saved on its workspace row: the
content gutter and card borders from Settings → Styling, the name, the logo.

**The site being looked at decides, not who owns a site.** `readShellSettings`
asks for the workspace the person is IN first, so an admin who picked Beta in
the switcher while sitting on Alpha's domain gets Beta. A member is in no
workspace, so it falls back to the workspace this REQUEST belongs to, which is
the same row the admin edits.

Without that fallback a member was handed the built-in defaults, and the same
page was spaced two different ways depending on who opened it: a gutter saved
at 6px drew at 6px for an admin and 14px for a member, and the site's logo and
name were missing from their sidebar entirely.

## The sidebar width belongs to the person

**How wide somebody likes their sidebar is saved on them, in
`users.sidebar_width`, not on the site.** Dragging the rail writes that one
column and nothing else. Null means they have never dragged it, and they get
218px.

It used to be saved in the workspace's settings, which made it one width for
everybody in that workspace. On an app that is one site everybody is in the
same one, so a member dragging their rail resized the admin's. Moving it onto
the person also removes the question of who is allowed to write it: the save is
open to any signed-in person because the only row it can touch is their own.

The admin's full Settings save no longer carries a width at all, and the old
workspace copy is left in the jsonb unread. Nobody's sidebar changed width in
the move: the migration started each person on the width their workspace was
saving for them.

Navigation comes from the shell catalog plus app options. The server removes
items the current role may not see, then the browser applies saved labels, order,
groups, and visibility. Route loaders and server functions still enforce access.
Navigation is a way to find permitted work, not the permission itself.

The link for the current page carries `aria-current="page"` in the sidebar and
the top bar. A parent section can stay highlighted while one of its children is
current, but both links never claim the page. The child carries the current-page
state while it is visible. The parent carries it when the group or the whole
sidebar is collapsed.

Every signed-in page starts with one visually hidden level-one heading. The
shell uses the current navigation label, including a saved custom label. A
fixed route title covers pages that are not in the saved navigation. Cards,
tables, and dashboard panels then start at level two. A dialog title is level
two, so cards inside account dialogs use level three.

The standard top left navigation follows the active sidebar section. Settings →
Platform → Navigation holds Top left max items and the sidebar and top right
menu editors. Links beyond the saved limit appear in the vertical three-dot
menu without changing the sidebar order. Show all removes that overflow limit.
The vertical three-dot menu uses the same outlined light-gray button as the
other header controls, so it remains visible as a control beside the links.

## Responsive behavior

Responsive navigation has two modes:

- On a wide screen, the sidebar can stay open and its width persists. A save
  queue prevents a slow earlier request from overwriting the latest drag.
- On a narrow screen, navigation opens as an overlay and closes after a route
  change. The main page remains the scroll owner.

Public pages use a separate signed-out frame with their own header, footer,
navigation, and sign-in actions. Internal public links use router navigation.
External links remain normal document navigation. The header search uses the
same clearable field as signed-in lists and submits its current `q` value to the
public search page.

An error that escapes a route's own handling uses a smaller public frame rather
than the signed-in shell. The fallback shows the root logo and app name, applies
the public canvas and fixed light or dark choice, and offers retry and front-page
actions. The fallback avoids page loaders and the full public frame so it can
still render when those dependencies caused the crash. Missing branding falls
back to the default app name and normal theme tokens.

Settings pages use the document's vertical scroll instead of adding another
scrolling panel inside it. Long settings therefore show one scrollbar at the
edge of the window while the shared page gutter still owns their spacing.

## Shared state

The shell owns shared state for:

- Refreshing feedback and notifications after an action changes them.
- Watching session policy while a signed-in page is open.
- Watching automation pause and maintenance state.

The repo's `docs/shell/user-interface.md` holds the shared layout and component
rules. The `Ui-standards` skill is the authority before changing anything drawn
on screen.
