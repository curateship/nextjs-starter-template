/**
 * The space inside the side panels of a three-column dashboard: from the
 * panel's edges to its cards, and between one card and the next. One number,
 * read by the left and the right panel alike (Tyler, 30 Oct 2026: "all
 * panels gutter needs to follow this size", after picking 15px for the left
 * panel). The right panel's footer uses it too, so its edge lines up.
 */
export const PANEL_GUTTER = "gap-3.75 p-3.75"
/** The same gap for cards stacked inside a card, such as the project cards under Projects. */
export const PANEL_GAP = "gap-3.75"
export const PANEL_FOOTER_PADDING = "p-3.75"
/**
 * A footer card's body, under its heading: the heading's 16px at the sides and
 * below, none above, since the heading brings its own (`band` on FoldHeading).
 */
export const FOOTER_CARD_BODY = "px-4 pb-4"
/**
 * A side panel's body above `PanelFooter`: it keeps at least 6rem and grows
 * into whatever the footer leaves; with `wide` (an inbox or a notes list in
 * its place) it keeps half the panel instead.
 */
export const PANEL_BODY_ABOVE_FOOTER = "flex-[1_0_6rem]"
export const PANEL_BODY_ABOVE_FOOTER_WIDE = "flex-[1_0_50%]"
