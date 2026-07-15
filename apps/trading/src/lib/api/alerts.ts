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
const coinSchema = z.object({
  coin: z.string().trim().min(1).max(HYPERLIQUID_MARKET_NAME_MAX_LENGTH),
})
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
  const { getMarketScannerWorkerStatus } =
    await import("@/server/market-scanner-status")
  const [rules, markets, status] = await Promise.all([
    getAlertRules(user.id),
    getActivePerpMarkets("mainnet").catch(() => null),
    getMarketScannerWorkerStatus(),
  ])
  return {
    rules,
    markets: markets
      ? markets.map((asset) => asset.coin)
      : [...new Set(rules.map((rule) => rule.coin))],
    marketsAvailable: markets !== null,
    workerOnline: status.workerOnline,
    checkedAt: Date.now(),
  }
})

const loadChartAlertsFn = createServerFn({ method: "GET" })
  .inputValidator(coinSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const { getAlertRules } = await import("@/server/alerts")
    return (await getAlertRules(user.id)).filter(
      (rule) =>
        rule.coin === data.coin &&
        rule.kind === "price_level" &&
        rule.status === "active"
    )
  })

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
    const { createAlertRule } = await import("@/server/alerts")
    return createAlertRule(user.id, data)
  })

const updateAlertFn = createServerFn({ method: "POST" })
  .inputValidator(updateSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    await assertAlertMarket(data.alert.coin)
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

export function loadChartAlerts(coin: string) {
  return loadChartAlertsFn({ data: { coin } })
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

export async function assertAlertMarket(coin: string) {
  const { getActivePerpMarkets } = await import("@/server/hyperliquid/info")
  const markets = await getActivePerpMarkets("mainnet")
  if (!markets.some((market) => market.coin === coin)) {
    throw new Error("This market is no longer available.")
  }
}
