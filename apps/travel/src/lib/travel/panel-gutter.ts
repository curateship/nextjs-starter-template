/**
 * The space inside the side panels of a three-column dashboard: from the
 * panel's edges to its cards, and between one card and the next. One number,
 * read by the left and the right panel alike (Tyler, 30 Oct 2026: "all
 * panels gutter needs to follow this size", after picking 15px for the left
 * panel). The right panel's footer uses it too, so its edge lines up.
 *
 * No space on top: the first card or block sits straight under the panel's
 * header, as on the shell's side panels, and a writing area keeps its own
 * 15px above plain text (UI standard, "A side panel's body"; Tyler, 13 Nov
 * 2026: "The blank strip ... is a persistent problem").
 */
export const PANEL_GUTTER = "gap-3.75 px-3.75 pt-0 pb-3.75"
export const PANEL_FOOTER_PADDING = "p-3.75"
