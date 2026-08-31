# Forms, tables, dialogs, and accessibility

Custom Shell uses shared controls for:

- Buttons, fields, selects, and tabs.
- Cards and tables.
- Dialogs and menus.
- Loading and empty states.

A feature composes those controls instead of making a slightly different local
version.

Forms keep one visible home for each error:

- A field error sits with the field.
- A request error sits in the form or dialog that made the request.
- A toast can confirm completed work, but it does not replace an error needed
  to correct the form.

## Tables and lists

Admin lists use:

- The shared dashboard table frame and row actions.
- Shared selection, pagination, and empty states.
- An error row inside the table when loading fails. The error names the failed
  list and offers Try again, and the empty message stays hidden until a load
  succeeds.
- Sortable headings that expose `aria-sort`.
- Route search values for filters, current page, sort, and an open record when
  losing them on reload would interrupt the task.

At phone width, a list keeps its identifying column and any action that cannot
be reached another way. Lower-priority details return at 768px. A heading and
its cells always hide together, and the main cell may show one compact detail
under its title when that avoids keeping a whole column.

Bulk actions name how many records they affect and ask before a destructive
change. The action works from stable ids, not from row positions that could
change after a sort or refresh.

Changing the search, sort, page, or rows-per-page clears selected rows. A bulk
action never keeps acting on rows that have left the screen.

`EmptyRow` owns the spacing and type for an empty card or panel. `ErrorRow` owns
a failed data surface and its retry. `InlineError` owns a saved failure detail
that must remain beside its record. Lists that extend in place use the shared
ghost `LoadMoreButton`; its label keeps its width while the spinner runs.

## Dialogs and panels

Dialogs follow the same interaction rules:

- Trap focus and provide an accessible title.
- Return focus to the opener.
- Stay open while an irreversible request runs.
- Apply the same close rule to Escape, the backdrop, the close button, and
  cancel actions.
- Ask before discarding unsaved form work.

Resizable panels keep their collapsed state distinct from an unmounted view.
Work such as automatic refresh must stop when a panel cannot be seen, even if
the component remains mounted.

## Loading and announcements

Accessibility checks include:

- Stable loading states in the space a lazy screen will occupy.
- Live-region announcements for saved, failed, and completed changes.
- Accessible names for icon-only buttons.
- Focus styles, keyboard actions, and color contrast.
- Light and dark theme support.

See [Dashboard controls](dashboard-controls.md) for the exact tab and
sortable-heading behavior used by dashboard headers.
