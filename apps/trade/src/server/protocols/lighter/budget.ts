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
const BACKGROUND_NUMERATOR = 4
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
const PROCESSES_SHARING_THE_CAP = 2
/** What THIS process may spend of Lighter's minute. Half of the venue's cap. */
export const LIGHTER_REQUESTS_PER_PROCESS = Math.floor(
  LIGHTER_REQUESTS_PER_MINUTE / PROCESSES_SHARING_THE_CAP
)

export type LighterRequestCost = {
  /**
   * Lighter's stated weight for the endpoint, carried so the doc's premium
   * arithmetic and the snapshot stay honest. A Standard account's cap counts
   * requests, not weight, so the reservation itself always spends one.
   */
  weight: number
  priority: "background" | "order"
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
  const ceiling =
    cost.priority === "order"
      ? LIGHTER_REQUESTS_PER_PROCESS
      : Math.floor(
          (LIGHTER_REQUESTS_PER_PROCESS * BACKGROUND_NUMERATOR) /
            BACKGROUND_DENOMINATOR
        )
  if (state.entries.length + 1 > ceiling) throw new Error("EXCHANGE_BUSY")
  state.entries.push({ at: now, weight: cost.weight, kind: "rest" })
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
    limit: LIGHTER_REQUESTS_PER_PROCESS,
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
