/**
 * What to do when an exchange tells us to slow down.
 *
 * **The wrong answer is to wait and try again inside the request.** That was
 * this app's first answer and it is what froze the screens: a rationed read
 * waited its full deadline, slept, tried again, slept, tried again — fifty
 * seconds for one wallet — and every one of those requests sat holding a
 * database connection while it waited. Three at once spent the pool, and then
 * every read in the app, including ones that never touch an exchange, waited
 * behind them. The panels showed a spinner that never ended.
 *
 * The right answer is to believe the exchange. When it rations us, stop
 * asking it anything for a short while and answer "busy" at once. A caller
 * that hears "busy" keeps what it has and tries on its next poll, seconds
 * later — which is exactly what it would have done after waiting, minus the
 * held connection and the extra requests that deepened the rationing.
 *
 * **Public and private are held apart**, because exchanges count them apart:
 * the public market list is rationed by where the request comes from, and the
 * signed reads by which key made them. Conflating the two meant one busy API
 * key stopped the market list from drawing at all — the list is public data
 * that has nothing to do with anyone's account, and it kept refusing with
 * "the exchange did not answer" while the exchange was answering perfectly
 * well.
 */

/** Which of an exchange's two allowances a request spends. */
export type RationLane = "public" | "signed"

/** How long to leave an exchange alone after it rations us. */
const HOLD_MS = 20_000

const holds = new Map<string, number>()

const keyOf = (exchange: string, network: string, lane: RationLane) =>
  `${exchange}:${network}:${lane}`

/** Told to slow down — leave this side of the exchange alone for a while. */
export function startRationing(
  exchange: string,
  network: string,
  lane: RationLane
): void {
  holds.set(keyOf(exchange, network, lane), Date.now() + HOLD_MS)
}

/**
 * Whether this exchange is still being left alone. Callers check before
 * building a request and refuse instantly rather than joining a queue.
 */
export function isRationed(
  exchange: string,
  network: string,
  lane: RationLane
): boolean {
  const until = holds.get(keyOf(exchange, network, lane))
  if (until === undefined) return false
  if (Date.now() >= until) {
    holds.delete(keyOf(exchange, network, lane))
    return false
  }
  return true
}

/** Answered normally — anything the last refusal held back is over. */
export function stopRationing(
  exchange: string,
  network: string,
  lane: RationLane
): void {
  holds.delete(keyOf(exchange, network, lane))
}

/** Tests drive their own time; a hold across them would leak between cases. */
export function clearRationing(): void {
  holds.clear()
}
