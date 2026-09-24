import type { NetworkId } from "@/lib/protocols/contracts"

/**
 * How many requests Trade lets itself send edgeX a minute.
 *
 * **edgeX publishes no numbers.** Its docs say public endpoints have
 * "higher rate limits", private ones depend on the API key's tier, and a
 * breach is answered with HTTP 429. So the app starts from Lighter's figure,
 * 60 a minute for the whole host, and keeps it until a day-long run measures
 * edgeX's real ceiling (task 11). Measured so far: 80 public calls in 47
 * seconds on 5 Sep 2026, every one answered.
 *
 * Sixty is enough because the sockets do the reading: prices, the open
 * chart's candle and the account's changes all arrive pushed, and REST is
 * left for the catalogue once a minute, chart backfills and orders.
 */
const MINUTE_MS = 60_000
export const EDGEX_REQUESTS_PER_MINUTE = 60

/**
 * **The website and the trading engine share one internet address, and each
 * process only sees its own requests.** Lighter taught this: two processes
 * each spending the whole allowance got the pair rationed. So the website
 * takes two thirds of the minute and the engine one third.
 */
const WEB_SHARE = 2 / 3
const ENGINE_SHARE = 1 / 3

function isEngine(): boolean {
  return (globalThis as { __tradeEngine?: boolean }).__tradeEngine === true
}

/**
 * Who loses when a minute runs short, as on Lighter and ApeX: idle reads stop
 * at three fifths of the share, a chart somebody just opened at seventeen
 * twentieths, and order work may use all of it. For the website that is 24,
 * 34 and 40 of the 60.
 */
export type EdgexPriority = "background" | "watched" | "order"

export function edgexCeiling(priority: EdgexPriority, engine = isEngine()): number {
  const share = Math.floor(EDGEX_REQUESTS_PER_MINUTE * (engine ? ENGINE_SHARE : WEB_SHARE))
  if (priority === "order") return share
  if (priority === "watched") return Math.floor((share * 17) / 20)
  return Math.floor((share * 3) / 5)
}

/** Request times this minute, per network. */
const spent = new Map<NetworkId, number[]>()

function recent(network: NetworkId, now: number): number[] {
  const kept = (spent.get(network) ?? []).filter((at) => at > now - MINUTE_MS)
  spent.set(network, kept)
  return kept
}

/**
 * Reserve one request, or refuse at once with `EXCHANGE_BUSY:` and the count.
 * Nothing waits inside the refusal: the sentence says how long until there is
 * room, and the caller keeps what it has and asks again on its next turn.
 */
export function reserveEdgexRequest(
  network: NetworkId,
  priority: EdgexPriority,
  now = Date.now()
): void {
  const times = recent(network, now)
  const ceiling = edgexCeiling(priority)
  if (times.length + 1 > ceiling) {
    const oldest = times[times.length - ceiling] ?? times[0] ?? now
    const seconds = Math.max(1, Math.ceil((oldest + MINUTE_MS - now) / 1_000))
    throw new Error(
      `EXCHANGE_BUSY:edgeX — spent ${times.length} of ${ceiling} requests this minute, room again in ${seconds} seconds`
    )
  }
  times.push(now)
}

/**
 * How long edgeX is left alone after it answers 429, per lane.
 *
 * It doubles on every 429 in a row, from 5 seconds up to a minute, and clears
 * on the first normal answer. Asking again at once would spend the next
 * minute on refusals, which is how an exchange starts refusing for good.
 */
const FIRST_HOLD_MS = 5_000
const LONGEST_HOLD_MS = 60_000

type Hold = { until: number; lastMs: number; count: number }
const holds = new Map<string, Hold>()

/** Lanes are "public", or an API key for that account's signed requests. */
export function assertEdgexNotHeld(
  network: NetworkId,
  lane: string,
  now = Date.now()
): void {
  const hold = holds.get(`${network}:${lane}`)
  if (!hold || now >= hold.until) return
  const seconds = Math.max(1, Math.ceil((hold.until - now) / 1_000))
  throw new Error(
    `EXCHANGE_BUSY:edgeX — asked Trade to slow down ${hold.count === 1 ? "once" : `${hold.count} times in a row`}, asking again in ${seconds} seconds`
  )
}

/** edgeX answered 429: hold this lane, twice as long as last time. */
export function holdEdgexLane(
  network: NetworkId,
  lane: string,
  now = Date.now()
): Hold {
  const key = `${network}:${lane}`
  const last = holds.get(key)
  const lastMs = last ? Math.min(last.lastMs * 2, LONGEST_HOLD_MS) : FIRST_HOLD_MS
  const hold = { until: now + lastMs, lastMs, count: (last?.count ?? 0) + 1 }
  holds.set(key, hold)
  return hold
}

/** A normal answer: whatever the last 429 held back is over. */
export function releaseEdgexLane(network: NetworkId, lane: string): void {
  holds.delete(`${network}:${lane}`)
}

/** Tests must not inherit a spent minute or a hold from an earlier case. */
export function clearEdgexBudgets(): void {
  spent.clear()
  holds.clear()
}
