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

The browser title and favicon are app-wide. The same favicon set is present on
signed-in and public pages, with an optional dark-tab image.

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

## Shared state

The shell owns shared state for:

- Refreshing feedback and notifications after an action changes them.
- Watching session policy while a signed-in page is open.
- Watching automation pause and maintenance state.

The repo's `docs/shell/user-interface.md` holds the shared layout and component
rules. The `Ui-standards` skill is the authority before changing anything drawn
on screen.
