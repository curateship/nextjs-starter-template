/**
 * The Bots dashboard's keys (9 Nov 2026), kept in this browser rather than on
 * the account, the way the shell's `ThreePanels` keeps every dashboard's
 * widths. Three panels, each side opening at its narrowest; the two panels of
 * Overview and the Recipes table under a key of their own, so a width dragged
 * on one carries to the other; and `place`, where the dashboard was, for
 * `useDashboardPlace`.
 */
export const botsPanelKey = {
  dashboard: "trade-bots-horizontal-1",
  twoPanels: "trade-bots-two-panels-horizontal-1",
  place: "trade-bots-place",
} as const

/**
 * The Trade dashboard's left page | the middle | the trade details, kept in
 * this browser under `sidePanelWidthsKey`, with the left and right widths
 * from Settings → Styling → Side panels on the end (Overview has no right
 * panel, so its right width is 0). A changed setting starts from the new
 * width, and Settings' Reset panels forgets a dragged one, as on every shell
 * dashboard. Bumped from 5 to 6 on 10 Nov 2026, when the right panel came in
 * ("I want to add a right panel in the positions and journal tab"), so
 * widths saved for two panels open at the new defaults. It was kept on the
 * account under `trade-workspace-horizontal-4`.
 */
export const tradeWorkspacePanelKey = "trade-workspace-horizontal-6"
