/**
 * Every panel layout the Trade workspace remembers, in one place.
 *
 * The shell keeps its own list in `panelLayoutKey`, and this app may not edit
 * that file — an edited shell file conflicts on every future shell merge. So
 * the app keeps its own list, for the same reason the shell keeps one: keys
 * written out at each call site collide and drift.
 *
 * Both are read by the same `useRememberedPanelLayout`, and both are prefixed
 * so a key from one can never land on the other.
 */
export const tradePanelLayoutKey = {
  /** An opened backtest on the Bots dashboard: its chart above, its trades below. */
  backtestVertical: "trade-backtest-vertical",
  /** An opened bot on the Bots dashboard: its chart above, its trades below. */
  flowRunVertical: "trade-flow-run-vertical",
} as const

export type TradePanelLayoutKey =
  (typeof tradePanelLayoutKey)[keyof typeof tradePanelLayoutKey]

/** The account-owned panel groups, also used to validate imported keys. */
export const TRADE_PANEL_LAYOUT_KEYS = Object.values(tradePanelLayoutKey)

/** The exact panel names each saved group must contain. */
export const tradePanelIds: Record<TradePanelLayoutKey, readonly string[]> = {
  [tradePanelLayoutKey.backtestVertical]: ["workspace", "trades"],
  [tradePanelLayoutKey.flowRunVertical]: ["workspace", "trades"],
}

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
 * The Trade dashboard's left page | the middle (8 Nov 2026: "I dont want a
 * right panel"), kept in this browser under `sidePanelWidthsKey`, with the
 * left width from Settings → Styling → Side panels on the end. A changed
 * setting starts from the new width, and Settings' Reset panels forgets a
 * dragged one, as on every shell dashboard (Tyler, 10 Nov 2026: "yea fix it",
 * on Reset panels not reaching Trade). It was kept on the account until then,
 * under `trade-workspace-horizontal-4`; the server no longer reads that copy.
 */
export const tradeWorkspacePanelKey = "trade-workspace-horizontal-5"
