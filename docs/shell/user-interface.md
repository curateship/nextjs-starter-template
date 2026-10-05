## UI Rules

- Prefer components from `src/components/ui/` over native HTML controls whenever a shadcn equivalent exists.
- Do not introduce custom modal, select, dropdown, button, input, table, or sheet styling when custom-shell already has a shadcn component for it.
- If a required shadcn component does not exist in `src/components/ui/`, add it there first, then use it in the page/component.
- All custom Ui changes will be in global.css and not in the Ui Component

## Borders

- **Every border comes from the border settings in Settings → Styling.** No
  component names its own border shade. Divider and frame lines are a plain
  `border` / `border-b` / `border-t` with no color class, so they take
  `--border`, the variable the Divider lines setting writes. Card and surface
  hairlines come from the card border width and color settings.
- **Dividers run edge to edge.** A divider inside a padded container pulls
  itself out to the surface's edges with negative margins matching the
  padding, and puts the inset back on its own content, so the line never
  floats short of the sides.
- Floating layers that render outside the page — popovers, dropdown menus,
  selects, sheets, toasts — used to miss those settings because the variables
  only lived inside the page. ShellLayout now also writes them on the document
  root (`useBorderStyleVars` in `src/components/shell/shell-layout.tsx`), and
  `src/theme.css` redraws the popover and dropdown hairline from the card
  border settings the same way it does for modals. A component never copies a
  computed border across by hand.

## Workspace panels

- Every panel header renders through `DashboardCardHeader` in
  `src/components/shared/dashboard-card-header.tsx`. The shared header is 57px
  tall and places its 32px controls 12px from the top, left and right edges.
  Title rows, tab rows and custom rows such as the market picker compose that
  component instead of rebuilding its frame.
- A panel body that begins directly below the header uses 12px on every side.
  The palette, run list and broadcast block list follow the same gutter, so the
  body never steps inward when the header ends.

## Windows opening and closing

Three things move when a window opens, and they move together. A window that
changes only one of them reads as a flash rather than as something arriving.

- **The window fades and grows at the same time.** It starts at 95% size and
  fully transparent, and reaches full size and fully solid over 150ms on an
  ease-out curve. Growing without fading is what makes a window look stamped
  onto the page instead of opening. `DialogContent` in
  `src/components/ui/dialog.tsx` carries both.
- **The backdrop fades over the same 150ms.** The backdrop covers the whole
  screen, so it is the first thing the eye catches. Switching it on in one
  frame is a flash, and no amount of easing on the window itself hides that.
  `DialogOverlay` and `SheetOverlay` carry the same fade, because a sheet is a
  window that arrives from the side.
- **The page behind blurs over the same 150ms.** `src/theme.css` blurs the app
  canvas to 4px while a window is open, easing rather than switching, so it
  moves with the other two instead of snapping ahead of them. The transition
  lives on `[data-slot="app-canvas"]` itself, not inside the `:has()` rule that
  sets the blur, so closing a window unblurs on the same curve. It is switched
  off under `prefers-reduced-motion: reduce`.
- **Closing takes 100ms, opening takes 150ms.** Leaving is not worth as much
  time as arriving, and a window that takes as long to go as it did to come
  feels like it is holding the person up.
- **Every floating layer fades.** Popovers, dropdowns, selects and tooltips
  already did. The window was the only one that did not, which is how the
  missing fade went unnoticed. A new floating layer copies the pattern rather
  than inventing its own timing.

### A list inside a popover inside a window scrolls itself

A window lets nothing on the page scroll but its own content. `DialogContent`
wraps itself in `react-remove-scroll`, naming that one element, and every wheel
turn anywhere else is cancelled. A popover renders at the end of the body rather
than inside the window, so until 30 Sep 2026 no list in a popover over a window
could be scrolled with the wheel at all. The scrollbar and the keyboard worked,
which is why it read as a height bug for months: CMS had a 4608px column of
categories in a 256px box that the wheel could not touch.

- **`PopoverContent` scrolls its own lists.** `src/components/ui/popover.tsx`
  carries an `onWheel` that finds the box under the pointer and sets its
  `scrollTop`, which the cancelled wheel does not affect. Any app, any popover,
  no call site has to know.
- **It does nothing unless it has to.** It returns when the body has no
  `data-scroll-locked`, the marker `react-remove-scroll` writes while a window
  holds the page, so on an ordinary page the browser scrolls as it always did. It
  returns again when the popover turns out to be inside
  `[data-slot="dialog-content"]`, where the browser is already doing the job, so
  there is never a second push on top of a native scroll.
- **It picks the box the browser would have picked**, walking up from whatever
  the pointer is over to the first ancestor that overflows the way the wheel is
  pointing. That covers a `ScrollArea` viewport and a plain scrolling box alike,
  in both directions, and a wheel that reports lines or pages instead of pixels
  is converted so a trackpad does not crawl.
- **A caller's own `onWheel` runs first**, and calling `preventDefault` on the
  event turns this off for that popover.
- **Rendering the popover inside the window does not work**, which is the
  obvious fix and the reason this one looks roundabout. The window carries a
  transform, which makes it the containing block for the popover's fixed
  positioning, and `overflow-hidden` on the admin variant then clips anything
  reaching past the window's edge. A dropdown under a field near the bottom does
  exactly that.

### A window that feels slow locally is React running everything twice

The lag is never the animation. React has to build the window's whole contents
before any of the movement above can start, so the person clicks, waits through
that build, and only then sees anything move. Shortening the animation cannot
help, because the animation has not started yet.

On the dev server that build runs **twice**, for every window. React StrictMode
mounts each component, throws it away and mounts it again, and runs every
effect twice, as a way of catching code that misbehaves when it runs more than
once. TanStack Start switches it on: the app has no `src/client.tsx`, so it
gets the framework's default entry, which wraps the whole app in
`<StrictMode>`. Writing an `src/client.tsx` without it is what turns it off,
and that costs the warnings.

Measured on the running dev server, in a real browser, opening the "New
feedback" window on `/admin/feedback`:

| What | Time after the click |
| --- | --- |
| The window enters the page | 166ms |
| The window is fully solid | 256ms |

That window holds 72 nodes, which is small. 166ms of nothing before a small
window even appears is the double mount, not the window's own size. A bigger
window costs more on top of that, but this is the floor underneath every one of
them.

When measuring this, check that the button actually opens a window before
trusting the number. Several buttons that read like window triggers are not,
and timing one of those produces a fast number that means nothing.

How the cause was found, for whoever checks this next: a CPU profile of the
click puts `recursivelyTraverseAndDoubleInvokeEffectsInDEV` at the top of the
inclusive time, and reading React's `mode` bits off any fiber in the page
returns `strictEffects: true`.

**This is not measured against a production build.** React does not double-mount
in production, so the deployed app should not carry this cost, but nobody has
put a number on it. Measure the deployed app before repeating the claim.

Two things ruled out by measurement, so they do not need re-testing: the blur
on the page behind costs about 50ms of the wait and nothing at all while the
window sits open, and the animation's own frames run at about 16ms throughout.

## Forms

- Use shadcn form controls for inputs and interactions.
- Avoid native `<select>` and similar browser-default controls when a shadcn control should be used instead.
- **Errors have one home each, and it is never a hand-rolled paragraph or box:**
  - **Anything that fails when the user clicks** (submit, save, delete, vote, upload, validation on submit) reports through `showErrorToast` (`src/lib/error-toast.ts`) — a red toast in the same fixed spot as the success toasts. It stays until dismissed, a repeat failure replaces it instead of stacking, and `dismissErrorToast()` runs when a new attempt starts so a stale failure never outlives its retry. Never `toast.error` directly; the shared helper owns the one-slot behavior.
  - **Data-surface load failures** (a list or page section that could not fetch) use `ErrorBanner`, with `onRetry` wherever a reload exists.
  - **Live while-you-type validation and page-state text** (a password-mismatch hint, a dead verification link) use `InlineError` next to the field or in the page body — these are not click-failures, so they stay in place.

## Tabs and the colour-mode switcher

Both are segmented controls, and both move the same way, from
`src/lib/hooks/use-sliding-pill.ts`.

- Every tab strip is `src/components/ui/tabs.tsx` and the three colour modes are
  `src/components/ui/theme-switcher.tsx`. Do not build a second one of either.
- The raised white background is a single pill sitting behind the buttons, not
  a background on the chosen button. Choosing another one slides the pill across
  and grows or shrinks it to the new button's width over 300ms on
  `cubic-bezier(0.4, 0, 0.2, 1)`, the same movement Luma's switcher uses. The
  labels change colour on the same curve, so nothing snaps.
- The pill is measured from the chosen button with `offsetLeft` and
  `offsetWidth`, because tabs are as wide as their words and "Overview" is wider
  than "AI". `getBoundingClientRect` is wrong here: a control inside a dialog is
  first measured while the dialog is still scaling up, and the rect would come
  back shrunk.
- The first placement jumps, and only later moves slide. Without that, the pill
  flies in from the left edge every time a screen with tabs opens.
- The server cannot measure anything, so until the browser has placed the pill
  the track says `data-pill="pending"` and the chosen button wears the raised
  background itself. Without that the tabs sat on screen with nothing raised for
  about two seconds on a dev build while the page finished loading.
- A machine set to reduce motion gets the pill in the right place with no slide,
  through `motion-reduce:transition-none`.
- The pill follows a button that changes width on its own, such as a count badge
  going from 9 to 10, through a `ResizeObserver` on the track and on each button.
- A theme change freezes every transition on the page for two frames, so the
  page does not fade from light to dark one colour at a time
  (`disableTransitionsTemporarily` in
  `src/components/shell/sticky-header/light-dark-switcher.tsx`). The pill is the
  one thing exempt, through `data-keep-motion`, because choosing a colour mode
  moves the pill and repaints the page in the same instant. Without the
  exemption the pill jumped and the switcher looked untouched.
- A new segmented control uses the hook rather than copying the markup. It needs
  `relative` on the track, `relative z-10` on the buttons, and a selector that
  names the chosen one, such as `[data-state="active"]` or `[aria-pressed="true"]`.

## Tables

- Use the shadcn table primitives from `src/components/ui/table`.
- Data tables should use the table primitive column props instead of repeating Tailwind column strings.
- Every data table should have one primary content column, such as title, name, message, or activity.
- The primary column uses `TableHead column="main"` and `TableCell column="main"`.
- Supporting columns use `TableHead column="meta"` and `TableCell column="meta"`.
- Muted supporting text, such as author or date, uses `TableCell column="mutedMeta"`.
- Small secondary snippets use `TableHead column="preview"` and `TableCell column="preview"`.
- Supporting columns stay compact, left-aligned, and should not compete with the primary column.
- Do not create two wide text columns in the same table.

## Dragging a list into order

- **Every draggable item needs an id that belongs to the item, not to its
  slot.** A list keyed `menu-link-0`, `menu-link-1` has no way to animate: a
  drop leaves every id where it was and only the labels swap, so the chips jump
  to their new places instead of sliding.
- **An item saved without an id of its own gets one from `stableItemIds`** in
  `src/components/settings/nav-editor-shared.ts`. It mints a number per item
  object and holds it in a WeakMap, which `arrayMove` carries along. Nothing
  new is stored, and an item dropped from the list is forgotten.
- **The check:** put a `data-` mark on the first chip's element, drag it to
  third, and read the row back. The mark has to travel with the chip. If it
  stays in slot one and only the words move, the ids are slots.

## Refreshing Data After Changes

One approach, two cases:

- A dashboard that makes a change itself updates its own rows in place (the way
  the feedback and comments dashboards do after their own edits and deletes).
  No refetch is needed for your own change.
- A change made from a surface that floats over other pages — today that is the
  shell's feedback modal — must call its `onMutated` callback after **every**
  successful write (create, vote, comment add/edit/delete). The shell bumps
  `feedbackRefreshToken` in `useShellRuntime`, and every dashboard showing that
  data takes the token as a `refreshToken` prop and lists it in its fetch
  effect's dependencies, so it refetches and stays honest.

Dashboards on sibling routes unmount and refetch on navigation, so they never
need to signal each other directly. Do not invent a second mechanism (manual
cross-component `refresh()` calls, shared mutable stores); wire new shell-level
surfaces into the same token.

A request effect starts the external read and updates state only when that read
answers. The screen derives whether the request is pending from the current
request key and the last key that finished. It does not set a loading flag at
the start of the effect, because that paints an empty or stale state once and
then immediately corrects it. Record dialogs follow the same rule: when the
address names the open record, the dialog derives that record from the current
list instead of copying it into state after the page has drawn.

## Dashboard Filters

- Dashboard filter bars should use the dashboard toolbar primitives from `src/components/dashboard-toolbar`.
- Use `DashboardToolbar` for the header layout and `DashboardToolbarTitle` for the title/count area.
- Put search and dropdown filters inside `DashboardToolbarControls`.
- Use `DashboardToolbarSearch` for search inputs.
- Use `DashboardToolbarSelectTrigger` for dashboard filter dropdowns.
- Filter controls should wrap on mobile like the feedback dashboard instead of stacking into full-width rows.

## A notification row has four parts, and the app fills them

`NotificationRow` draws a tile, a heading, a line of figures and the time. The
shell writes all four for its own notices. An app that wrote the notice knows
better and says so through `AppOptions.notifications.detailsFor`, which hands
back an `AppNoticeDetail` per notice id.

- **`title`** is the heading: short enough for one line beside the time.
- **`meta`** is an array of single facts, drawn in a fixed-width font and
  joined with a middle dot. `["@ 0.04932", "HL1 Grid", "filled"]` becomes
  "@ 0.04932 · HL1 Grid · filled". One fact per entry is the whole point: the
  price then sits in the same place on every row and a column of fills reads
  straight down.
- **`icon` and `toneClassName`** are the tile. The app owns the colour because
  only the app knows whether its own notice is good news.
- **`categoryId`** is which tab the row sits under, from the app's own
  `categories` list.
An unread row is tinted and carries a red dot, the theme's own `destructive`
and the same colour as the count on the bell.

`NotificationTile` is exported, so the admin notifications table draws its rows
from the same pieces. A notice that reads one way in the tray and another way in
the record is the bug this prevents. The day grouping lives in
`notification-center.tsx`, because the bell is the only thing that groups.

Every field is optional, and a notice the app says nothing about looks exactly
as it did before any of this existed. Tyler asked for this shape on 4 October
2026.

### The look is worked out on the spot, and only the address is fetched

An app fills a row's four parts through two options, and the split between them
is what keeps the tray instant.

- **`describe`** is synchronous. The shell is already holding the notice's own
  words, so an app that can read its own sentences answers immediately and every
  row is right on the first paint.
- **`detailsFor`** is the request, and it is for what only a server can say —
  chiefly where a notice leads when it is clicked. What comes back is laid over
  what `describe` said, field by field, so a late answer can only add to a drawn
  row and never blank it.

Putting the whole decoration behind the request instead drew the plain sentence
and redrew it 378ms later, which read as the old design flashing past. Holding a
spinner over the gap hid it but did not close it; answering synchronously
removes the gap. Measured after the change: twenty rows, all twenty with their
figures, in the first frame.

### The tabs

Unread and All are the shell's, always first. Everything after them is the
app's, in the order the app lists them. Filtering by an app tab reads the
`categoryId` the app gave each notice, so a tab shows nothing until that
answer has arrived — which happens while the tray is being read, not on a
click.

### Mark all read lives in the footer

Five tabs and a worded button do not share a 416px row — putting the action
beside the tabs wrapped the header onto two lines. It sits in the footer
instead, beside Settings and History. Those two go to admin screens, so a
member sees Mark all read on its own rather than links that would bounce them
back. There is no separate member-facing history page; the admin notifications
table already is the record.

## A notification row says everything on hover

**The whole of a row is on the row's own `title`**, so hovering anywhere on it
gives the heading, the figures, the sentence and the exact time.

The tooltip has to live on the row rather than on the lines inside it. The
click target is a button laid over the whole row — the row holds a button of
its own, and a button inside a button is not something a browser will render —
so a tooltip on any inner line would never be the one the pointer is over.

The sentence itself is still cut to 90 characters in JavaScript, in
`notificationPreview`, with the `line-clamp-2` under it only a second guard for
a long word. That matters because it means nothing else on the page holds the
missing words: a reader who hovers a row ending "which bought these coins
at..." gets nothing unless the row was handed the untruncated text separately.
So `notificationText` returns the whole thing and `notificationPreview` cuts a
copy.

Tyler asked for this on 3 October 2026, looking at a trade notice whose figure
had been cut off mid-sentence.
