import { z } from "zod"

import { KNOWN_PROTOCOLS } from "@/lib/protocols/contracts"
import {
  readSmartOrderKind,
  readSmartPlan,
  type SmartOrder,
} from "@/lib/trade/smart-plan"
import type { TradeWallet, WalletAccountSummary } from "@/lib/trade/wallets"

const WALLET_KEY = "trade-wallet-panel"
const SMART_KEY = "trade-smart-orders-panel"

const walletSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["paper", "live"]),
  status: z.enum(["active", "inactive"]),
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
  startingBalance: z.number(),
  address: z.string().nullable(),
  hasKey: z.boolean(),
  keyValidUntil: z.number().nullable(),
})

const summarySchema = z.discriminatedUnion("state", [
  z.object({
    walletId: z.string(),
    state: z.literal("ok"),
    equity: z.number(),
    free: z.number(),
    inTrades: z.number(),
    openProfit: z.number(),
    madeOrLost: z.number(),
    settled: z.number(),
    unpricedFills: z.number(),
    stale: z.boolean().optional(),
  }),
  z.object({
    walletId: z.string(),
    state: z.literal("unreachable"),
    reason: z.string().optional(),
  }),
  z.object({ walletId: z.string(), state: z.literal("inactive") }),
])

const walletCacheSchema = z.object({
  wallets: z.array(walletSchema),
  summaries: z.array(summarySchema),
  lastWalletId: z.string().nullable(),
})

export type WalletPanelCache = {
  wallets: TradeWallet[]
  summaries: WalletAccountSummary[]
  lastWalletId: string | null
}

const smartOrderSharedSchema = z.object({
  id: z.string(),
  walletId: z.string(),
  marketKey: z.string(),
  status: z.enum(["active", "done"]),
  kind: z.string(),
  flowRunId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  plan: z.unknown(),
})

function key(prefix: string, scope: string): string {
  return `${prefix}-${scope}`
}

function readStored(storageKey: string): unknown {
  try {
    const value = window.localStorage.getItem(storageKey)
    return value === null ? null : JSON.parse(value)
  } catch {
    return null
  }
}

function writeStored(storageKey: string, value: unknown): void {
  try {
    const blob = JSON.stringify(value)
    if (window.localStorage.getItem(storageKey) !== blob)
      window.localStorage.setItem(storageKey, blob)
  } catch {
    // A browser without storage simply falls back to the normal first read.
  }
}

export function readWalletPanelCache(scope: string): WalletPanelCache | null {
  const parsed = walletCacheSchema.safeParse(readStored(key(WALLET_KEY, scope)))
  return parsed.success ? parsed.data : null
}

export function writeWalletPanelCache(
  scope: string,
  value: WalletPanelCache
): void {
  // The panel never draws the public address. Leaving it out also means this
  // display-only cache cannot become a second place account identifiers live.
  writeStored(key(WALLET_KEY, scope), {
    ...value,
    wallets: value.wallets.map((wallet) => ({ ...wallet, address: null })),
  })
}

export function readSmartOrdersCache(scope: string): SmartOrder[] | null {
  const rows = z
    .array(smartOrderSharedSchema)
    .safeParse(readStored(key(SMART_KEY, scope)))
  if (!rows.success) return null

  const orders: SmartOrder[] = []
  for (const row of rows.data) {
    const kind = readSmartOrderKind(row.kind)
    if (!kind) return null
    const plan = readSmartPlan(kind, row.plan)
    if (!plan) return null
    orders.push({ ...row, kind, plan } as SmartOrder)
  }
  return orders
}

export function writeSmartOrdersCache(
  scope: string,
  orders: readonly SmartOrder[]
): void {
  writeStored(key(SMART_KEY, scope), orders)
}
