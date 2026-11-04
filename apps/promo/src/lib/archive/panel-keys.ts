/**
 * Where the Archive remembers things in this browser. Kept here rather than
 * in the shell's `panelLayoutKey` list, because that list is a shell file and
 * an app never edits one. The number on the layout key is bumped whenever the
 * default widths move.
 */
export const ARCHIVE_PANEL_LAYOUT_KEY = "promo-archive-horizontal-1"

/** Where the Archive dashboard was: its project, open item, tab and filters. */
export const ARCHIVE_PLACE_KEY = "promo-archive-place"
