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
- Sortable headings that expose `aria-sort`.
- Route search values for filters, current page, sort, and an open record when
  losing them on reload would interrupt the task.

Bulk actions name how many records they affect and ask before a destructive
change. The action works from stable ids, not from row positions that could
change after a sort or refresh.

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
