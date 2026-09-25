import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  ALERT_KINDS,
  alertRuleInputSchema,
  type AlertLogFilters,
  type AlertRuleInput,
} from "@/lib/alerts"
import { HYPERLIQUID_MARKET_NAME_MAX_LENGTH } from "@/lib/hl/market-symbol"

const idSchema = z.object({ id: z.string().uuid() })
const updateSchema = z.object({
  id: z.string().uuid(),
  alert: alertRuleInputSchema,
})
const logFiltersSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  coin: z
    .string()
    .trim()
    .min(1)
    .max(HYPERLIQUID_MARKET_NAME_MAX_LENGTH)
    .optional(),
  kind: z.enum(ALERT_KINDS).optional(),
  read: z.enum(["all", "read", "unread"]).default("all"),
  sortBy: z
    .enum(["time", "market", "alert", "condition", "observed", "read"])
    .default("time"),
  dir: z.enum(["asc", "desc"]).default("desc"),
})

const loadAlertsPageFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  const { getAlertRules } = await import("@/server/alerts")
  const { getActivePerpMarkets } = await import("@/server/hyperliquid/info")
  const { getAlertWorkerStatus } = await import("@/server/worker-status")
  const [rules, markets, status] = await Promise.all([
    getAlertRules(user.id),
    getActivePerpMarkets("mainnet").catch(() => null),
    getAlertWorkerStatus(),
  ])
  return {
    rules,
    markets: markets
      ? markets.map((asset) => asset.coin)
      : [...new Set(rules.map((rule) => rule.coin))],
    marketsAvailable: markets !== null,
    workerOnline: status.workerOnline,
    workerActive: status.workerActive,
    checkedAt: Date.now(),
  }
})

// Every alert rule the user owns. The trade dashboard needs both the price
// lines for the open market and the list of markets that have any alert, so it
// polls this once and slices it locally instead of asking per market.
const loadMyAlertRulesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser()
    const { getAlertRules } = await import("@/server/alerts")
    return getAlertRules(user.id)
  }
)

const loadAlertLogFn = createServerFn({ method: "GET" })
  .inputValidator(logFiltersSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const { getAlertEventsPage } = await import("@/server/alerts")
    return getAlertEventsPage(user.id, data)
  })

const createAlertFn = createServerFn({ method: "POST" })
  .inputValidator(alertRuleInputSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    await assertAlertMarket(data.coin)
    await assertTrendlineExists(user.id, data)
    const { createAlertRule, getAlertRules } = await import("@/server/alerts")
    if (data.kind === "trendline") {
      // One rule per line — the chart toggle relies on that.
      const rules = await getAlertRules(user.id)
      if (
        rules.some(
          (rule) =>
            rule.kind === "trendline" &&
            rule.network === data.network &&
            rule.coin === data.coin &&
            rule.trendlineId === data.trendlineId
        )
      ) {
        throw new Error("This line already has an alert.")
      }
    }
    return createAlertRule(user.id, data)
  })

const updateAlertFn = createServerFn({ method: "POST" })
  .inputValidator(updateSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    await assertAlertMarket(data.alert.coin)
    await assertTrendlineExists(user.id, data.alert)
    const { updateAlertRule } = await import("@/server/alerts")
    return updateAlertRule(user.id, data.id, data.alert)
  })

const pauseAlertFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { pauseAlertRule } = await import("@/server/alerts")
    return pauseAlertRule(user.id, data.id)
  })

const activateAlertFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { activateAlertRule } = await import("@/server/alerts")
    return activateAlertRule(user.id, data.id)
  })

const deleteAlertFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { deleteAlertRule } = await import("@/server/alerts")
    return deleteAlertRule(user.id, data.id)
  })

const pollAlertEventsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser()
    const { getAlertEventsPage } = await import("@/server/alerts")
    const page = await getAlertEventsPage(user.id, { page: 1, pageSize: 10 })
    return { events: page.items, unreadCount: page.unreadCount }
  }
)

const markAlertEventReadFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { markAlertEventRead } = await import("@/server/alerts")
    return markAlertEventRead(user.id, data.id)
  })

const markAllAlertEventsReadFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireMutation()
    const user = await requireUser()
    const { markAllAlertEventsRead } = await import("@/server/alerts")
    return markAllAlertEventsRead(user.id)
  }
)

const clearAlertEventsFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireMutation()
    const user = await requireUser()
    const { clearAlertEvents } = await import("@/server/alerts")
    return clearAlertEvents(user.id)
  }
)

export function loadAlertsPage() {
  return loadAlertsPageFn()
}

export function loadMyAlertRules() {
  return loadMyAlertRulesFn()
}

export function loadAlertLog(filters: AlertLogFilters = {}) {
  return loadAlertLogFn({ data: filters })
}

export function createAlert(input: AlertRuleInput) {
  return createAlertFn({ data: input })
}

export function updateAlert(id: string, input: AlertRuleInput) {
  return updateAlertFn({ data: { id, alert: input } })
}

export function pauseAlert(id: string) {
  return pauseAlertFn({ data: { id } })
}

export function activateAlert(id: string) {
  return activateAlertFn({ data: { id } })
}

export function deleteAlert(id: string) {
  return deleteAlertFn({ data: { id } })
}

export function pollAlertEvents() {
  return pollAlertEventsFn()
}

export function markAlertEventRead(id: string) {
  return markAlertEventReadFn({ data: { id } })
}

export function markAllAlertEventsRead() {
  return markAllAlertEventsReadFn()
}

export function clearAlertEvents() {
  return clearAlertEventsFn()
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}

async function requireMutation() {
  const { requireAppOrigin } = await import("@/server/origin")
  requireAppOrigin()
}

async function assertTrendlineExists(userId: string, input: AlertRuleInput) {
  if (input.kind !== "trendline") return
  const { loadUserChartDrawings } = await import("@/server/chart-drawings")
  const drawings = await loadUserChartDrawings(userId, {
    network: input.network,
    market: input.coin,
  })
  const line = drawings.trendlines.find(
    (candidate) => candidate.id === input.trendlineId
  )
  if (!line) {
    throw new Error(
      "That drawn line was not found. If you just drew it, give it a second to save and try again."
    )
  }
  if (line.start.time === line.end.time && line.start.price !== line.end.price) {
    throw new Error("A vertical line has no single price to alert on.")
  }
}

export async function assertAlertMarket(coin: string) {
  const { getActivePerpMarkets } = await import("@/server/hyperliquid/info")
  const markets = await getActivePerpMarkets("mainnet")
  if (!markets.some((market) => market.coin === coin)) {
    throw new Error("This market is no longer available.")
  }
}
