# UI Rules

Use these rules for every new or modified interface. App-specific UI guides may add stricter rules.

## Core

- Reuse components from `src/components/ui/` and existing app shells. Do not hand-roll parallel buttons, forms, tables, modals, cards, or scroll areas.
- Keep shared styling in primitives, not repeated page-level classes.
- Match neighboring screens and use semantic theme tokens instead of hardcoded colors.

## Control Sizes

| Size | Height |
| --- | ---: |
| Extra small | 24px (`h-6`) |
| Small | 28px (`h-7`) |
| Default | 32px (`h-8`) |
| Large | 36px (`h-9`) |

- Inputs, selects, and standard buttons use the default height. Icon buttons are square at the matching size.
- Use component size props; never override heights at individual call sites.
- Align a divergent shared primitive in a focused design-system change instead of adding local exceptions.

## Buttons and Forms

- Standard buttons are always 32px (`h-8`) by default, including modal footer and table-toolbar buttons. Use another documented size only for a clear compact or prominent context.
- Use one primary button per action group, `outline` for secondary actions, `ghost` for low-emphasis actions, and destructive styling only for irreversible actions.
- Order footer actions as Cancel, then primary or destructive. Disable running actions and show a compact loading indicator.
- Icon-only buttons require an accessible name and a tooltip when their meaning is not obvious.
- Give every field a visible label. Keep help and error text beside the field and preserve entered values after errors.
- Draggable or repeatable text-field lists start with one default row. Users add more rows explicitly; do not create multiple empty rows by default.
- Use `gap-1` label-to-control, `gap-2` within field groups, and `gap-4` between form sections.

## Tables

- Use shared `Table` primitives and `TableSurface`, not raw div grids or one-off styling.
- Use a 40px header (`h-10`), compact cells (`px-5 py-2`), a muted header, and the shared rounded surface.
- Keep the main column flexible, metadata compact, and actions in the final column.
- Order table-card toolbar controls from left to right: mass delete, search, filters, settings, edit actions, then create buttons. Omit unavailable controls without changing the order of the remaining controls.
- Use horizontal scrolling for real overflow and hide low-priority columns on narrow screens.
- Use the shared sort control only when sorting exists. Keep loading, empty, error, and pagination states inside the table surface.

## Modals

- Use shared `Dialog` for forms and `AlertDialog` or the established confirmation component for destructive actions.
- Form modals use header, scrollable body, and footer. Keep the header and footer visible.
- Use the app's existing admin/form variant; do not invent modal shells, overlays, close buttons, or footer layouts.
- Separate related modal fields into distinct `Card` sections. Each card covers one topic; do not leave form fields loose on the modal shell. Compact confirmation dialogs do not need cards.
- Keep confirmations compact and explain the consequence in plain English.
- Do not nest modals. Support Escape, focus trapping, focus restoration, and accessible titles.

## Layout and States

- Let the app shell own page padding. Use `gap-2 md:gap-3` for page sections, cards, columns, and panels.
- Use shared cards and surfaces; avoid arbitrary spacing, widths, radii, shadows, gradients, pills, or badges.
- Every data surface needs intentional loading, empty, error, and populated states.
- Keep skeletons inside the content they replace. Errors must explain what failed and how to recover.
- Design narrow and desktop layouts together. Use shared scroll areas and avoid nested scrolling.

## Accessibility and Verification

- Use semantic elements, keyboard interaction, visible focus, sufficient contrast, and reduced-motion support.
- Do not communicate state with color alone. Associate form errors with their fields.
- Verify loading, empty, error, disabled, success, long-content, narrow-screen, dark-theme, and keyboard behavior when relevant.
- Validate the changed workflow in the running app when browser or native validation is available.
