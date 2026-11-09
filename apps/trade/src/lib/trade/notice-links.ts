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

import { botsRecordHref } from "@/lib/bots/bots-search"

/**
 * A notice about a bot (it stopped, it went quiet, a trigger could not start
 * it) opens that bot on the Bots dashboard, its chart in the middle and its
 * figures on the right, where the reason and the coins it watched are
 * already written down.
 */
export function flowRunNoticeHref(runId: string): string {
  return botsRecordHref("bots", runId)
}
