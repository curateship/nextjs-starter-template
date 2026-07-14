import { db, type CustomShellDb } from "@/server/db"
import { loadTradingAccountState } from "@/lib/hl/account-balance"
import {
  resolveOneClickEntryPrice,
  resolveTakeProfitPrice,
} from "@/lib/one-click-order"
import {
  BracketOrderError,
  buildCloid,
  cancelOrder,
  MANUAL_CLOID_PREFIX,
  modifyOrder,
  placeBracketOrder,
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
  type OrderIntent,
  type RiskLimits,
} from "@/server/risk/risk"
import { findUserWallet } from "@/server/wallets"
import type { TradingWallet } from "@/server/schema"
import { getOrderTemplate } from "@/server/order-templates"
import {
  assertMoveWithinMark,
  buildModifiedOrder,
} from "@/server/trading-order-modification"

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

export type OneClickOrderInput = {
  walletId: string
  market: string
  side: "buy" | "sell"
  templateId: string
  /** Exact chart price selected for a limit-entry template. */
  px?: string
}

export type OneClickOrderResult = ManualOrderResult & {
  entryOrderType: "market" | "limit"
  stopLossPx: string
  takeProfitPx: string
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

  const [assetData, accountState, openOrders] = await Promise.all([
    info.metaAndAssetCtxs({ dex: asset.dex }),
    loadTradingAccountState(info, accountAddress, asset),
    info.openOrders({ user: accountAddress, dex: asset.dex }),
  ])
  const clearinghouse = accountState.clearinghouseState
  const priceObservedAt = Date.now()
  const ctx = assetData[1][asset.assetIndex]
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
  } satisfies OrderIntent
  const risk = checkOrderIntent(
    intent,
    {
      equity: accountState.equity,
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

export async function submitOneClickOrder(
  userId: string,
  input: OneClickOrderInput,
  database: CustomShellDb = db
): Promise<OneClickOrderResult> {
  const [wallet, template] = await Promise.all([
    requireActiveWallet(userId, input.walletId, database),
    getOrderTemplate(userId, input.templateId, database),
  ])
  if (!template) throw new Error("Order template not found")

  const network = wallet.network as TradingNetwork
  assertNetworkEnabled(network)
  const asset = await getAssetInfo(network, input.market)
  const info = getInfoClient(network)
  const accountAddress = (wallet.vaultAddress ??
    wallet.accountAddress) as `0x${string}`
  const [assetData, accountState, openOrders] = await Promise.all([
    info.metaAndAssetCtxs({ dex: asset.dex }),
    loadTradingAccountState(info, accountAddress, asset),
    info.openOrders({ user: accountAddress, dex: asset.dex }),
  ])
  const clearinghouse = accountState.clearinghouseState
  const priceObservedAt = Date.now()
  const ctx = assetData[1][asset.assetIndex]
  if (!ctx) throw new Error(`No market data for ${input.market}`)

  const mark = Number(ctx.markPx)
  const equity = Number(accountState.equity)
  const orderSizePct = Number(template.orderSizePct)
  const stopLossPct = Number(template.stopLossPct)
  const takeProfitPct = Number(template.takeProfitPct)
  if (
    !Number.isFinite(mark) ||
    mark <= 0 ||
    !Number.isFinite(equity) ||
    equity <= 0
  ) {
    throw new Error("A current price and positive wallet equity are required")
  }

  const isBuy = input.side === "buy"
  const entryOrderType = template.useLimitOrder ? "limit" : "market"
  const requestedEntryPrice = resolveOneClickEntryPrice({
    markPrice: mark,
    useLimitOrder: template.useLimitOrder,
    limitPrice: input.px,
  })
  const executionPrice = template.useLimitOrder
    ? requestedEntryPrice
    : Number(applySlippage(ctx.markPx, input.side))
  const px = roundPrice(executionPrice, asset.szDecimals)
  const referencePrice = template.useLimitOrder ? Number(px) : mark
  const notional = equity * (orderSizePct / 100) * template.leverage
  const sz = roundSize(notional / referencePrice, asset.szDecimals)
  const stopLossPx = roundPrice(
    referencePrice * (isBuy ? 1 - stopLossPct / 100 : 1 + stopLossPct / 100),
    asset.szDecimals
  )
  const takeProfitPx = roundPrice(
    resolveTakeProfitPrice({
      entryPrice: referencePrice,
      currentPrice: mark,
      side: input.side,
      takeProfitPct,
    }),
    asset.szDecimals
  )

  const position = clearinghouse.assetPositions.find(
    ({ position }) => position.coin === input.market
  )?.position
  const intent = {
    market: input.market,
    side: input.side,
    orderType: entryOrderType,
    px: entryOrderType === "limit" ? px : null,
    sz,
    reduceOnly: false,
    leverage: template.leverage,
  } satisfies OrderIntent
  const risk = checkOrderIntent(
    intent,
    {
      equity: accountState.equity,
      positionSzi: position?.szi ?? "0",
      positionNotional: position?.positionValue ?? "0",
      openOrderCount: openOrders.length,
    },
    getManualRiskLimits(asset.maxLeverage),
    { markPx: ctx.markPx, priceTimestamp: priceObservedAt, now: Date.now() },
    3
  )
  if (!risk.ok) {
    const reason = describeViolations(risk.violations)
    await writeRiskRejection(
      wallet,
      { actor: "user", userId },
      {
        actionType: "order.place",
        market: input.market,
        request: intent,
        reason,
      },
      database
    )
    throw new Error(reason)
  }

  await updateManualLeverage(
    userId,
    {
      walletId: input.walletId,
      market: input.market,
      leverage: template.leverage,
      isCross: !asset.onlyIsolated,
    },
    database
  )
  const status = await placeBracketOrder(
    wallet,
    { actor: "user", userId },
    {
      entry: {
        assetId: asset.assetId,
        coin: input.market,
        isBuy,
        px,
        sz,
        reduceOnly: false,
        tif: template.useLimitOrder ? "Gtc" : "FrontendMarket",
        cloid: buildCloid(MANUAL_CLOID_PREFIX),
      },
      takeProfit: {
        triggerPx: takeProfitPx,
        cloid: buildCloid(MANUAL_CLOID_PREFIX),
      },
      stopLoss: {
        triggerPx: stopLossPx,
        cloid: buildCloid(MANUAL_CLOID_PREFIX),
      },
    },
    database
  ).catch((error: unknown) => {
    if (!(error instanceof BracketOrderError)) {
      throw error
    }

    if (error.entryStatus === "accepted") {
      throw new Error(
        "Entry order was accepted, but its stop-loss or take-profit was rejected. Check positions and open orders before retrying."
      )
    }
    if (error.entryStatus === "rejected") {
      throw new Error("Entry order was rejected. No position was opened.")
    }
    throw new Error(
      "Order status could not be confirmed. Check positions and open orders before retrying."
    )
  })

  return { status, px, sz, entryOrderType, stopLossPx, takeProfitPx }
}

export type ModifyManualOrderInput = {
  walletId: string
  market: string
  oid: number
  px: string
  sz?: string
}

/** Re-prices a resting order (used by chart line dragging). */
export async function modifyManualOrder(
  userId: string,
  input: ModifyManualOrderInput,
  database: CustomShellDb = db
): Promise<{ px: string; sz: string }> {
  const wallet = await requireActiveWallet(userId, input.walletId, database)
  const network = wallet.network as TradingNetwork
  assertNetworkEnabled(network)
  const asset = await getAssetInfo(network, input.market)
  const info = getInfoClient(network)
  const accountAddress = (wallet.vaultAddress ??
    wallet.accountAddress) as `0x${string}`

  const [assetData, openOrders] = await Promise.all([
    info.metaAndAssetCtxs({ dex: asset.dex }),
    info.frontendOpenOrders({ user: accountAddress, dex: asset.dex }),
  ])
  const order = openOrders.find(
    (candidate) =>
      candidate.oid === input.oid && candidate.coin === input.market
  )
  if (!order) throw new Error("Order is no longer open")

  const px = roundPrice(input.px, asset.szDecimals)
  const sz = roundSize(input.sz ?? order.sz, asset.szDecimals)
  if (!(Number(px) > 0) || !(Number(sz) > 0)) {
    throw new Error("Invalid price or size")
  }

  // Sanity-check the new price against mark before signing.
  const [, assetCtxs] = assetData
  const ctx = assetCtxs[asset.assetIndex]
  const mark = Number(ctx?.markPx)
  assertMoveWithinMark(px, mark, order.side === "B")

  if (input.sz) {
    const accountState = await loadTradingAccountState(
      info,
      accountAddress,
      asset
    )
    const position = accountState.clearinghouseState.assetPositions.find(
      ({ position }) => position.coin === input.market
    )?.position
    const intent = {
      market: input.market,
      side: order.side === "B" ? ("buy" as const) : ("sell" as const),
      orderType: "limit" as const,
      px,
      sz,
      reduceOnly: order.reduceOnly,
      leverage: position?.leverage.value ?? 1,
    } satisfies OrderIntent
    const risk = checkOrderIntent(
      intent,
      {
        equity: accountState.equity,
        positionSzi: position?.szi ?? "0",
        positionNotional: position?.positionValue ?? "0",
        openOrderCount: openOrders.length,
      },
      getManualRiskLimits(asset.maxLeverage),
      { markPx: String(mark), priceTimestamp: Date.now(), now: Date.now() },
      0
    )
    if (!risk.ok) {
      const reason = describeViolations(risk.violations)
      await writeRiskRejection(
        wallet,
        { actor: "user", userId },
        {
          actionType: "order.modify",
          market: input.market,
          request: intent,
          reason,
        },
        database
      )
      throw new Error(reason)
    }
  }

  const modifiedOrder = {
    ...buildModifiedOrder(asset.assetId, order, px),
    sz,
  }

  await modifyOrder(
    wallet,
    { actor: "user", userId },
    {
      oid: input.oid,
      order: modifiedOrder,
    },
    database
  )
  return { px, sz }
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
      isCross: asset.onlyIsolated ? false : input.isCross,
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
    side === "buy"
      ? 1 + MARKET_SLIPPAGE_PCT / 100
      : 1 - MARKET_SLIPPAGE_PCT / 100
  return String(mark * factor)
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}
