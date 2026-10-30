# Three-column dashboard pieces

The UI standard's "Three-column dashboards" section says what every
three-column dashboard looks like. This file says where the shell's pieces for
it are, so a screen is built from them rather than copied from Project. They
moved into the shell on 19 Oct 2026 for the Contacts dashboard, the first shell
screen built this way, and every app gets them with its next shell merge.

All of them are in `src/components/shared/`.

- **`three-panels.tsx`, `ThreePanels`.** The layout: left 22%, middle 54%,
  right 24%. A side panel drags shut, comes back from a tab on the middle
  panel's edge, and a double-click on blank space toggles it. Widths are kept
  in the browser under a key listed in `panelLayoutKey`
  (`src/lib/layout/panel-layout.ts`). Under 1280px one panel shows at a time
  under a row of pills, and all three stay mounted. `showRightFor` switches a
  narrow screen to the right panel when a record opens; `showMiddleFor` does
  the same for the middle.
- **`ThreePanels`' `place`, read by `useDashboardPlace`
  (`src/lib/layout/dashboard-place.ts`).** Required. It takes a key from
  `panelLayoutKey` named `…Place`, the route's own `useSearch()`, and the ids
  of the list's rows as shown. Arriving at the bare address, it puts back the
  address this dashboard last had in this browser, kept per person and per
  site. Then, with nothing in `?open=`, it opens the first row. A remembered
  record that is no longer in the list gives way to the first row, while a
  link's own `?open=` is left alone even when it is on another page. Both
  moves replace the address, so Back still leaves the page. The record it
  opens by itself does not switch a narrow screen to the right panel. The
  open record has to be `?open=` and `showRightFor` its id, which is how
  Contacts already worked. A screen that loads its list itself, rather than
  in the route's loader, passes `ready: false` while the rows shown still
  belong to the address before the last change. The first row waits for it,
  so a remembered folder never opens a row from the folder it replaced.
  Note's library dashboard is the one that does.
- **`panel-card.tsx`, `PanelCard` and `PanelHeading`.** The grey folding card
  of a side panel, which remembers being open or shut, with a muted note after
  its title, a badge, a button of its own and a footer of buttons. Its cog, its own buttons and its fold arrow show only while the card is
  pointed at or focused (Tyler, 20 Oct 2026: "all these should be hover to
  show only"); always on a phone.
  `PanelHeading` is the one small-caps heading over a group inside a panel.
  `PanelBox` is the same grey box with no heading and no fold, for a record's
  opening card whose first line is the record's own name, as the open
  contact's is.
- **`DashboardCardTitleHeader` may leave out its icon**, so the title starts
  the row, as the Contacts list's middle header does in Tyler's mock of
  20 Oct 2026.
- **`search-toggle.tsx`, `SearchToggle`.** The magnifying glass in the middle
  header that opens into the search box. Escape empties and closes it.
- **`filter-popover.tsx`, `FilterPopover`.** The ghost Filter button that
  counts the filters set, and its dropdown. The screen fills it with its rows
  or its own builder; the frame adds Clear and the screen's save button. A
  Group row is not in it yet, because no shell screen groups.
- **`new-record-dropdown.tsx`, `NewRecordDropdown`.** The frame of the
  "New …" dropdown: the screen's fields, then "Create …" at the bottom right,
  and Enter makes it. The screen holds the typed values, so clicking away
  keeps them for the next opening.
- **`mass-select.tsx`.** `MassSelectChip`, the "Mass select" / "Hide select"
  chip beside the first column's heading, shown while that heading is pointed
  at (put `group/title` on the heading). `SelectedMenu`, the "N selected"
  button with its moving rainbow edge and a menu that steps into pages with a
  back arrow; Escape on a page goes back. `SelectedMenuRow` and
  `SelectedMenuSeparator` are its lines.

- **`dashboard-tabs.tsx`, `DashboardTabs` and `DashboardTabButton`.** The tabs
  in a panel header, with a count after the word. They are drawn the way
  Settings → Styling → **Dashboard tabs** says for the whole site: the grey
  pills, or words with a line under the one showing. Tyler, 20 Oct 2026: "Line
  tab or pill tabs should be a choice all apps can make", with pills for a
  site that never chose. Either way the marker slides to the tab picked, on
  the pill's own curve (`useSlidingPill` with `variant: "underline"` draws the
  line), and a row too long for the header scrolls sideways.
  `DashboardTabButton` is a control drawn as one more tab, such as Project's
  More dropdown. The setting is `ShellStyling.dashboardTabs`
  (`src/lib/layout/styling-values.ts`), optional, so a site saved before it
  existed reads as pills. The CRM inbox's All / Unread uses it too.
- **`saved-views.tsx`, `SavedViewsControls` and `SaveViewDialog`.** Views: a
  person's own named filters on one dashboard, the Views button with its menu
  ("Delete views…", a cog per row for Edit view) and the Save view window,
  moved here from Project on 20 Oct 2026. They live in the `saved_views` table
  (`src/server/saved-views.ts`, migration `0097_custom_shell_saved_views.sql`),
  each under a screen key `<kind>:<record id>`, such as `project:<id>`. The
  app that owns a kind answers for it in `savedViews.screens`
  (`src/server/app-options.ts`): who may keep views on the record, which
  filters a view keeps, and the names those filters point at when saved. A
  kind no app named is refused. At most 30 views per person per screen, names
  up to 60 characters. The screen opens a view itself (`onOpen`), so it can
  say what the view names that has gone and open with the rest. The table
  cannot cascade from an app's record, so the app calls `deleteSavedViewsFor`
  where it deletes one or takes a person off it.

## Which screens use them

- **Contacts, `/admin/contacts`.** Every piece above.
  `src/components/broadcasts/contacts-dashboard.tsx` is the place to start
  reading.
- **Video's Viral project, `/admin/video-viral/<id>`.** `ThreePanels`,
  `PanelCard`, `DashboardTabs`, `SearchToggle`, `FilterPopover`, mass select,
  `NewRecordDropdown` (the Creators card's +) and saved views, since 20 Oct
  2026. `apps/video/src/components/video-viral/viral-project-screen.tsx`.
- **Project** uses `DashboardTabs` and the shell's saved views since 20 Oct
  2026, and still draws its own copies of the rest
  (`apps/project/src/components/project/`). Trade draws its own layouts.
  Moving them onto these pieces is the open picks in the shell's task
  "Three-column dashboards".

## Things to know when using them

- **A side panel's card list needs one column that may shrink.** A grid sizes
  its column to its widest row, so a long name pushes the whole panel sideways.
  Give the list `grid grid-cols-[minmax(0,1fr)]` and each row `min-w-0`, as
  the Contacts dashboard's Segments card does.
- **A table in a panel hides columns by the panel's width.** Put
  `@container/list` on the panel and `hidden @2xl/list:table-cell` (and wider
  steps) on the columns, because the panel is about half the window. The main
  column's 320px page minimum is too wide for a panel, so set `min-w-40` or
  similar on it.
- **The header's buttons narrow by the header's width.** Give the header
  `@container`; Filter and "New …" drop their words below `@max-3xl`.
- **A toast shown from an effect on first load must wait a tick.** On a fresh
  page load the toaster starts listening in the same commit, after the page's
  own effects, and drops a message sent before it. `setTimeout` it, as the
  Contacts dashboard does for a link to a deleted segment.
