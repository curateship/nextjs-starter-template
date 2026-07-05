import { db, type CustomShellDb } from "@/server/db"
import {
  buildCloid,
  cancelOrder,
  MANUAL_CLOID_PREFIX,
  modifyOrder,
  placeOrder,
  updateLeverage,
  writeRiskRejection,
  type OrderPlacementStatus,
} from "@/server/hyperliquid/exchange"
import { getAssetInfo, getInfoClient } from "@/server/hyperliquid/info"
import { roundPrice, roundSize } from "@/server/hyperliquid/rounding"
import { assertNetworkEnabled } from "@/server/hyperliquid/transport"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import {
  checkOrderIntent,
  describeViolations,
  type RiskLimits,
} from "@/server/risk/risk"
import { findUserWallet } from "@/server/wallets"
import type { TradingWallet } from "@/server/schema"

export type ManualOrderInput = {
  walletId: string
  market: string
  side: "buy" | "sell"
  orderType: "market" | "limit"
  /** Limit price (required for limit orders). */
  px?: string
  /** Size in base units. */
  sz: string
  reduceOnly: boolean
  tif: "Gtc" | "Ioc" | "Alo"
  /** Leverage currently applied for this market (for risk checks). */
  leverage: number
}

export type ManualOrderResult = {
  status: OrderPlacementStatus
  px: string
  sz: string
}

/** How far past the best opposing level a "market" IOC limit may sweep. */
const MARKET_SLIPPAGE_PCT = 3

export function getManualRiskLimits(maxAssetLeverage: number): RiskLimits {
  return {
    maxPositionNotionalUsd: readNumberEnv(
      "TRADING_MAX_POSITION_NOTIONAL_USD",
      100_000
    ),
    maxLeverage: Math.min(
      maxAssetLeverage,
      readNumberEnv("TRADING_MAX_LEVERAGE", 25)
    ),
    maxOpenOrders: readNumberEnv("TRADING_MAX_OPEN_ORDERS", 100),
  }
}

export async function submitManualOrder(
  userId: string,
  input: ManualOrderInput,
  database: CustomShellDb = db
): Promise<ManualOrderResult> {
  const wallet = await requireActiveWallet(userId, input.walletId, database)
  const network = wallet.network as TradingNetwork
  assertNetworkEnabled(network)

  const asset = await getAssetInfo(network, input.market)
  const info = getInfoClient(network)
  const accountAddress = (wallet.vaultAddress ??
    wallet.accountAddress) as `0x${string}`

  const [assetData, clearinghouse, openOrders] = await Promise.all([
    info.metaAndAssetCtxs(),
    info.clearinghouseState({ user: accountAddress }),
    info.openOrders({ user: accountAddress }),
  ])
  const priceObservedAt = Date.now()
  const ctx = assetData[1][asset.assetId]
  if (!ctx) {
    throw new Error(`No market data for ${input.market}`)
  }

  const markPx = ctx.markPx
  const executionPxRaw =
    input.orderType === "limit" && input.px
      ? input.px
      : applySlippage(markPx, input.side)
  const px = roundPrice(executionPxRaw, asset.szDecimals)
  const sz = roundSize(input.sz, asset.szDecimals)

  const position = clearinghouse.assetPositions.find(
    ({ position }) => position.coin === input.market
  )?.position
  // Prefer the on-exchange leverage over the client-supplied value so the
  // leverage risk check can't be bypassed by lying about it. Falls back to
  // the request only when flat (no position to read leverage from).
  const effectiveLeverage = position?.leverage.value ?? input.leverage
  const intent = {
    market: input.market,
    side: input.side,
    orderType: input.orderType,
    px: input.orderType === "limit" ? px : null,
    sz,
    reduceOnly: input.reduceOnly,
    leverage: effectiveLeverage,
  }
  const risk = checkOrderIntent(
    intent,
    {
      equity: clearinghouse.marginSummary.accountValue,
      positionSzi: position?.szi ?? "0",
      positionNotional: position?.positionValue ?? "0",
      openOrderCount: openOrders.length,
    },
    getManualRiskLimits(asset.maxLeverage),
    { markPx, priceTimestamp: priceObservedAt, now: Date.now() }
  )

  if (!risk.ok) {
    const reason = describeViolations(risk.violations)
    await writeRiskRejection(
      wallet,
      { actor: "user", userId },
      {
        actionType: "order.place",
        market: input.market,
        request: { ...intent },
        reason,
      },
      database
    )
    throw new Error(reason)
  }

  const status = await placeOrder(
    wallet,
    { actor: "user", userId },
    {
      assetId: asset.assetId,
      coin: input.market,
      isBuy: input.side === "buy",
      px,
      sz,
      reduceOnly: input.reduceOnly,
      tif: input.orderType === "market" ? "FrontendMarket" : input.tif,
      cloid: buildCloid(MANUAL_CLOID_PREFIX),
    },
    database
  )

  return { status, px, sz }
}

export type ModifyManualOrderInput = {
  walletId: string
  market: string
  oid: number
  side: "buy" | "sell"
  px: string
  sz: string
  reduceOnly: boolean
}

/** Re-prices a resting order (used by chart line dragging). */
export async function modifyManualOrder(
  userId: string,
  input: ModifyManualOrderInput,
  database: CustomShellDb = db
): Promise<{ px: string }> {
  const wallet = await requireActiveWallet(userId, input.walletId, database)
  const network = wallet.network as TradingNetwork
  assertNetworkEnabled(network)
  const asset = await getAssetInfo(network, input.market)

  const px = roundPrice(input.px, asset.szDecimals)
  const sz = roundSize(input.sz, asset.szDecimals)
  if (!(Number(px) > 0) || !(Number(sz) > 0)) {
    throw new Error("Invalid price or size")
  }

  // Sanity-check the new price against mark before signing.
  const [, assetCtxs] = await getInfoClient(network).metaAndAssetCtxs()
  const ctx = assetCtxs[asset.assetId]
  if (ctx) {
    const mark = Number(ctx.markPx)
    const deviationPct = (Math.abs(Number(px) - mark) / mark) * 100
    if (deviationPct > 20) {
      throw new Error(
        `New price is ${deviationPct.toFixed(1)}% away from mark; refusing to move the order that far.`
      )
    }
  }

  await modifyOrder(
    wallet,
    { actor: "user", userId },
    {
      oid: input.oid,
      order: {
        assetId: asset.assetId,
        coin: input.market,
        isBuy: input.side === "buy",
        px,
        sz,
        reduceOnly: input.reduceOnly,
        tif: "Gtc",
      },
    },
    database
  )
  return { px }
}

export async function cancelManualOrder(
  userId: string,
  input: { walletId: string; market: string; oid: number },
  database: CustomShellDb = db
): Promise<void> {
  const wallet = await requireActiveWallet(userId, input.walletId, database)
  const network = wallet.network as TradingNetwork
  assertNetworkEnabled(network)
  const asset = await getAssetInfo(network, input.market)

  await cancelOrder(
    wallet,
    { actor: "user", userId },
    { assetId: asset.assetId, coin: input.market, oid: input.oid },
    database
  )
}

export async function updateManualLeverage(
  userId: string,
  input: {
    walletId: string
    market: string
    leverage: number
    isCross: boolean
  },
  database: CustomShellDb = db
): Promise<void> {
  const wallet = await requireActiveWallet(userId, input.walletId, database)
  const network = wallet.network as TradingNetwork
  assertNetworkEnabled(network)
  const asset = await getAssetInfo(network, input.market)

  if (input.leverage < 1 || input.leverage > asset.maxLeverage) {
    throw new Error(
      `Leverage must be between 1x and ${asset.maxLeverage}x for ${input.market}.`
    )
  }

  await updateLeverage(
    wallet,
    { actor: "user", userId },
    {
      assetId: asset.assetId,
      coin: input.market,
      leverage: input.leverage,
      isCross: input.isCross,
    },
    database
  )
}

async function requireActiveWallet(
  userId: string,
  walletId: string,
  database: CustomShellDb
): Promise<TradingWallet> {
  const wallet = await findUserWallet(userId, walletId, database)
  if (!wallet) {
    throw new Error("Wallet not found")
  }
  if (!wallet.isActive) {
    throw new Error(`Wallet "${wallet.label}" is disabled.`)
  }
  return wallet
}

function applySlippage(markPx: string, side: "buy" | "sell"): string {
  const mark = Number(markPx)
  const factor =
    side === "buy" ? 1 + MARKET_SLIPPAGE_PCT / 100 : 1 - MARKET_SLIPPAGE_PCT / 100
  return String(mark * factor)
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}
