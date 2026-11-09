# Three-column dashboard pieces

The UI standard's "Three-column dashboards" section says what every
three-column dashboard looks like. This file says where the shell's pieces for
it are, so a screen is built from them rather than copied from Project. They
moved into the shell on 19 Oct 2026 for the Contacts dashboard, the first shell
screen built this way, and every app gets them with its next shell merge.

All of them are in `src/components/shared/`.

- **`three-panels.tsx`, `ThreePanels`.** The layout: left 16%, middle 68%,
  right 16%; each side opens at the narrowest it can be dragged to (Tyler, 31
  Oct 2026: "The default width needs to be the narrowest width the panel
  have"). A side panel drags shut, comes back from a tab on the middle
  panel's edge, and a double-click on blank space toggles it. Widths are kept
  in the browser under a key listed in `panelLayoutKey`
  (`src/lib/layout/panel-layout.ts`). Under 1280px one panel shows at a time
  under a row of pills, and all three stay mounted. `showRightFor` switches a
  narrow screen to the right panel when a record opens; `showMiddleFor` does
  the same for the middle. Leaving `right` out makes two panels, the middle
  taking the right one's room, and `middle.bare` draws the middle with no
  card, its content straight on the page (Admin's Overview, 8 Nov 2026). A
  screen that switches between two and three panels keeps a layout key for
  each. `reopenInHeader` takes away the knobs on the middle's edge;
  the middle's header then draws `PanelReopenButton`s (Lucide's
  PanelLeftDashed first, PanelRightDashed last), which show only while that
  side is shut (Admin, 8 Nov 2026, then the CRM). `CrmListHeader`'s `end`
  slot holds the right one. `MiddleHeading` draws the left one, then a
  section's icon and name, and `middleGutterClassName` sets the middle's
  24px left and right on its header and table, both in `three-panels.tsx`.
- **One frame for a dashboard of sections.** The Admin dashboard and the CRM
  each keep one `ThreePanels` while their section changes; a section draws
  its middle in place, its record into a spot in the right panel through a
  portal, and tells the frame its rows, so the left page and its ⋮ never
  draw again on a switch (`TabPanels` in `admin-dashboard.tsx`,
  `crm-frame.tsx`). `place.section` names the section showing, so
  `useDashboardPlace` treats each new one as an arrival and opens its first
  row, as it did when each section had a frame of its own.
- **`SidePanelCollapseButton`, in `three-panels.tsx`.** The collapse button at
  a side panel header's outer edge (the Admin 3 panel design; Tyler, 7 Nov
  2026: "add a collasible icon here to collapse the left panel"). Put it
  first in the left header and last in the right one. It shuts the panel the
  way a double-click on blank space does. It draws nothing under 1280px,
  where one panel shows at a time.
- **`SideTogglesProvider`, in `three-panels.tsx`.** For an app whose screen
  keeps a three-panel frame of its own, such as Project's
  (`apps/project/src/components/project/three-panels.tsx`, which has a
  phone tab more and a remembered task instead of `place`). The frame
  provides each side's press and whether it is shut, and the two buttons
  above then work in it unchanged, so the app never redraws them (9 Nov
  2026, Project's shell look).
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
  show only"); always on a phone. Hidden, they take no room, so a title has
  the card's whole width in a narrow side panel and is cut short only while
  the card is pointed at (Tyler, 5 Nov 2026, of Promo's network cards
  reading "Reddi..."); before that they were see-through and still held
  their place.
  `icon` draws a 16px mark before the title, such as a network's on Promo's
  network cards. `openWhen` opens a folded card each time it turns true,
  whatever was remembered, so a row picked from elsewhere (a notice's link)
  is never hidden inside a shut card; folding it again is still allowed.
  Both came from Promo's project column, 5 Nov 2026.
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
- **`mass-select.tsx`.** `MassSelectButton`, the "Mass select" / "Hide select"
  button in the header, left of the search (Tyler, 5 Nov 2026), which Contacts
  uses. `MassSelectChip` is the older chip beside the first column's heading,
  shown while that heading is pointed at (put `group/title` on the heading);
  lists an app drew for itself still use it until they move. `SelectedMenu`, the "N selected"
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
  existed reads as pills. The CRM inbox's All / Unread uses it too. Tyler,
  4 Nov 2026: "wire the dashboard widgets tabs to the settings tab styling". In
  a card header the tabs' box is as tall as the header row, so the line sits on
  the header's bottom divider ("border to be at the edge").
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
- **The picked view stays picked.** Tyler, 2 Nov 2026: "It should stay the
  same view I selected even on refresh", "whatever view I selected, that view
  should show inplace of "Views"", with a rainbow border around the button.
  `SavedViewsControls` remembers the view last opened, in this browser, per
  screen (`saved-view:<screen>` in localStorage). The button then shows its
  name inside the same moving rainbow edge as the "N selected" button, and
  its row in the menu has a tick. Arriving with no filters in the address,
  from the left menu or a new tab, opens that view again; an address that
  already has filters, such as a shared link, wins. Narrowing on top of it,
  such as Project's pinned project card, keeps the view, and undoing that
  goes back to it, the view's own project included: the screen reads the
  pick with `readActiveView` (`src/lib/saved-views.ts`) when it is undone
  (Tyler, 2 Nov 2026: "clicking on project again does not go back to my
  saved view"). "No view" at the top of the menu forgets the pick and
  calls the screen's `onClose`, which takes the view's filters away. A view
  deleted since is simply not picked.

## Which screens use them

- **Contacts, `/admin/contacts`.** Every piece above.
  `src/components/broadcasts/contacts-dashboard.tsx` is the place to start
  reading.
- **The CRM, `/admin/crm`.** `ThreePanels`, `SidePanelCollapseButton`,
  `DashboardTabs`, `FilterPopover`, `SelectedMenu` and the page pieces in
  `page-blocks.md`, since 7 Nov 2026.
  `src/components/crm/crm-workspace.tsx` is the place to start reading.
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
