/**
 * The space inside the side panels of a three-column dashboard (copied from
 * Project's `panel-gutter.ts`, 7 Nov 2026): from the
 * panel's edges to its cards. One number,
 * read by the left and the right panel alike (Tyler, 30 Oct 2026: "all
 * panels gutter needs to follow this size", after picking 15px for the left
 * panel). The right panel's footer uses it too, so its edge lines up.
 */
// --panel-gutter carries the same 15px, so an advanced block set to edge to
// edge (Settings → Styling → Blocks) knows how far to reach past it.
//
// The cards sit flush, one under the next, with no gap between them (Tyler,
// 11 Nov 2026: "remove the spacing here for the right panels", then
// "Actually the same for left panels too"). The 15px stays at the panel's
// sides and bottom; the first card sits straight under the panel's header
// (Tyler, 11 Nov 2026: "remove this spacing here ... for both left and right
// panels").
export const PANEL_GUTTER = "gap-0 px-3.75 pt-0 pb-3.75 [--panel-gutter:0.9375rem]"
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
