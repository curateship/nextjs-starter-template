/**
 * The page a flow's bell notice came off.
 *
 * Pure and browser-safe: the server writes these strings when it writes the
 * notice, and the tests read them back. Both are paths inside this app, and
 * both are checked again before the browser is sent anywhere, in
 * `isOwnAppHref`.
 *
 * A notice about a coin has no helper here. It opens that coin's chart, which
 * is `marketChartHref` in `@/lib/protocols/contracts` — the same address the
 * active-trades widget links to, and one answer to "where does this coin live"
 * rather than two that can drift.
 */

/**
 * A notice about a flow — it stopped, it went quiet, a trigger could not start
 * it — opens that run's own page, where the reason and the coins it watched
 * are already written down.
 */
export function flowRunNoticeHref(runId: string): string {
  return `/flow-runs/${encodeURIComponent(runId)}`
}

/**
 * A flow that was refused before it started has no run to open, so the notice
 * opens the flow itself — the canvas, where the step that refused it is, and
 * where switching it on again is one press.
 */
export function flowEditorNoticeHref(recipeId: string): string {
  return `/admin/recipes/${encodeURIComponent(recipeId)}`
}
