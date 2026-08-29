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

## Forms

- Use shadcn form controls for inputs and interactions.
- Avoid native `<select>` and similar browser-default controls when a shadcn control should be used instead.
- **Errors have one home each, and it is never a hand-rolled paragraph or box:**
  - **Anything that fails when the user clicks** (submit, save, delete, vote, upload, validation on submit) reports through `showErrorToast` (`src/lib/error-toast.ts`) — a red toast in the same fixed spot as the success toasts. It stays until dismissed, a repeat failure replaces it instead of stacking, and `dismissErrorToast()` runs when a new attempt starts so a stale failure never outlives its retry. Never `toast.error` directly; the shared helper owns the one-slot behavior.
  - **Data-surface load failures** (a list or page section that could not fetch) use `ErrorBanner`, with `onRetry` wherever a reload exists.
  - **Live while-you-type validation and page-state text** (a password-mismatch hint, a dead verification link) use `InlineError` next to the field or in the page body — these are not click-failures, so they stay in place.

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
