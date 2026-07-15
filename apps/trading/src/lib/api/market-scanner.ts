import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  marketScannerRuleInputSchema,
  type MarketScannerAlertItem,
  type MarketScannerRuleInput,
} from "@/lib/market-scanner"

const idSchema = z.object({ id: z.string().uuid() })
const updateSchema = z.object({
  id: z.string().uuid(),
  rule: marketScannerRuleInputSchema,
})
const alertsPageSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(1_024).optional(),
})
const pauseSchema = z.object({ paused: z.boolean() })
const runtimeSchema = z.object({ enabled: z.boolean() })

const loadRulesPageFn = createServerFn({ method: "GET" }).handler(async () => {
    const {
      getMarketScannerPaused,
      getMarketScannerRules,
      getMarketScannerRuntimeEnabled,
    } = await import("@/server/market-scanner")
    const { getScannerUniverse } = await import("@/server/scanner/info")
    const { getMarketScannerWorkerStatus } = await import(
      "@/server/market-scanner-status"
    )
    const user = await requireUser()
    const [rules, universe, status, paused, runtimeEnabled] = await Promise.all([
      getMarketScannerRules(user.id),
      getScannerUniverse().catch(() => null),
      getMarketScannerWorkerStatus(),
      getMarketScannerPaused(user.id),
      getMarketScannerRuntimeEnabled(),
    ])
    return {
      rules,
      markets: universe
        ? universe.map((asset) => asset.coin)
        : [...new Set(rules.flatMap((rule) => rule.markets))],
      marketsAvailable: universe !== null,
      workerOnline: status.workerOnline,
      paused,
      runtimeEnabled,
      canControlRuntime: user.role === "admin",
      checkedAt: Date.now(),
    }
  })

const setPausedFn = createServerFn({ method: "POST" })
  .inputValidator(pauseSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { setMarketScannerPaused } = await import("@/server/market-scanner")
    return { paused: await setMarketScannerPaused(user.id, data.paused) }
  })

const setRuntimeEnabledFn = createServerFn({ method: "POST" })
  .inputValidator(runtimeSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    if (user.role !== "admin") throw new Error("Administrator access required")
    const { setMarketScannerRuntimeEnabled } = await import(
      "@/server/market-scanner"
    )
    return {
      runtimeEnabled: await setMarketScannerRuntimeEnabled(data.enabled),
    }
  })

const loadAlertsPageFn = createServerFn({ method: "GET" })
  .inputValidator(alertsPageSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const { getMarketScannerAlertsPage } = await import(
      "@/server/market-scanner"
    )
    return getMarketScannerAlertsPage(user.id, data)
  })

const createRuleFn = createServerFn({ method: "POST" })
  .inputValidator(marketScannerRuleInputSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    await assertSelectedMarkets(data)
    const { createMarketScannerRule } = await import("@/server/market-scanner")
    return createMarketScannerRule(user.id, data)
  })

const updateRuleFn = createServerFn({ method: "POST" })
  .inputValidator(updateSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    await assertSelectedMarkets(data.rule)
    const { updateMarketScannerRule } = await import("@/server/market-scanner")
    return updateMarketScannerRule(user.id, data.id, data.rule)
  })

const deleteRuleFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { deleteMarketScannerRule } = await import("@/server/market-scanner")
    return deleteMarketScannerRule(user.id, data.id)
  })

const pollAlertsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ alerts: MarketScannerAlertItem[]; unreadCount: number }> => {
    const user = await requireUser()
    const { getMarketScannerAlertsPage } = await import(
      "@/server/market-scanner"
    )
    const page = await getMarketScannerAlertsPage(user.id, { limit: 10 })
    return { alerts: page.alerts, unreadCount: page.unreadCount }
  }
)

const markAlertReadFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { markMarketScannerAlertRead } = await import(
      "@/server/market-scanner"
    )
    return markMarketScannerAlertRead(user.id, data.id)
  })

const markAllAlertsReadFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireMutation()
    const user = await requireUser()
    const { markAllMarketScannerAlertsRead } = await import(
      "@/server/market-scanner"
    )
    return markAllMarketScannerAlertsRead(user.id)
  }
)

const deleteAllAlertsFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireMutation()
    const user = await requireUser()
    const { deleteAllMarketScannerAlerts } = await import(
      "@/server/market-scanner"
    )
    return deleteAllMarketScannerAlerts(user.id)
  }
)

export function loadMarketScannerRulesPage() {
  return loadRulesPageFn()
}

export function loadMarketScannerAlertsPage(
  limit = 25,
  cursor?: string
) {
  return loadAlertsPageFn({ data: { limit, cursor } })
}

export function createMarketScannerRule(input: MarketScannerRuleInput) {
  return createRuleFn({ data: input })
}

export function updateMarketScannerRule(
  id: string,
  input: MarketScannerRuleInput
) {
  return updateRuleFn({ data: { id, rule: input } })
}

export function deleteMarketScannerRule(id: string) {
  return deleteRuleFn({ data: { id } })
}

export function setMarketScannerPaused(paused: boolean) {
  return setPausedFn({ data: { paused } })
}

export function setMarketScannerRuntimeEnabled(enabled: boolean) {
  return setRuntimeEnabledFn({ data: { enabled } })
}

export function pollMarketScannerAlerts() {
  return pollAlertsFn()
}

export function markMarketScannerAlertRead(id: string) {
  return markAlertReadFn({ data: { id } })
}

export function markAllMarketScannerAlertsRead() {
  return markAllAlertsReadFn()
}

export function deleteAllMarketScannerAlerts() {
  return deleteAllAlertsFn()
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

async function assertSelectedMarkets(input: MarketScannerRuleInput) {
  if (input.marketScope !== "selected") return
  const { getScannerUniverse } = await import("@/server/scanner/info")
  const allowed = new Set((await getScannerUniverse()).map((asset) => asset.coin))
  if (input.markets.some((coin) => !allowed.has(coin))) {
    throw new Error("One or more markets are no longer available.")
  }
}
