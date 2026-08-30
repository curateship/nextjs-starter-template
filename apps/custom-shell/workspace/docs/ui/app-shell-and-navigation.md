# App shell and navigation

The signed-in shell draws:

- The sidebar, top bar, and page area.
- The account menu and notification tray.
- The feedback window and maintenance notice.
- The global toast region.

The shell also applies the active workspace's:

- Name, favicon, and title.
- Colors and font.
- Border style and width choices.

Navigation comes from the shell catalog plus app options. The server removes
items the current role may not see, then the browser applies saved labels, order,
groups, and visibility. Route loaders and server functions still enforce access.
Navigation is a way to find permitted work, not the permission itself.

## Responsive behavior

Responsive navigation has two modes:

- On a wide screen, the sidebar can stay open and its width persists. A save
  queue prevents a slow earlier request from overwriting the latest drag.
- On a narrow screen, navigation opens as an overlay and closes after a route
  change. The main page remains the scroll owner.

Public pages use a separate signed-out frame with their own header, footer,
navigation, and sign-in actions. Internal public links use router navigation.
External links remain normal document navigation.

## Shared state

The shell owns shared state for:

- Refreshing feedback and notifications after an action changes them.
- Watching session policy while a signed-in page is open.
- Watching automation pause and maintenance state.

The repo's `docs/shell/user-interface.md` holds the shared layout and component
rules. The `Ui-standards` skill is the authority before changing anything drawn
on screen.
