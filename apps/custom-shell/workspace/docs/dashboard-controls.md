# Dashboard controls

Dashboard tab strips use the shared Tabs size and padding. A page does not add a
second height or tighter padding because the 28px active tab already fits the
32px track exactly. A tab strip in a chart header occupies one grid row, so its
vertical centre lines up with the header title and icon.

Sortable lists use `SortableTableHeader`. Every sortable heading sets
`aria-sort` to `ascending`, `descending`, or `none`, so the arrow and the
accessibility tree give the same answer. A column with no meaningful order,
such as a list of tags, may stay in the shared header as a plain heading.
