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
   * The exchange's page | the chart and tables | the market's page, across
   * the dashboard (the Admin 3 panel design, 7 Nov 2026). The number moved
   * with the new panels, so a width saved for the old four-panel dashboard
   * is not applied to the new one. There is no bottom row any more.
   */
  workspaceHorizontal: "trade-workspace-horizontal-2",
  /** A backtest run: settings | chart | summary, across the workspace. */
  backtestHorizontal: "trade-backtest-horizontal-2",
  /** The backtest workspace above, its coins and trades below. */
  backtestVertical: "trade-backtest-vertical",
  /** A live run: figures | chart | coins, across the workspace. */
  flowRunHorizontal: "trade-flow-run-horizontal-2",
  /** The live-run workspace above, its trades below. */
  flowRunVertical: "trade-flow-run-vertical",
  /** P&L: the Journal on the left, the grid and cards on the right. */
  pnlHorizontal: "trade-pnl-horizontal",
  /** P&L's right column: the month grid above, the three cards below. */
  pnlVertical: "trade-pnl-vertical",
  /**
   * One creator's dashboard: figures | posts | markets, across the workspace.
   *
   * One key, because there is one group. Nothing on that screen earns a
   * bottom row, so there is no vertical group to remember.
   */
  socialHorizontal: "trade-social-horizontal",
  /**
   * The social feed: creators in folders | the feed | its coins, across the
   * workspace. Like the creator's own dashboard, there is no bottom row.
   */
  socialFeedHorizontal: "trade-social-feed-horizontal-2",
} as const

export type TradePanelLayoutKey =
  (typeof tradePanelLayoutKey)[keyof typeof tradePanelLayoutKey]

/** The account-owned panel groups, also used to validate imported keys. */
export const TRADE_PANEL_LAYOUT_KEYS = Object.values(tradePanelLayoutKey)

/** The exact panel names each saved group must contain. */
export const tradePanelIds: Record<TradePanelLayoutKey, readonly string[]> = {
  [tradePanelLayoutKey.workspaceHorizontal]: ["blocks", "chart", "market"],
  [tradePanelLayoutKey.backtestHorizontal]: ["stats", "chart", "markets"],
  [tradePanelLayoutKey.backtestVertical]: ["workspace", "trades"],
  [tradePanelLayoutKey.flowRunHorizontal]: ["stats", "chart", "coins"],
  [tradePanelLayoutKey.flowRunVertical]: ["workspace", "trades"],
  [tradePanelLayoutKey.pnlHorizontal]: ["journal", "figures"],
  [tradePanelLayoutKey.pnlVertical]: ["months", "cards"],
  [tradePanelLayoutKey.socialHorizontal]: ["figures", "posts", "markets"],
  [tradePanelLayoutKey.socialFeedHorizontal]: ["creators", "feed", "coins"],
}
