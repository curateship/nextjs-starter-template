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
  /**
   * The Trade dashboard's left page | the middle, across the dashboard (8 Nov
   * 2026: "I dont want a right panel"). The number moved with the panels, so
   * a width saved for an earlier dashboard is not applied to this one, and
   * the left panel opens at its narrowest (moved to 4 when it went to 15.2%,
   * 8 Nov 2026).
   */
  workspaceHorizontal: "trade-workspace-horizontal-4",
  /** A backtest run: settings | chart | summary, across the workspace. */
  backtestHorizontal: "trade-backtest-horizontal-2",
  /** The backtest workspace above, its coins and trades below. */
  backtestVertical: "trade-backtest-vertical",
  /** A live run: figures | chart | coins, across the workspace. */
  flowRunHorizontal: "trade-flow-run-horizontal-2",
  /** The live-run workspace above, its trades below. */
  flowRunVertical: "trade-flow-run-vertical",
} as const

export type TradePanelLayoutKey =
  (typeof tradePanelLayoutKey)[keyof typeof tradePanelLayoutKey]

/** The account-owned panel groups, also used to validate imported keys. */
export const TRADE_PANEL_LAYOUT_KEYS = Object.values(tradePanelLayoutKey)

/** The exact panel names each saved group must contain. */
export const tradePanelIds: Record<TradePanelLayoutKey, readonly string[]> = {
  [tradePanelLayoutKey.workspaceHorizontal]: ["blocks", "chart"],
  [tradePanelLayoutKey.backtestHorizontal]: ["stats", "chart", "markets"],
  [tradePanelLayoutKey.backtestVertical]: ["workspace", "trades"],
  [tradePanelLayoutKey.flowRunHorizontal]: ["stats", "chart", "coins"],
  [tradePanelLayoutKey.flowRunVertical]: ["workspace", "trades"],
}
