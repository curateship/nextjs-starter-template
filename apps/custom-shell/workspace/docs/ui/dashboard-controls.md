# Dashboard controls

Dashboard controls follow these shared rules:

- Tab strips use the shared Tabs size and padding. The 28px active tab already
  fits the 32px track, so a page does not add a second height or tighter
  padding.
- A chart-header tab strip occupies one grid row and lines up with the title and
  icon.
- Tabs in a card header are the same pill tabs as everywhere else, in the
  card-header tab font, with words only and no icons. That covers Activity,
  Visitors over time and People joining. The underline tabs they used before
  were deleted on 25 Sep 2026. On a phone the tabs take a row of their own
  under the title, because four pills beside it cut "Activity" to "Ac".
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
