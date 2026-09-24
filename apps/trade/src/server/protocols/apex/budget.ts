import type { NetworkId } from "@/lib/protocols/contracts"

/**
 * ApeX Omni's published request limits, read from its API docs on
 * 5 Sep 2026 and again on 24 Sep 2026:
 *
 * - 600 requests per 60 seconds per internet address.
 * - Per account, 300 POST requests and 600 GET requests per 60 seconds.
 * - 200 open orders per user (enforced by the order path, not here).
 *
 * ApeX published these where the other decentralised venues did not, so the
 * client counts all three windows itself and refuses at once when one is
 * full, rather than finding out from a refusal.
 */
const MINUTE_MS = 60_000
export const APEX_IP_PER_MINUTE = 600
export const APEX_ACCOUNT_POSTS_PER_MINUTE = 300
export const APEX_ACCOUNT_GETS_PER_MINUTE = 600

/**
 * **The website and the trading engine share one internet address and one
 * account, and each process only sees its own requests.** Lighter taught
 * this: two processes each spending the whole allowance got the pair
 * rationed. So the website takes two thirds of every window and the engine
 * one third, and the pair can never breach what ApeX counts.
 */
const WEB_SHARE = 2 / 3
const ENGINE_SHARE = 1 / 3

function isEngine(): boolean {
  return (globalThis as { __tradeEngine?: boolean }).__tradeEngine === true
}

function processShare(limit: number): number {
  return Math.floor(limit * (isEngine() ? ENGINE_SHARE : WEB_SHARE))
}

/**
 * Who loses when a minute runs short, as on Lighter: idle reads stop at
 * three fifths of the share, a chart somebody just opened at seventeen
 * twentieths, and order work may use all of it.
 */
export type ApexPriority = "background" | "watched" | "order"

function ceilingFor(limit: number, priority: ApexPriority): number {
  const share = processShare(limit)
  if (priority === "order") return share
  if (priority === "watched") return Math.floor((share * 17) / 20)
  return Math.floor((share * 3) / 5)
}

/** The three windows a request can spend from. */
export type ApexWindow = "ip" | "account-post" | "account-get"

const WINDOW_LIMITS: Record<ApexWindow, number> = {
  ip: APEX_IP_PER_MINUTE,
  "account-post": APEX_ACCOUNT_POSTS_PER_MINUTE,
  "account-get": APEX_ACCOUNT_GETS_PER_MINUTE,
}

const WINDOW_WORDS: Record<ApexWindow, string> = {
  ip: "requests from this server",
  "account-post": "order changes on this account",
  "account-get": "account reads",
}

/** Request times per window, keyed by network and (for accounts) API key. */
const spent = new Map<string, number[]>()

function windowKey(network: NetworkId, window: ApexWindow, account?: string) {
  return window === "ip" ? `${network}:ip` : `${network}:${window}:${account}`
}

function recent(key: string, now: number): number[] {
  const kept = (spent.get(key) ?? []).filter((at) => at > now - MINUTE_MS)
  spent.set(key, kept)
  return kept
}

/**
 * Reserve one request in every window it spends from, or refuse at once
 * with `EXCHANGE_BUSY:` and the count. Nothing waits inside the refusal: the
 * sentence says how long until there is room, and the caller keeps what it
 * has and asks again on its next turn.
 *
 * All windows are checked before any is spent, so a refused request costs
 * nothing.
 */
export function reserveApexRequest(
  network: NetworkId,
  input: {
    priority: ApexPriority
    /** Signed requests also spend from their account's POST or GET window. */
    account?: { key: string; method: "GET" | "POST" }
  },
  now = Date.now()
): void {
  const windows: Array<{ window: ApexWindow; key: string }> = [
    { window: "ip", key: windowKey(network, "ip") },
  ]
  if (input.account) {
    const window: ApexWindow =
      input.account.method === "POST" ? "account-post" : "account-get"
    windows.push({ window, key: windowKey(network, window, input.account.key) })
  }
  for (const { window, key } of windows) {
    const times = recent(key, now)
    const ceiling = ceilingFor(WINDOW_LIMITS[window], input.priority)
    if (times.length + 1 > ceiling) {
      const oldest = times[times.length - ceiling] ?? times[0] ?? now
      const seconds = Math.max(1, Math.ceil((oldest + MINUTE_MS - now) / 1_000))
      throw new Error(
        `EXCHANGE_BUSY:ApeX Omni — spent ${times.length} of ${ceiling} ${WINDOW_WORDS[window]} this minute, room again in ${seconds} seconds`
      )
    }
  }
  for (const { key } of windows) recent(key, now).push(now)
}

/**
 * How long ApeX is left alone after it rations us, per lane.
 *
 * It doubles on every rationing answer in a row, from 5 seconds up to the
 * one minute ApeX's windows last, and clears on the first normal answer.
 * Asking again at once would spend the next minute's allowance on
 * refusals, which is how an exchange starts refusing for good.
 */
const FIRST_HOLD_MS = 5_000
const LONGEST_HOLD_MS = 60_000

type Hold = { until: number; lastMs: number }
const holds = new Map<string, Hold>()

/** Lanes are "public", or an API key for that account's signed requests. */
export function assertApexNotHeld(
  network: NetworkId,
  lane: string,
  now = Date.now()
): void {
  const hold = holds.get(`${network}:${lane}`)
  if (!hold || now >= hold.until) return
  const seconds = Math.max(1, Math.ceil((hold.until - now) / 1_000))
  throw new Error(
    `EXCHANGE_BUSY:ApeX Omni — asked Trade to slow down, asking again in ${seconds} seconds`
  )
}

/** ApeX rationed a request: hold this lane, twice as long as last time. */
export function holdApexLane(
  network: NetworkId,
  lane: string,
  now = Date.now()
): number {
  const key = `${network}:${lane}`
  const last = holds.get(key)?.lastMs ?? 0
  const lastMs = last === 0 ? FIRST_HOLD_MS : Math.min(last * 2, LONGEST_HOLD_MS)
  holds.set(key, { until: now + lastMs, lastMs })
  return lastMs
}

/** A normal answer: whatever the last rationing held back is over. */
export function releaseApexLane(network: NetworkId, lane: string): void {
  holds.delete(`${network}:${lane}`)
}

/** Tests must not inherit a spent minute or a hold from an earlier case. */
export function clearApexBudgets(): void {
  spent.clear()
  holds.clear()
}
