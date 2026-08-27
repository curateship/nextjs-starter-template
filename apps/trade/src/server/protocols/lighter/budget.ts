import type { NetworkId } from "@/lib/protocols/contracts"

/**
 * Lighter's request allowance is the tightest of the five venues, so this
 * counter runs before every call rather than after a warning.
 *
 * Lighter's docs, read on 26 Aug 2026: a Standard account gets 60 requests
 * per rolling minute, counted unweighted, and REST requests and socket
 * client messages spend the SAME bucket. A Premium account raises the cap to
 * 24,000 weighted a minute, but only by staking LIT, which Tyler has not
 * done — so 60 is the number this file enforces and nothing reads a bigger
 * one from anywhere.
 *
 * Background reads stop at four fifths of the cap, the same split Aster
 * uses, so the last fifth is always free for order work when trading opens.
 */
const MINUTE_MS = 60_000
export const LIGHTER_REQUESTS_PER_MINUTE = 60
const BACKGROUND_NUMERATOR = 3
const BACKGROUND_DENOMINATOR = 5

/**
 * **Two programs share Lighter's one allowance, and this counter only ever
 * sees one of them.**
 *
 * The website and the trading engine are separate containers with separate
 * memory, so each counted its own sixty and neither ever saw itself go over
 * — while Lighter counted the pair against a single sixty. Both stayed
 * politely under a limit that did not exist, and Lighter answered by
 * dropping the socket, which sent every read back to REST, which spent more
 * still. Measured 27 Aug 2026: the account socket died about every thirteen
 * seconds in that state.
 *
 * So each process takes half. It wastes a little when only one of them is
 * busy, and that is the right trade: the cost of being wrong the other way
 * is a feed that collapses and takes the chart down with it.
 */
/**
 * **The two programs do not need the same share.** Splitting the sixty down
 * the middle was the first attempt and it caused the very thing it was meant
 * to stop: the website's ceiling halved, so a chart somebody had just opened
 * was refused by this counter while the engine sat on an allowance it was not
 * using. The engine reads Lighter only for wallets running ladders, in short
 * bursts; the website serves a person watching a screen.
 *
 * Forty and twenty. They still add to sixty, so the pair can never breach the
 * one allowance Lighter actually counts.
 */
const WEB_SHARE = 40
const ENGINE_SHARE = 20

/**
 * The trading engine says so at boot — see `worker/src/index.ts`. Read at
 * call time rather than at import, because the engine's own modules are
 * imported before it has finished starting.
 */
function isEngine(): boolean {
  return (globalThis as { __tradeEngine?: boolean }).__tradeEngine === true
}

/** What THIS process may spend of Lighter's minute. */
export function lighterRequestsPerProcess(): number {
  return isEngine() ? ENGINE_SHARE : WEB_SHARE
}

/**
 * Three tiers, because "is anyone waiting for this?" decides who should lose
 * when the minute runs short.
 *
 * - `background` — the idle reads: the account, the resting orders, the trade
 *   history, the catalogue. Nobody is watching a spinner for these.
 * - `watched` — a chart somebody just opened. It asks LAST, after every
 *   background read of the same poll, so with one shared ceiling it was
 *   always the thing refused: the person saw "the allowance is spent" about
 *   the one request they were actually waiting for, while idle polling had
 *   quietly taken the lot. Measured 27 Aug 2026 on the deployed site.
 * - `order` — real money. Never refused before the other two are.
 */
const WATCHED_NUMERATOR = 17
const WATCHED_DENOMINATOR = 20

export type LighterRequestCost = {
  /**
   * Lighter's stated weight for the endpoint, carried so the doc's premium
   * arithmetic and the snapshot stay honest. A Standard account's cap counts
   * requests, not weight, so the reservation itself always spends one.
   */
  weight: number
  priority: "background" | "watched" | "order"
}

type Entry = {
  at: number
  weight: number
  kind: "rest" | "socket"
}

type BudgetState = { entries: Entry[] }

const budgets = new Map<NetworkId, BudgetState>()

function stateFor(network: NetworkId): BudgetState {
  const found = budgets.get(network)
  if (found) return found
  const made: BudgetState = { entries: [] }
  budgets.set(network, made)
  return made
}

function prune(state: BudgetState, now: number): void {
  state.entries = state.entries.filter((entry) => entry.at > now - MINUTE_MS)
}

/**
 * Reserve one request before sending it, or refuse with EXCHANGE_BUSY. The
 * caller never waits inside the refusal — it keeps what it has and asks
 * again on its next poll, once the rolling minute has moved on.
 */
export function reserveLighterRequest(
  network: NetworkId,
  cost: LighterRequestCost,
  now = Date.now()
): void {
  if (!Number.isInteger(cost.weight) || cost.weight <= 0) {
    throw new Error("LIGHTER_REQUEST_WEIGHT_INVALID")
  }
  const state = stateFor(network)
  prune(state, now)
  const ceiling = ceilingFor(cost.priority)
  if (state.entries.length + 1 > ceiling) throw new Error("EXCHANGE_BUSY")
  state.entries.push({ at: now, weight: cost.weight, kind: "rest" })
}

/** What this priority may spend of the process's share. */
export function ceilingFor(
  priority: LighterRequestCost["priority"]
): number {
  const share = lighterRequestsPerProcess()
  if (priority === "order") return share
  if (priority === "watched") {
    return Math.floor((share * WATCHED_NUMERATOR) / WATCHED_DENOMINATOR)
  }
  return Math.floor((share * BACKGROUND_NUMERATOR) / BACKGROUND_DENOMINATOR)
}

/**
 * A socket frame the app sent — a subscribe or a keepalive ping. Counted in
 * the same rolling minute because Lighter counts them in the same bucket.
 * Recorded rather than reserved: the frame is already gone by the time this
 * runs, and refusing a keepalive would kill the socket to save one request.
 */
export function countLighterSocketSend(
  network: NetworkId,
  now = Date.now()
): void {
  const state = stateFor(network)
  prune(state, now)
  state.entries.push({ at: now, weight: 1, kind: "socket" })
}

/** The minute so far, for the measured figures `lighter.md` records. */
export function lighterBudgetSnapshot(
  network: NetworkId,
  now = Date.now()
): { limit: number; requests: number; restRequests: number; socketSends: number; weight: number } {
  const state = stateFor(network)
  prune(state, now)
  return {
    limit: lighterRequestsPerProcess(),
    requests: state.entries.length,
    restRequests: state.entries.filter((one) => one.kind === "rest").length,
    socketSends: state.entries.filter((one) => one.kind === "socket").length,
    weight: state.entries.reduce((total, one) => total + one.weight, 0),
  }
}

/** Tests must not inherit a spent minute from an earlier case. */
export function clearLighterBudgets(): void {
  budgets.clear()
}
