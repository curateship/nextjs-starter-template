/**
 * What a plain order does between being placed and being filled.
 *
 * **Two honest answers, and the difference is who is holding the level.**
 *
 * `rest` puts the order on the exchange. It sits there whether or not this app
 * is running, fills without anyone watching, ties the money up while it waits,
 * and counts against the exchange's cap on open orders. Anybody reading the
 * book can see it.
 *
 * `watch` keeps the level here. Nothing is sent until the market actually
 * reaches it, and then the engine rests a post-only order just off the touch
 * and follows the price with it — the same way a signal trade buys, and never
 * by taking the market. The money stays free until the moment it is needed and
 * the level is nobody else's business. It fills only while the engine is
 * running, which is the price of all of that, and is why this is a choice
 * rather than a change.
 */
export const ORDER_STYLES = ["rest", "watch"] as const

export type OrderStyle = (typeof ORDER_STYLES)[number]

/** Watching, unless somebody has chosen otherwise: the level stays this
 * app's own until the market actually reaches it. */
export const DEFAULT_ORDER_STYLE: OrderStyle = "watch"

export function readOrderStyle(value: unknown): OrderStyle {
  return ORDER_STYLES.includes(value as OrderStyle)
    ? (value as OrderStyle)
    : DEFAULT_ORDER_STYLE
}

/**
 * What the Long and Short window itself was set to: the two styles above, plus
 * filling at the venue's current price now.
 *
 * Only that window uses it, and it sends the answer with the order. Anything
 * that does not name a style still follows the account setting.
 */
export const ENTRY_STYLES = ["watch", "rest", "market"] as const

export type EntryStyle = (typeof ENTRY_STYLES)[number]

/** Watching, the same answer the account starts on. */
export const DEFAULT_ENTRY_STYLE: EntryStyle = "watch"
