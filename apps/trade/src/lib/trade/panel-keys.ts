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
  /** Markets | chart | account, across the workspace. */
  workspaceHorizontal: "trade-workspace-horizontal",
  /** The chart row above, the positions row below. */
  workspaceVertical: "trade-workspace-vertical",
  /** The two rows stacked inside the right panel. */
  accountColumn: "trade-account-column",
}
