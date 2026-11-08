# Dashboard controls

Dashboard controls follow these shared rules:

- Tab strips use the shared Tabs size and padding. The 28px active tab already
  fits the 32px track, so a page does not add a second height or tighter
  padding.
- A chart-header tab strip occupies one grid row and lines up with the title and
  icon.
- Tabs in a card header are `DashboardTabs`, so they follow
  Settings → Styling → Dashboard tabs like every other dashboard header: pills,
  or words with a line under the one showing. Tyler, 4 Nov 2026: "wire the
  dashboard widgets tabs to the settings tab styling".
- An underlined tab's line sits on the header's bottom divider, not floating
  above it (Tyler, 4 Nov 2026: "border to be at the edge"). `CardHeaderRow`
  makes the tabs' box as tall as the header row so the line can reach it.
- On a phone the tabs take a row of their own under the title, because four
  pills beside it cut "Activity" to "Ac". Underlined tabs on that row get 12px
  of room above them, so they do not crowd the title.
- Sortable lists use `SortableTableHeader`. Each sortable heading sets
  `aria-sort` to `ascending`, `descending`, or `none`, so the arrow and
  accessibility tree agree. A column with no meaningful order can remain a
  plain heading.
- A multi-row action sends one request and reports the server's completed count
  through `describeBulkResult`. When only part of the selection goes through,
  the same message names how many did not.
- A row action disables only the button that started its request and shows
  `Loader2Icon` until the request ends. Buttons on the other rows stay
  available.
- Plans and Announcements keep their page in the address. Opening `?page=3`,
  or pressing Back to it, shows page 3. A search or sort change goes back to
  page 1, and so does picking how many rows fit. `useClientPage` in
  `src/lib/hooks/use-client-page.ts` takes the address's page through its
  `addressPage` argument.
- A table that sorts in the browser lists what each column sorts by and hands
  that to `sortRows` in `src/lib/hooks/use-table-sort.ts`. Text sorts
  alphabetically, numbers by size, and rows that tie keep their order.
- Opening a record from a list puts `?open=<id>` in the address through
  `useOpenRecord` in `src/lib/nav/list-search.ts`. Opening is its own history
  step, so Back closes the record and leaves the list where it was.
- A window that asks for one name (New newsletter, Save as template, Rename
  automation) is `NameDialog` in `src/components/shared/dashboard/name-dialog.tsx`.
  The name box sits in a card with a heading, Enter saves, and the box turns red
  when it is left empty.
- Admin's Overview tab draws its "per day" bars with
  `DailyBarChart` in `src/components/shared/dashboard/daily-bar-chart.tsx`.
- **Remembered panel widths arrive without a rebuild.** A resizable panel
  group draws at its default sizes and gets this browser's saved widths set on
  it before the first paint (`useRememberedPanelLayout` in
  `src/lib/layout/panel-layout.ts`), so its panels are built once on arrival
  and read their data once.
