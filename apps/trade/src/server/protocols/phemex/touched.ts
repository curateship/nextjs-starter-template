/**
 * When this app last changed something on a Phemex account.
 *
 * **Its own file for one reason: it is the one fact `client.ts` and
 * `private-feed.ts` both need.** The feed reads a credential back through the
 * client, so it imports the client. If the client imported the feed back to
 * ring this bell, the two would import each other and which one finished
 * loading first would decide whether the bell existed. So the fact sits below
 * both of them and neither imports the other for it. `kucoin/touched.ts` is
 * the same file for the same reason.
 *
 * **Why the bell is rung at all.** `private-feed.ts` lets a read be skipped
 * while the exchange has said nothing happened. The exchange does push this
 * app's own orders, a moment later — and a moment is long enough for the next
 * pass to be told the account is quiet and skip the read that would have shown
 * the order it just placed. Ringing it the instant the request finishes closes
 * that window.
 *
 * On `globalThis` rather than module scope because the dev server reloads
 * modules in place, and a fresh copy of this file would forget an act that had
 * just happened.
 */

const scope = globalThis as { __tradePhemexTouchedAt?: number }

/** This app just changed a Phemex account. */
export function phemexTouched(): void {
  scope.__tradePhemexTouchedAt = Date.now()
}

/**
 * When the last act was, or 0 if there has not been one.
 *
 * One mark for the whole app rather than one per key: an order call carries a
 * signing blob and not always the key it belongs to, so the code that changes
 * an order cannot reliably name whose account it was. Erring towards one extra
 * read on another wallet is the safe side of that.
 */
export function phemexTouchedAt(): number {
  return scope.__tradePhemexTouchedAt ?? 0
}

/** Forgets the last act. Only the tests need this. */
export function clearPhemexTouched(): void {
  scope.__tradePhemexTouchedAt = 0
}
