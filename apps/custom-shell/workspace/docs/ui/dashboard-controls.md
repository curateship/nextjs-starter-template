# Dashboard controls

Dashboard controls follow these shared rules:

- Tab strips use the shared Tabs size and padding. The 28px active tab already
  fits the 32px track, so a page does not add a second height or tighter
  padding.
- A chart-header tab strip occupies one grid row and lines up with the title and
  icon.
- Sortable lists use `SortableTableHeader`. Each sortable heading sets
  `aria-sort` to `ascending`, `descending`, or `none`, so the arrow and
  accessibility tree agree. A column with no meaningful order can remain a
  plain heading.
