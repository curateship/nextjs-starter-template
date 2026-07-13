import { randomBytes } from "node:crypto"

import { ExchangeClient } from "@nktkas/hyperliquid"
import { privateKeyToAccount } from "viem/accounts"

import { db, type CustomShellDb } from "@/server/db"
import { decryptPrivateKey } from "@/server/hyperliquid/keys"
import { allocateNonce } from "@/server/hyperliquid/nonce"
import { createHttpTransport } from "@/server/hyperliquid/transport"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import { tradingAuditLog, type TradingWallet } from "@/server/schema"
import { now, uuid } from "@/server/util"

/** Reserved cloid prefix for manual (non-bot) orders. */
export const MANUAL_CLOID_PREFIX = "ffffffff"

export type ExchangeActor = {
  actor: "user" | "bot" | "system"
  userId?: string | null
  botId?: string | null
}

export type PlaceOrderParams = {
  assetId: number
  coin: string
  isBuy: boolean
  px: string
  sz: string
  reduceOnly: boolean
  tif: "Gtc" | "Ioc" | "Alo" | "FrontendMarket"
  cloid?: `0x${string}`
}

export type OrderPlacementStatus =
  | { kind: "resting"; oid: number }
  | { kind: "filled"; oid: number; avgPx: string; totalSz: string }

export type BracketOrderParams = {
  entry: PlaceOrderParams
  takeProfit?: { triggerPx: string; cloid?: `0x${string}` }
  stopLoss?: { triggerPx: string; cloid?: `0x${string}` }
}

type ClientEntry = {
  client: ExchangeClient
  nonceRef: { last: number | null }
  keyVersion: number
}

const clientCache = new Map<string, ClientEntry>()

function getClientEntry(wallet: TradingWallet): ClientEntry {
  const cached = clientCache.get(wallet.id)
  if (cached && cached.keyVersion === wallet.keyVersion) {
    return cached
  }

  const network = wallet.network as TradingNetwork
  const account = privateKeyToAccount(
    decryptPrivateKey(wallet.encryptedPrivateKey) as `0x${string}`
  )
  const nonceRef: ClientEntry["nonceRef"] = { last: null }
  const client = new ExchangeClient({
    transport: createHttpTransport(network),
    wallet: account,
    nonceManager: async () => {
      const nonce = await allocateNonce(wallet.agentAddress, network)
      nonceRef.last = nonce
      return nonce
    },
    defaultVaultAddress: (wallet.vaultAddress as `0x${string}`) ?? undefined,
  })

  const entry: ClientEntry = { client, nonceRef, keyVersion: wallet.keyVersion }
  clientCache.set(wallet.id, entry)
  return entry
}

/** 128-bit client order id: 0x + prefix(8) + purpose(4) + random(20) hex. */
export function buildCloid(prefix: string, purposeHash = "0000"): `0x${string}` {
  const random = randomBytes(10).toString("hex")
  return `0x${prefix}${purposeHash}${random}` as `0x${string}`
}

export function cloidPrefixOf(cloid: string): string {
  return cloid.startsWith("0x") ? cloid.slice(2, 10) : cloid.slice(0, 8)
}

export async function placeOrder(
  wallet: TradingWallet,
  actor: ExchangeActor,
  params: PlaceOrderParams,
  database: CustomShellDb = db
): Promise<OrderPlacementStatus> {
  const entry = getClientEntry(wallet)
  const request = {
    coin: params.coin,
    isBuy: params.isBuy,
    px: params.px,
    sz: params.sz,
    reduceOnly: params.reduceOnly,
    tif: params.tif,
  }

  try {
    const response = await entry.client.order({
      orders: [
        {
          a: params.assetId,
          b: params.isBuy,
          p: params.px,
          s: params.sz,
          r: params.reduceOnly,
          t: { limit: { tif: params.tif } },
          ...(params.cloid ? { c: params.cloid } : {}),
        },
      ],
      grouping: "na",
    })

    const status = response.response.data.statuses[0]
    const result = parseOrderStatus(status)
    await writeAudit(database, wallet, actor, {
      actionType: "order.place",
      market: params.coin,
      nonce: entry.nonceRef.last,
      cloid: params.cloid ?? null,
      request,
      response: result,
      status: "ok",
    })
    return result
  } catch (error) {
    await writeAudit(database, wallet, actor, {
      actionType: "order.place",
      market: params.coin,
      nonce: entry.nonceRef.last,
      cloid: params.cloid ?? null,
      request,
      status: "error",
      errorMessage: scrubErrorMessage(error),
    })
    throw new Error(scrubErrorMessage(error))
  }
}

export async function placeBracketOrder(
  wallet: TradingWallet,
  actor: ExchangeActor,
  params: BracketOrderParams,
  database: CustomShellDb = db
): Promise<OrderPlacementStatus> {
  const entry = getClientEntry(wallet)
  const children = [
    ...(params.takeProfit
      ? [{ ...params.takeProfit, tpsl: "tp" as const }]
      : []),
    ...(params.stopLoss ? [{ ...params.stopLoss, tpsl: "sl" as const }] : []),
  ]
  const requests = [
    {
      coin: params.entry.coin,
      isBuy: params.entry.isBuy,
      px: params.entry.px,
      sz: params.entry.sz,
      reduceOnly: params.entry.reduceOnly,
      tif: params.entry.tif,
    },
    ...children.map((child) => ({
      coin: params.entry.coin,
      isBuy: !params.entry.isBuy,
      px: child.triggerPx,
      sz: params.entry.sz,
      reduceOnly: true,
      triggerPx: child.triggerPx,
      tpsl: child.tpsl,
    })),
  ]
  const cloids = [params.entry.cloid, ...children.map((child) => child.cloid)]

  let statuses: unknown[]
  try {
    const response = await entry.client.order({
      orders: [
        {
          a: params.entry.assetId,
          b: params.entry.isBuy,
          p: params.entry.px,
          s: params.entry.sz,
          r: params.entry.reduceOnly,
          t: { limit: { tif: params.entry.tif } },
          ...(params.entry.cloid ? { c: params.entry.cloid } : {}),
        },
        ...children.map((child) => ({
          a: params.entry.assetId,
          b: !params.entry.isBuy,
          p: child.triggerPx,
          s: params.entry.sz,
          r: true,
          t: {
            trigger: {
              isMarket: true,
              triggerPx: child.triggerPx,
              tpsl: child.tpsl,
            },
          },
          ...(child.cloid ? { c: child.cloid } : {}),
        })),
      ],
      grouping: "normalTpsl",
    })
    statuses = response.response.data.statuses
  } catch (error) {
    const errorMessage = scrubErrorMessage(error)
    await Promise.all(
      requests.map((request, index) =>
        writeAudit(database, wallet, actor, {
          actionType: "order.place",
          market: params.entry.coin,
          nonce: entry.nonceRef.last,
          cloid: cloids[index] ?? null,
          request,
          status: "error",
          errorMessage,
        })
      )
    )
    throw new Error(errorMessage)
  }

  await Promise.all(
    requests.map((request, index) => {
      const legStatus = statuses[index]
      const succeeded = isOrderStatusSuccess(legStatus)
      return writeAudit(database, wallet, actor, {
        actionType: "order.place",
        market: params.entry.coin,
        nonce: entry.nonceRef.last,
        cloid: cloids[index] ?? null,
        request,
        response: { status: legStatus ?? null },
        status: succeeded ? "ok" : "error",
        errorMessage: succeeded ? null : "Exchange rejected this bracket leg",
      })
    })
  )

  return parseBracketOrderStatuses(statuses, requests.length)
}

export async function cancelOrder(
  wallet: TradingWallet,
  actor: ExchangeActor,
  params: { assetId: number; coin: string; oid: number },
  database: CustomShellDb = db
): Promise<void> {
  const entry = getClientEntry(wallet)
  const request = { coin: params.coin, oid: params.oid }

  try {
    await entry.client.cancel({
      cancels: [{ a: params.assetId, o: params.oid }],
    })
    await writeAudit(database, wallet, actor, {
      actionType: "order.cancel",
      market: params.coin,
      nonce: entry.nonceRef.last,
      request,
      status: "ok",
    })
  } catch (error) {
    await writeAudit(database, wallet, actor, {
      actionType: "order.cancel",
      market: params.coin,
      nonce: entry.nonceRef.last,
      request,
      status: "error",
      errorMessage: scrubErrorMessage(error),
    })
    throw new Error(scrubErrorMessage(error))
  }
}

export async function cancelOrderByCloid(
  wallet: TradingWallet,
  actor: ExchangeActor,
  params: { assetId: number; coin: string; cloid: `0x${string}` },
  database: CustomShellDb = db
): Promise<void> {
  const entry = getClientEntry(wallet)
  const request = { coin: params.coin, cloid: params.cloid }

  try {
    await entry.client.cancelByCloid({
      cancels: [{ asset: params.assetId, cloid: params.cloid }],
    })
    await writeAudit(database, wallet, actor, {
      actionType: "order.cancel",
      market: params.coin,
      nonce: entry.nonceRef.last,
      cloid: params.cloid,
      request,
      status: "ok",
    })
  } catch (error) {
    await writeAudit(database, wallet, actor, {
      actionType: "order.cancel",
      market: params.coin,
      nonce: entry.nonceRef.last,
      cloid: params.cloid,
      request,
      status: "error",
      errorMessage: scrubErrorMessage(error),
    })
    throw new Error(scrubErrorMessage(error))
  }
}

export async function modifyOrder(
  wallet: TradingWallet,
  actor: ExchangeActor,
  params: { oid: number | `0x${string}`; order: PlaceOrderParams },
  database: CustomShellDb = db
): Promise<void> {
  const entry = getClientEntry(wallet)
  const request = {
    oid: params.oid,
    coin: params.order.coin,
    px: params.order.px,
    sz: params.order.sz,
    tif: params.order.tif,
  }

  try {
    await entry.client.modify({
      oid: params.oid,
      order: {
        a: params.order.assetId,
        b: params.order.isBuy,
        p: params.order.px,
        s: params.order.sz,
        r: params.order.reduceOnly,
        t: { limit: { tif: params.order.tif } },
        ...(params.order.cloid ? { c: params.order.cloid } : {}),
      },
    })
    await writeAudit(database, wallet, actor, {
      actionType: "order.modify",
      market: params.order.coin,
      nonce: entry.nonceRef.last,
      cloid: params.order.cloid ?? null,
      request,
      status: "ok",
    })
  } catch (error) {
    await writeAudit(database, wallet, actor, {
      actionType: "order.modify",
      market: params.order.coin,
      nonce: entry.nonceRef.last,
      cloid: params.order.cloid ?? null,
      request,
      status: "error",
      errorMessage: scrubErrorMessage(error),
    })
    throw new Error(scrubErrorMessage(error))
  }
}

export async function updateLeverage(
  wallet: TradingWallet,
  actor: ExchangeActor,
  params: { assetId: number; coin: string; leverage: number; isCross: boolean },
  database: CustomShellDb = db
): Promise<void> {
  const entry = getClientEntry(wallet)
  const request = {
    coin: params.coin,
    leverage: params.leverage,
    isCross: params.isCross,
  }

  try {
    await entry.client.updateLeverage({
      asset: params.assetId,
      isCross: params.isCross,
      leverage: params.leverage,
    })
    await writeAudit(database, wallet, actor, {
      actionType: "leverage.update",
      market: params.coin,
      nonce: entry.nonceRef.last,
      request,
      status: "ok",
    })
  } catch (error) {
    await writeAudit(database, wallet, actor, {
      actionType: "leverage.update",
      market: params.coin,
      nonce: entry.nonceRef.last,
      request,
      status: "error",
      errorMessage: scrubErrorMessage(error),
    })
    throw new Error(scrubErrorMessage(error))
  }
}

export async function writeRiskRejection(
  wallet: TradingWallet,
  actor: ExchangeActor,
  details: {
    actionType: string
    market: string
    request: Record<string, unknown>
    reason: string
  },
  database: CustomShellDb = db
): Promise<void> {
  await writeAudit(database, wallet, actor, {
    actionType: details.actionType,
    market: details.market,
    request: details.request,
    status: "rejected_risk",
    errorMessage: details.reason,
  })
}

export function parseBracketOrderStatuses(
  statuses: unknown[],
  expectedLegCount = 3
): OrderPlacementStatus {
  if (
    statuses.length !== expectedLegCount ||
    !statuses.every(isOrderStatusSuccess)
  ) {
    throw new Error(
      "The position may be open without full protection. Check open positions immediately."
    )
  }
  return parseOrderStatus(statuses[0])
}

function isOrderStatusSuccess(status: unknown): boolean {
  return Boolean(
    status &&
      typeof status === "object" &&
      ("resting" in status || "filled" in status)
  )
}

function parseOrderStatus(status: unknown): OrderPlacementStatus {
  if (status && typeof status === "object") {
    if ("resting" in status) {
      return {
        kind: "resting",
        oid: (status as { resting: { oid: number } }).resting.oid,
      }
    }
    if ("filled" in status) {
      const filled = (
        status as { filled: { oid: number; avgPx: string; totalSz: string } }
      ).filled
      return {
        kind: "filled",
        oid: filled.oid,
        avgPx: filled.avgPx,
        totalSz: filled.totalSz,
      }
    }
  }
  throw new Error(`Unexpected order status: ${JSON.stringify(status)}`)
}

async function writeAudit(
  database: CustomShellDb,
  wallet: TradingWallet,
  actor: ExchangeActor,
  details: {
    actionType: string
    market: string | null
    nonce?: number | null
    cloid?: string | null
    request: Record<string, unknown>
    response?: Record<string, unknown> | null
    status: "ok" | "error" | "rejected_risk"
    errorMessage?: string | null
  }
) {
  try {
    await database.insert(tradingAuditLog).values({
      id: uuid(),
      userId: actor.userId ?? null,
      walletId: wallet.id,
      botId: actor.botId ?? null,
      actor: actor.actor,
      actionType: details.actionType,
      network: wallet.network,
      market: details.market,
      nonce: details.nonce ?? null,
      cloid: details.cloid ?? null,
      request: details.request,
      response: details.response ?? null,
      status: details.status,
      errorMessage: details.errorMessage ?? null,
      createdAt: now(),
    })
  } catch (error) {
    // The audit trail must never take the trading path down with it.
    console.error("audit_log write failed", error)
  }
}

/**
 * SDK errors can echo request bodies and signatures. Truncate and strip
 * long hex strings — both 0x-prefixed (addresses, signatures) and bare
 * 64+-char runs (an un-prefixed private key) — before anything is persisted
 * or shown.
 */
export function scrubErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Exchange request failed"
  return message
    .replace(/0x[0-9a-fA-F]{40,}/g, "0x…")
    .replace(/\b[0-9a-fA-F]{64,}\b/g, "…")
    .slice(0, 400)
}
