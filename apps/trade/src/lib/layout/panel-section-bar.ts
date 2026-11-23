/**
 * The shared fill and divider treatment for a row immediately below a panel
 * header or at the bottom of a panel.
 *
 * Sticky rows need an opaque version of the same muted shade, otherwise the
 * scrolling values show through the labels. Both variants use theme tokens,
 * and the plain borders follow the Divider lines setting through `--border`.
 */
export const panelSectionBarClassName = "border-y bg-muted/50"

export const stickyPanelSectionBarClassName =
  "border-y bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]"

export const stickyPanelTableHeaderClassName =
  "[--shell-card-border-color:var(--border)] [&_thead_th]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]"

export const stickyPanelTableCellClassName =
  "[--shell-card-border-color:var(--border)] bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]"
