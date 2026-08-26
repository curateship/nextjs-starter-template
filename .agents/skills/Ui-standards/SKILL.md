---
name: Ui-standards
description: UI standards for building or modifying any interface in this monorepo. Custom Shell is the reference for shared primitives, spacing, controls, tables, modals, loading states, and accessibility.
tags: ui, design-system, standards
---

# UI standards

Custom Shell (`apps/custom-shell`) is the reference implementation. Reuse its
working patterns instead of inventing parallel buttons, forms, tables, cards,
modals, loaders, or scroll areas.

## What is exact and what uses judgement

- A primitive that exists in more than one app under `src/components/ui/` must
  match Custom Shell's version. Change the Custom Shell primitive first, then
  carry that finished change to other apps.
- Feature components outside `src/components/ui/` use judgement. Preserve the
  app's purpose while following the spacing, form, table, modal, loading, and
  accessibility patterns below.
- File components by feature. Custom Shell uses `account/`, `admin/`,
  `automations/`, `feedback/`, `media/`, `settings/`, `shell/`, and `shared/`.
  Only move a component into `shared/` after a second feature uses it.

## Shared building blocks

- Use the primitives in `src/components/ui/` and the established wrappers in
  `src/components/shared/`.
- Use `src/components/ui/field-label.tsx` when a field needs help text. Help is
  a tooltip beside the label, not a paragraph under the control.
- Use `src/lib/hooks/use-table-sort.ts` for sortable tables and
  `src/lib/hooks/use-selection.ts` for row selection.
- Every image field uses `src/components/shared/image-upload.tsx`. Choose its
  shape through `aspect` and its crop through `fit`; do not hand-roll upload
  buttons or file inputs.
- Use semantic theme tokens. Do not hardcode light or dark colors in a feature
  component.

## Page surfaces and spacing

- The default page canvas is `bg-muted/60`. Cards and tables sit above it using
  the shared `Card` and `TableSurface` primitives.
- `src/components/shell/dashboard-content.tsx` owns page padding and the gap
  between page-level blocks. Do not add a second page-padding wrapper.
- Custom Shell's content gutter comes from `--shell-gutter`. Card stacks use
  that same value through `CardGroup` in `src/components/ui/card.tsx`.
- Public fixed layouts use 8px on narrow screens and 12px on desktop:
  `gap-2 md:gap-3` or `space-y-2 md:space-y-3`.
- Small gaps inside a card may use `gap-1` or `gap-2`. Do not use page-level
  ad-hoc margins or unrelated gaps.
- Design narrow and desktop layouts together. Avoid arbitrary widths, radii,
  shadows, gradients, pills, and badges.

## Custom Shell runtime styling

Custom Shell lets each workspace adjust its gutter, content background, card
borders, chrome, and modal appearance. The saved values live on `ShellConfig`
in `src/lib/custom-shell.tsx` and are applied by
`src/components/shell/shell-layout.tsx` and `src/theme.css`.

- New page containers consume `--shell-gutter` instead of hardcoding spacing.
- Content surfaces use `Card` or `TableSurface` so runtime border settings reach
  them.
- Workspace card headers use `DashboardCardHeader` from
  `src/components/shared/dashboard-card-header.tsx`. The component owns the
  57px height, 12px padding and bottom divider. Title, tab and custom
  header rows compose it instead of repeating those values.
- Divider and frame lines are a plain `border`, `border-b`, or `border-t` with
  no color class. They then take `--border`, which is what the Divider lines
  setting writes. Naming a shade — `border-foreground/10`, `border-black/10` —
  looks right at the default and then never moves when the setting changes.
  `src/components/shared/dashboard-card-header.tsx` is the reference.
- Selected-state outlines and deliberate drawings, such as a measuring overlay
  or an annotation on a chart, keep their own color. Everything meant to read as
  a dividing line does not.
- A canvas or chart library that cannot read CSS still uses the same token:
  resolve it off the page and hand the result to the library, the way
  `apps/trade/src/lib/trade/chart-theme.ts` does for its axis lines. A fixed
  alpha of the foreground is the same mistake in a different place.
- The sidebar and sticky header both use `bg-sidebar`; do not color them
  separately.
- Modal rules use the shared dialog slots. Do not restate modal padding,
  borders, backgrounds, or overlay opacity in a feature component.

## Controls and forms

| Size | Height |
| --- | ---: |
| Extra small | 24px (`h-6`) |
| Small | 28px (`h-7`) |
| Default | 32px (`h-8`) |
| Large | 36px (`h-9`) |

- Inputs, selects, tabs, and standard buttons stay 32px at every breakpoint.
  Modal footer buttons are the deliberate 36px exception.
- Use component size props. Do not override control heights at call sites or
  add responsive height changes.
- Use one primary button per action group. Use `outline` for secondary actions,
  `ghost` for low-emphasis actions, and destructive styling only for actions
  that remove data.
- Icon-only buttons need an accessible name and, outside repeated table rows, a
  shared tooltip. Use `DisabledReason` for a disabled control's explanation.
- Use `SettingsIcon` for edit, `Trash2Icon` for delete, `PlusIcon` for add, and
  `Loader2Icon` for loading. Do not use a pencil icon for edit.
- Every field has a visible label linked with `id` and `htmlFor`.
- Use `gap-2` from label to control, `gap-4` between fields, and `gap-6` between
  cards in a modal body.
- Short fields may sit side by side on desktop and stack on mobile. Inputs and
  textareas fill their row; selects are content-width on desktop.
- Textareas start at one row and grow with content. Use the shared `Textarea`.
- Each checkbox or switch gets its own row.
- Validation runs when the field is left or when the action is attempted. Keep
  the action enabled, mark the field with `aria-invalid`, preserve the entered
  value, and report the problem through `src/lib/toast/error-toast.ts`.

## Tabs

- Use the shared segmented `Tabs` style: a muted container with a raised active
  tab.
- The list may fill available width, but triggers stay content-width.
- Do not add underline or plain-text tabs to a new or modified group.

## Tables

- Use `src/components/shared/dashboard-table.tsx`, the primitives in
  `src/components/ui/table.tsx`, and `TableSurface`. The reference screen is
  `src/components/admin/admin-users-dashboard.tsx`.
- Every table has a selection checkbox first, sortable data columns, and an
  actions column last. Selection and actions are not sortable.
- The header checkbox selects all visible rows and shows an indeterminate state
  when only some are selected.
- Use `TableSortButton` with `useTableSort`; do not build a separate sorting
  rule in each screen.
- Use a 40px header, `px-5 py-2` cells, a muted header, and the shared rounded
  surface.
- The main title is interactive. If it opens a detail or edit view, pass that
  same action to `TableRow` as `rowAction`.
- Mark the actions cell with `column="actions"` so a row click never steals a
  click intended for a row control.
- Row actions end with a Settings button and then a Delete button.
- Toolbar order is: multi-row actions, search, filters, secondary actions, then
  the single primary create action.
- A multi-row change is one server request. Return completed and skipped ids,
  then describe the result with `src/lib/format/bulk-result.ts`.
- Cap or clamp long text. Use horizontal scrolling only for real table
  overflow, and hide low-priority columns on narrow screens.
- Loading, empty, error, populated, and pagination states stay inside the table
  surface.

## Modals

- Use shared `Dialog` for forms and the shared confirmation dialog for
  destructive actions. Do not nest modals.
- Form windows use `DialogContent variant="admin"` from
  `src/components/ui/dialog.tsx`.
- Use `DialogHeader`, `DialogBody`, and `DialogFooter`; do not create a second
  modal shell or close button.
- Every logical body section is a `Card size="sm"`. Put its title in
  `CardHeader` and its fields in `CardContent className="grid gap-4"`.
- Footer order is Delete at far left when present, then Cancel, then the primary
  action. Editing uses “Save changes”; creation uses “Create <thing>”. A
  read-only window ends with one “Done” button.
- Use `src/components/ui/form-dialog.tsx` when a window holds typed work. Pass
  `dirty` and `busy`, and wire Cancel through its `requestClose` callback.
- Report failures through the persistent error toast. Successes from dashboard
  changes use a success toast; account-window actions may confirm inline beside
  the action.
- A record with several tabs opens from its list and keeps the open record in
  `?open=<id>`. `src/lib/hooks/use-open-from-link.ts` owns that address behavior.
- Preserve Escape, focus trapping, focus restoration, and accessible titles.

## Scrolling and loading

- Use `src/components/ui/scroll-area.tsx`; do not create raw `overflow-auto` or
  nested scrolling regions.
- Do not use skeletons or shimmer placeholders.
- Route data loads before the page renders. A surface that refreshes on its own
  keeps its real frame and uses `src/components/ui/loading-row.tsx` or a small
  centered `Loader2Icon`.
- Every data surface has intentional loading, empty, error, and populated
  states. Explain failures and how to retry.

## Accessibility and verification

- Use semantic elements, keyboard interaction, visible focus, sufficient
  contrast, and reduced-motion support.
- Do not communicate state with color alone. Associate field errors with their
  controls.
- Check loading, empty, error, disabled, success, long-content, narrow-screen,
  dark-theme, and keyboard behavior when relevant.
- Validate changed browser workflows in the running app and inspect console and
  failed network requests before reporting them complete.
