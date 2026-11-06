/**
 * Where a rack's page remembers things in this browser. Kept here rather than
 * in the shell's `panelLayoutKey` list, because that list is a shell file and
 * an app never edits one, as `src/lib/archive/panel-keys.ts` does. The number
 * on the layout key is bumped whenever the default widths move.
 */
export const RACK_PANEL_LAYOUT_KEY = "promo-rack-horizontal-1"

/**
 * Where one rack's page was: its open phone, tab, search and filters. One
 * place per rack, so coming back to another rack never brings the first
 * one's filters or open phone with it.
 */
export function rackPlaceKey(rackId: string): string {
  return `promo-rack-place:${rackId}`
}
