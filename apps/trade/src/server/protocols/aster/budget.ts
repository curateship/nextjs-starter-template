import type { NetworkId } from "@/lib/protocols/contracts"
import type { RationLane } from "@/server/protocols/rationing"

const MINUTE_MS = 60_000
const BACKGROUND_NUMERATOR = 4
const BACKGROUND_DENOMINATOR = 5

type AsterRateLimitRow = {
  rateLimitType?: unknown
  interval?: unknown
  intervalNum?: unknown
  limit?: unknown
}

type AsterExchangeInfo = {
  rateLimits?: unknown
}

type RequestEntry = {
  id: number
  at: number
  lane: RationLane
  weight: number
}

type OrderEntry = {
  at: number
  account: string
  count: number
}

type OrderLimit = {
  windowMs: number
  limit: number
}

type ObservedWeight = {
  at: number
  used: number
  lastEntryId: number
}

type BudgetState = {
  requestLimit: number
  requests: RequestEntry[]
  orderLimits: OrderLimit[]
  orderEntries: OrderEntry[]
  nextEntryId: number
  observedWeight: ObservedWeight | null
}

export type AsterRequestCost = {
  weight: number
  lane: RationLane
  priority: "background" | "order"
  orders?: number
  orderAccount?: string
}

const budgets = new Map<NetworkId, BudgetState>()

function positiveInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function windowMs(row: AsterRateLimitRow): number | null {
  const intervalNum = positiveInteger(row.intervalNum)
  if (intervalNum === null || typeof row.interval !== "string") return null
  const unit =
    row.interval === "SECOND"
      ? 1_000
      : row.interval === "MINUTE"
        ? MINUTE_MS
        : row.interval === "HOUR"
          ? 60 * MINUTE_MS
          : row.interval === "DAY"
            ? 24 * 60 * MINUTE_MS
            : null
  if (unit === null) return null
  const duration = intervalNum * unit
  return Number.isSafeInteger(duration) ? duration : null
}

function rateLimitRows(payload: unknown): AsterRateLimitRow[] {
  if (payload === null || typeof payload !== "object") return []
  const rows = (payload as AsterExchangeInfo).rateLimits
  return Array.isArray(rows)
    ? rows.filter(
        (row): row is AsterRateLimitRow =>
          row !== null && typeof row === "object"
      )
    : []
}

/** Read Aster's current limits once and include the exchange-info request. */
export function configureAsterBudget(
  network: NetworkId,
  payload: unknown,
  bootstrapWeight: number,
  now = Date.now()
): void {
  if (budgets.has(network)) return
  const rows = rateLimitRows(payload)
  const requestRow = rows.find(
    (row) =>
      row.rateLimitType === "REQUEST_WEIGHT" && windowMs(row) === MINUTE_MS
  )
  const requestLimit = positiveInteger(requestRow?.limit)
  if (requestLimit === null) throw new Error("ASTER_REQUEST_LIMIT_MISSING")

  const orderLimits = rows.flatMap((row): OrderLimit[] => {
    if (row.rateLimitType !== "ORDERS") return []
    const limit = positiveInteger(row.limit)
    const duration = windowMs(row)
    return limit === null || duration === null
      ? []
      : [{ windowMs: duration, limit }]
  })
  if (orderLimits.length === 0) throw new Error("ASTER_ORDER_LIMIT_MISSING")
  const weight = positiveInteger(bootstrapWeight)
  if (weight === null) throw new Error("ASTER_REQUEST_WEIGHT_INVALID")

  budgets.set(network, {
    requestLimit,
    requests: [{ id: 1, at: now, lane: "public", weight }],
    orderLimits,
    orderEntries: [],
    nextEntryId: 2,
    observedWeight: null,
  })
}

function stateFor(network: NetworkId): BudgetState {
  const state = budgets.get(network)
  if (!state) throw new Error("ASTER_REQUEST_LIMIT_MISSING")
  return state
}

function prune(state: BudgetState, now: number): void {
  state.requests = state.requests.filter((entry) => entry.at > now - MINUTE_MS)
  const longestOrderWindow = Math.max(
    0,
    ...state.orderLimits.map((limit) => limit.windowMs)
  )
  state.orderEntries = state.orderEntries.filter(
    (entry) => entry.at > now - longestOrderWindow
  )
  if (state.observedWeight && state.observedWeight.at <= now - MINUTE_MS) {
    state.observedWeight = null
  }
}

function localWeight(state: BudgetState): number {
  return state.requests.reduce((total, entry) => total + entry.weight, 0)
}

function usedWeight(state: BudgetState): number {
  const local = localWeight(state)
  const observed = state.observedWeight
  if (!observed) return local
  const sinceObservation = state.requests.reduce(
    (total, entry) =>
      entry.id > observed.lastEntryId ? total + entry.weight : total,
    0
  )
  return Math.max(local, observed.used + sinceObservation)
}

/**
 * Reserve one request before sending it. Background reads stop at four fifths
 * of Aster's own limit, leaving the last fifth available to order work.
 */
export function reserveAsterRequest(
  network: NetworkId,
  cost: AsterRequestCost,
  now = Date.now()
): void {
  const weight = positiveInteger(cost.weight)
  if (weight === null) throw new Error("ASTER_REQUEST_WEIGHT_INVALID")
  const orderCount =
    cost.orders === undefined ? 0 : positiveInteger(cost.orders)
  if (cost.orders !== undefined && orderCount === null) {
    throw new Error("ASTER_ORDER_COUNT_INVALID")
  }
  if (orderCount && !cost.orderAccount) {
    throw new Error("ASTER_ORDER_ACCOUNT_REQUIRED")
  }

  const state = stateFor(network)
  prune(state, now)
  const ceiling =
    cost.priority === "order"
      ? state.requestLimit
      : Math.floor(
          (state.requestLimit * BACKGROUND_NUMERATOR) / BACKGROUND_DENOMINATOR
        )
  if (usedWeight(state) + weight > ceiling) throw new Error("EXCHANGE_BUSY")

  if (orderCount && cost.orderAccount) {
    for (const limit of state.orderLimits) {
      const used = state.orderEntries.reduce(
        (total, entry) =>
          entry.account === cost.orderAccount && entry.at > now - limit.windowMs
            ? total + entry.count
            : total,
        0
      )
      if (used + orderCount > limit.limit) throw new Error("EXCHANGE_BUSY")
    }
  }

  state.requests.push({
    id: state.nextEntryId,
    at: now,
    lane: cost.lane,
    weight,
  })
  state.nextEntryId += 1
  if (orderCount && cost.orderAccount) {
    state.orderEntries.push({
      at: now,
      account: cost.orderAccount,
      count: orderCount,
    })
  }
}

/** Include requests made by another process when Aster reports the IP total. */
export function observeAsterUsedWeight(
  network: NetworkId,
  value: string | null,
  now = Date.now()
): void {
  if (value === null) return
  const used = Number(value)
  if (!Number.isSafeInteger(used) || used < 0) return
  const state = stateFor(network)
  prune(state, now)
  state.observedWeight = {
    at: now,
    used,
    lastEntryId: state.nextEntryId - 1,
  }
}

export function asterBudgetSnapshot(
  network: NetworkId,
  now = Date.now()
): {
  limit: number
  used: number
  publicWeight: number
  signedWeight: number
} {
  const state = stateFor(network)
  prune(state, now)
  return {
    limit: state.requestLimit,
    used: usedWeight(state),
    publicWeight: state.requests.reduce(
      (total, entry) => total + (entry.lane === "public" ? entry.weight : 0),
      0
    ),
    signedWeight: state.requests.reduce(
      (total, entry) => total + (entry.lane === "signed" ? entry.weight : 0),
      0
    ),
  }
}

/** Tests and a deliberate process reset must not inherit an earlier minute. */
export function clearAsterBudgets(): void {
  budgets.clear()
}
