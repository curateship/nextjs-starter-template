import { z } from "zod"

import type {
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  WalletOpenOrder,
  WalletOrderFill,
  WalletOrderInfo,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import type { AsterMarginMode } from "@/lib/trade/aster-margin-mode"
import { num } from "@/lib/protocols/aster/translate"
import { snapToTick } from "@/lib/protocols/tick"
import {
  assertBracketValues,
  assertPlaceOrderValues,
  decimalString as decimal,
  orderCredential,
  rememberPromise,
} from "@/server/protocols/connector-helpers"
import {
  clearAsterAccountCache,
  fetchAsterPortfolio,
} from "@/server/protocols/aster/account"
import {
  asterPublic,
  asterSigned,
  parseAsterCredential,
  type AsterCredential,
} from "@/server/protocols/aster/client"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import { scrubbedMessage } from "@/server/protocols/scrub"
import {
  asterPortfolioNeedsRecovery,
  asterSnapshotRecoveryVersion,
  clearAsterUserSnapshots,
  markAsterSnapshotNeedsRecovery,
  primeAsterPortfolioSnapshot,
  readAsterPushedPortfolio,
  rememberAsterLeverage,
} from "@/server/protocols/aster/user-snapshot"
import {
  asterFillsFromStream,
  asterFillsRecoveryVersion,
  markAsterFillsRecovered,
} from "@/server/protocols/aster/user-stream"

const orderSchema = z.object({
  orderId: z.union([z.string(), z.number()]),
  symbol: z.string(),
  side: z.enum(["BUY", "SELL"]),
  type: z.string(),
  status: z.string().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  avgPrice: z.union([z.string(), z.number()]).optional(),
  stopPrice: z.union([z.string(), z.number()]).optional(),
  origQty: z.union([z.string(), z.number()]).optional(),
  executedQty: z.union([z.string(), z.number()]).optional(),
  reduceOnly: z.boolean().optional(),
  closePosition: z.boolean().optional(),
})

const fillSchema = z.object({
  id: z.union([z.string(), z.number()]),
  orderId: z.union([z.string(), z.number()]),
  symbol: z.string(),
  side: z.enum(["BUY", "SELL"]),
  price: z.union([z.string(), z.number()]),
  qty: z.union([z.string(), z.number()]),
  realizedPnl: z.union([z.string(), z.number()]).optional(),
  commission: z.union([z.string(), z.number()]).optional(),
  time: z.union([z.string(), z.number()]),
})

const positionSettingSchema = z.object({
  symbol: z.string(),
  marginType: z.string(),
  leverage: z.union([z.string(), z.number()]),
})

const multiAssetsModeSchema = z.object({
  multiAssetsMargin: z.boolean(),
})

const leverageCache = new Map<string, number>()
const marginModeCache = new Map<string, "cross" | "isolated">()
const accountMarginModeCache = new Map<
  string,
  { at: number; mode: AsterMarginMode }
>()
const accountMarginModeLoads = new Map<string, Promise<AsterMarginMode>>()
const knownSymbols = new Map<string, Set<string>>()
const portfolioCache = new Map<
  string,
  {
    at: number
    answer: Promise<WalletPortfolio>
    settled: boolean
    recoveryVersion: number
  }
>()
const MARKET_CAP = 0.03
const PRICE_BAND_SHARE = 0.95
const ACCOUNT_READ_GOOD_FOR_MS = 15_000
const ACCOUNT_MODE_GOOD_FOR_MS = 15_000

function account(orderAuth: OrderAuth): string {
  if (!orderAuth.accountAddress) throw new Error("LIVE_WALLET_KEY")
  return orderAuth.accountAddress
}

function remember(network: NetworkId, account: string, symbol: string): void {
  const key = `${network}:${account.toLowerCase()}`
  const held = knownSymbols.get(key) ?? new Set<string>()
  held.add(symbol)
  knownSymbols.set(key, held)
}

function readKey(
  network: NetworkId,
  accountAddress: string,
  credentialValue: AsterCredential
): string {
  return `${network}:${accountAddress.toLowerCase()}:${credentialValue.signer}`
}

function clearOrderReads(
  network: NetworkId,
  accountAddress: string,
  credentialValue: AsterCredential
): void {
  const key = readKey(network, accountAddress, credentialValue)
  portfolioCache.delete(key)
  clearAsterAccountCache()
  markAsterSnapshotNeedsRecovery(network, accountAddress)
}

async function signed(
  network: NetworkId,
  orderAuth: OrderAuth,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  weight: number,
  params: Record<string, string | number>
): Promise<unknown> {
  return asterSigned(
    network,
    account(orderAuth),
    orderCredential(orderAuth, parseAsterCredential),
    method,
    path,
    weight,
    params
  )
}

async function setLeverage(
  network: NetworkId,
  orderAuth: OrderAuth,
  symbol: string,
  leverage: number
): Promise<void> {
  const asked = Math.max(1, Math.round(leverage))
  const key = `${network}:${account(orderAuth).toLowerCase()}:${symbol}`
  if (leverageCache.get(key) === asked) return
  try {
    await signed(network, orderAuth, "POST", "/fapi/v3/leverage", 1, {
      symbol,
      leverage: asked,
    })
    leverageCache.set(key, asked)
    rememberAsterLeverage(network, account(orderAuth), symbol, asked)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `LIVE_LEVERAGE:Aster could not set ${symbol} to ${asked}x, so nothing was ordered. (${reason})`
    )
  }
}

async function setMarginMode(
  network: NetworkId,
  orderAuth: OrderAuth,
  symbol: string,
  mode: "cross" | "isolated"
): Promise<void> {
  const key = `${network}:${account(orderAuth).toLowerCase()}:${symbol}`
  if (marginModeCache.get(key) === mode) return
  try {
    await signed(network, orderAuth, "POST", "/fapi/v3/marginType", 1, {
      symbol,
      marginType: mode === "cross" ? "CROSSED" : "ISOLATED",
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (!reason.startsWith("ASTER_MARGIN_UNCHANGED:")) {
      throw new Error(
        `LIVE_MARGIN_MODE:Aster could not switch ${symbol} to ${mode} margin, so nothing was ordered. (${reason})`
      )
    }
  }
  marginModeCache.set(key, mode)
}

export async function readAsterAccountMarginMode(
  network: NetworkId,
  orderAuth: OrderAuth,
  fresh = false
): Promise<AsterMarginMode> {
  const key = `${network}:${account(orderAuth).toLowerCase()}`
  const cached = accountMarginModeCache.get(key)
  if (
    !fresh &&
    cached !== undefined &&
    Date.now() - cached.at < ACCOUNT_MODE_GOOD_FOR_MS
  )
    return cached.mode
  const held = accountMarginModeLoads.get(key)
  if (held) return held

  const load = (async () => {
    try {
      const answer = await signed(
        network,
        orderAuth,
        "GET",
        "/fapi/v3/multiAssetsMargin",
        30,
        {}
      )
      const parsed = multiAssetsModeSchema.safeParse(answer)
      if (!parsed.success)
        throw new Error("Aster returned an unreadable account mode.")
      const mode = parsed.data.multiAssetsMargin ? "cross" : "isolated"
      accountMarginModeCache.set(key, { at: Date.now(), mode })
      return mode
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(
        `LIVE_MARGIN_MODE:Aster could not read the futures account's margin mode. (${reason})`
      )
    }
  })()
  accountMarginModeLoads.set(key, load)
  try {
    return await load
  } finally {
    if (accountMarginModeLoads.get(key) === load)
      accountMarginModeLoads.delete(key)
  }
}

export async function changeAsterAccountMarginMode(
  network: NetworkId,
  orderAuth: OrderAuth,
  mode: AsterMarginMode,
  fresh = false
): Promise<void> {
  if ((await readAsterAccountMarginMode(network, orderAuth, fresh)) === mode)
    return
  try {
    await signed(network, orderAuth, "POST", "/fapi/v3/multiAssetsMargin", 1, {
      multiAssetsMargin: mode === "cross" ? "true" : "false",
    })
    const key = `${network}:${account(orderAuth).toLowerCase()}`
    accountMarginModeCache.set(key, { at: Date.now(), mode })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `LIVE_MARGIN_MODE:Aster could not switch the futures account to ${mode === "cross" ? "Multi-Assets" : "Single-Asset"} Mode. (${reason})`
    )
  }
}

async function currentOrderSettings(
  network: NetworkId,
  orderAuth: OrderAuth,
  symbol: string
): Promise<{ marginMode: "cross" | "isolated"; leverage: number }> {
  let answer: unknown
  try {
    answer = await signed(
      network,
      orderAuth,
      "GET",
      "/fapi/v3/positionRisk",
      5,
      { symbol }
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `LIVE_ORDER_SETTINGS:Aster could not confirm ${symbol}'s margin and leverage, so nothing was ordered. (${reason})`
    )
  }
  const rows = z.array(z.unknown()).safeParse(answer)
  const parsed = rows.success
    ? rows.data
        .map((row) => positionSettingSchema.safeParse(row))
        .find((row) => row.success && row.data.symbol === symbol)
    : null
  if (!parsed?.success) {
    throw new Error(
      `LIVE_ORDER_SETTINGS:Aster did not return ${symbol}'s margin and leverage, so nothing was ordered.`
    )
  }
  const leverage = num(parsed.data.leverage)
  const marginMode = parsed.data.marginType.toLowerCase()
  if (
    leverage === null ||
    !Number.isInteger(leverage) ||
    leverage < 1 ||
    (marginMode !== "cross" && marginMode !== "isolated")
  ) {
    throw new Error(
      `LIVE_ORDER_SETTINGS:Aster returned unreadable ${symbol} settings, so nothing was ordered.`
    )
  }
  return { marginMode, leverage }
}

async function orderById(
  network: NetworkId,
  orderAuth: OrderAuth,
  symbol: string,
  orderId: string
) {
  const answer = await signed(network, orderAuth, "GET", "/fapi/v3/order", 1, {
    symbol,
    orderId,
  })
  const parsed = orderSchema.safeParse(answer)
  return parsed.success ? parsed.data : null
}

async function placeRaw(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: Record<string, string | number>
) {
  const answer = await signed(
    network,
    orderAuth,
    "POST",
    "/fapi/v3/order",
    1,
    params
  )
  const parsed = orderSchema.safeParse(answer)
  if (!parsed.success) throw new Error("LIVE_UNREADABLE")
  clearOrderReads(
    network,
    account(orderAuth),
    orderCredential(orderAuth, parseAsterCredential)
  )
  return parsed.data
}

function protectionParams(input: {
  marketId: string
  long: boolean
  kind: "stop" | "target"
  triggerPx: number
  size: number | null
}): Record<string, string | number> {
  return {
    symbol: input.marketId,
    side: input.long ? "SELL" : "BUY",
    type: input.kind === "stop" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET",
    stopPrice: decimal(input.triggerPx),
    workingType: "MARK_PRICE",
    ...(input.size === null
      ? { closePosition: "true" }
      : {
          quantity: decimal(input.size, { errorCode: "LIVE_SIZE" }),
          reduceOnly: "true",
        }),
  }
}

function immediateLimitPrice(input: {
  mark: number
  side: "buy" | "sell"
  priceTick: number | null
  priceMultiplierUp: number | null
  priceMultiplierDown: number | null
}): number {
  const fixedCap =
    input.mark * (input.side === "buy" ? 1 + MARKET_CAP : 1 - MARKET_CAP)
  const bandCap =
    input.side === "buy" &&
    input.priceMultiplierUp !== null &&
    input.priceMultiplierUp > 1
      ? input.mark * (1 + (input.priceMultiplierUp - 1) * PRICE_BAND_SHARE)
      : input.side === "sell" &&
          input.priceMultiplierDown !== null &&
          input.priceMultiplierDown > 0 &&
          input.priceMultiplierDown < 1
        ? input.mark * (1 - (1 - input.priceMultiplierDown) * PRICE_BAND_SHARE)
        : fixedCap
  return snapToTick(
    input.side === "buy"
      ? Math.min(fixedCap, bandCap)
      : Math.max(fixedCap, bandCap),
    input.priceTick
  )
}

/**
 * Sets the leverage on a market whose position is already open.
 *
 * The same command placement uses, exposed on its own. **Aster refuses to
 * LOWER isolated leverage while a position is open** and says so with its own
 * code, which `refusals.ts` already turns into a sentence — that refusal is
 * the venue's rule and not something this app can work around. Raising it is
 * allowed.
 *
 * The leverage cache is cleared first, because a hand-set leverage has to
 * reach the exchange even when it matches what the cache last saw: the cache
 * exists to save a call before an order, and here the call IS the point.
 */
export async function setAsterLeverage(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; leverage: number }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  leverageCache.delete(
    `${network}:${account(orderAuth).toLowerCase()}:${params.marketId}`
  )
  await setLeverage(network, orderAuth, params.marketId, params.leverage)
  clearOrderReads(
    network,
    account(orderAuth),
    orderCredential(orderAuth, parseAsterCredential)
  )
}

export async function adjustAsterMargin(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; szi: number; dollars: number }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  if (params.szi === 0) throw new Error("LIVE_POSITION_GONE")
  if (!Number.isFinite(params.dollars) || params.dollars === 0) {
    throw new Error("LIVE_MARGIN_NOTHING")
  }
  await signed(network, orderAuth, "POST", "/fapi/v3/positionMargin", 1, {
    symbol: params.marketId,
    amount: decimal(Math.abs(params.dollars)),
    type: params.dollars > 0 ? 1 : 2,
  })
  clearOrderReads(
    network,
    account(orderAuth),
    orderCredential(orderAuth, parseAsterCredential)
  )
}

export async function placeAsterOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  await assertRealMoneyAllowed(network)
  assertPlaceOrderValues(params)
  if (!params.reduceOnly && params.marginMode != null) {
    await changeAsterAccountMarginMode(network, orderAuth, params.marginMode)
  }
  const settings =
    !params.reduceOnly &&
    (params.marginMode != null || params.leverage !== null)
      ? await currentOrderSettings(network, orderAuth, params.marketId)
      : null
  if (
    params.marginMode !== null &&
    params.marginMode !== undefined &&
    !params.reduceOnly &&
    settings?.marginMode !== params.marginMode
  ) {
    await setMarginMode(network, orderAuth, params.marketId, params.marginMode)
  }
  if (
    params.leverage !== null &&
    !params.reduceOnly &&
    settings?.leverage !== Math.max(1, Math.round(params.leverage))
  ) {
    await setLeverage(network, orderAuth, params.marketId, params.leverage)
  }
  remember(network, account(orderAuth), params.marketId)

  const market = params.kind === "market"
  const orderPx = market
    ? immediateLimitPrice({
        mark: params.px,
        side: params.side,
        priceTick: params.priceTick ?? null,
        priceMultiplierUp: params.priceMultiplierUp ?? null,
        priceMultiplierDown: params.priceMultiplierDown ?? null,
      })
    : params.px
  const placed = await placeRaw(network, orderAuth, {
    symbol: params.marketId,
    side: params.side.toUpperCase(),
    type: "LIMIT",
    quantity: decimal(params.sz, { errorCode: "LIVE_SIZE" }),
    reduceOnly: String(params.reduceOnly),
    price: decimal(orderPx),
    timeInForce: params.kind === "postOnly" ? "GTX" : market ? "IOC" : "GTC",
  })

  const orderId = String(placed.orderId)
  let protection: PlaceOrderOutcome["protection"] = null
  let protectionNote: string | null = null
  if (params.tpPx !== null || params.slPx !== null) {
    const failures: string[] = []
    for (const kind of ["stop", "target"] as const) {
      const triggerPx = kind === "stop" ? params.slPx : params.tpPx
      if (triggerPx === null) continue
      try {
        await placeRaw(
          network,
          orderAuth,
          protectionParams({
            marketId: params.marketId,
            long: params.side === "buy",
            kind,
            triggerPx,
            size: null,
          })
        )
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    protection = failures.length === 0 ? "ok" : "partial"
    protectionNote =
      failures.length === 0
        ? null
        : `The entry was placed, but Aster refused part of its protection (${failures.join("; ")}). Check the position now.`
  }

  const final =
    market || placed.status === "FILLED"
      ? await orderById(network, orderAuth, params.marketId, orderId).catch(
          () => placed
        )
      : placed
  const filledSz = num(final?.executedQty) ?? 0
  const avgPx = num(final?.avgPrice)
  const filled = final?.status === "FILLED" || (market && filledSz > 0)
  // A poll can start after Aster accepts the order but before Aster confirms
  // its fill. Invalidate again at confirmation so that older read cannot put
  // the pre-fill snapshot back in front of the action's immediate refresh.
  if (filled) {
    clearOrderReads(
      network,
      account(orderAuth),
      orderCredential(orderAuth, parseAsterCredential)
    )
  }
  return {
    status: filled ? "filled" : "resting",
    orderId,
    avgPx: filled ? avgPx : null,
    filledSz: filled ? filledSz : null,
    protection,
    protectionNote,
  }
}

export async function cancelAsterOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  await signed(network, orderAuth, "DELETE", "/fapi/v3/order", 1, {
    symbol: params.marketId,
    orderId: params.orderId,
  })
  clearOrderReads(
    network,
    account(orderAuth),
    orderCredential(orderAuth, parseAsterCredential)
  )
}

export async function modifyAsterOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: {
    marketId: string
    orderId: string
    side: "buy" | "sell"
    px: number
    sz: number
    reduceOnly: boolean
  }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  try {
    await signed(network, orderAuth, "PUT", "/fapi/v3/order", 1, {
      symbol: params.marketId,
      orderId: params.orderId,
      quantity: decimal(params.sz, { errorCode: "LIVE_SIZE" }),
      price: decimal(params.px),
    })
    clearOrderReads(
      network,
      account(orderAuth),
      orderCredential(orderAuth, parseAsterCredential)
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith("ASTER_ORDER_GONE:")) {
      throw new Error(
        "LIVE_ORDER_GONE:That order filled or was cancelled while it was being moved."
      )
    }
    throw error
  }
}

async function openOrders(
  network: NetworkId,
  account: string,
  credentialValue: AsterCredential,
  symbol?: string
) {
  const answer = await asterSigned(
    network,
    account,
    credentialValue,
    "GET",
    "/fapi/v3/openOrders",
    symbol ? 1 : 40,
    symbol ? { symbol } : {}
  )
  const rows = z.array(z.unknown()).safeParse(answer)
  if (!rows.success) throw new Error("LIVE_UNREADABLE")
  return rows.data.map((raw) => {
    const parsed = orderSchema.safeParse(raw)
    if (!parsed.success) throw new Error("LIVE_UNREADABLE")
    return parsed.data
  })
}

function attachOrders(
  base: WalletPortfolio,
  rows: Awaited<ReturnType<typeof openOrders>>
): WalletPortfolio {
  const positions = base.positions.map((position) => ({
    ...position,
    protectionOrderIds: [...position.protectionOrderIds],
  }))
  const orders: WalletOpenOrder[] = []
  // Oldest first, so a position carrying more than one stop names the same one
  // on every read instead of flipping between them.
  const oldestFirst = [...rows].sort((left, right) =>
    String(left.orderId).localeCompare(String(right.orderId), undefined, {
      numeric: true,
    })
  )
  for (const row of oldestFirst) {
    const type = row.type.toUpperCase()
    const target = type === "TAKE_PROFIT_MARKET"
    const stop = type === "STOP_MARKET"
    if (target || stop) {
      const position = positions.find((one) => one.marketId === row.symbol)
      if (!position) continue
      const triggerPx = num(row.stopPrice)
      if (triggerPx === null) throw new Error("LIVE_UNREADABLE")
      // Every leg is counted, even the ones that do not become the position's
      // own stop or target, because `setBrackets` has to cancel all of them.
      position.protectionOrderIds.push(String(row.orderId))
      if (target) {
        position.targets.push({
          px: triggerPx,
          sz: row.closePosition ? null : num(row.origQty),
          orderId: String(row.orderId),
        })
      } else if (stop && position.slPx === null) {
        position.slPx = triggerPx
        position.slOrderId = String(row.orderId)
      }
      continue
    }
    const px = num(row.price)
    const sz = num(row.origQty)
    if (px === null || sz === null) throw new Error("LIVE_UNREADABLE")
    orders.push({
      orderId: String(row.orderId),
      marketId: row.symbol,
      side: row.side === "BUY" ? "buy" : "sell",
      px,
      sz,
      reduceOnly: row.reduceOnly ?? false,
      trigger: false,
    })
  }
  for (const position of positions) {
    position.targets.sort((left, right) => left.px - right.px)
    const first = position.targets[0] ?? null
    position.tpPx = first?.px ?? null
    position.tpSz = first?.sz ?? null
    position.tpOrderId = first?.orderId ?? null
  }
  return { positions, orders }
}

export async function fetchAsterOrderPortfolio(
  network: NetworkId,
  address: string,
  credentialFn: () => string | null
): Promise<WalletPortfolio> {
  const blob = credentialFn()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parseAsterCredential(blob)
  const pushed = readAsterPushedPortfolio(network, address)
  if (pushed) return pushed
  const key = readKey(network, address, parsed)
  const recoveryVersion = asterSnapshotRecoveryVersion(network, address)
  const cached = portfolioCache.get(key)
  if (
    cached &&
    ((!cached.settled && cached.recoveryVersion === recoveryVersion) ||
      (!asterPortfolioNeedsRecovery(network, address) &&
        Date.now() - cached.at < ACCOUNT_READ_GOOD_FOR_MS))
  ) {
    return cached.answer
  }
  const at = Date.now()
  const answer = Promise.all([
    fetchAsterPortfolio(network, address, () => blob),
    openOrders(network, address, parsed),
  ]).then(([base, rows]) => {
    for (const row of rows) remember(network, address, row.symbol)
    for (const row of base.positions) remember(network, address, row.marketId)
    const portfolio = attachOrders(base, rows)
    primeAsterPortfolioSnapshot(network, address, portfolio, recoveryVersion)
    return portfolio
  })
  const held = { at, answer, settled: false, recoveryVersion }
  rememberPromise(portfolioCache, key, held)
  answer.then(
    () => {
      held.settled = true
    },
    () => {}
  )
  return answer
}

export async function closeAsterPosition(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: {
    marketId: string
    szi: number
    priceTick?: number | null
    priceMultiplierUp?: number | null
    priceMultiplierDown?: number | null
  }
): Promise<{ avgPx: number | null; filledSz: number | null }> {
  await assertRealMoneyAllowed(network)
  const markAnswer = (await asterPublic(network, "/fapi/v3/premiumIndex", 1, {
    symbol: params.marketId,
  })) as { markPrice?: unknown }
  const mark = num(markAnswer.markPrice)
  if (mark === null || !(mark > 0)) throw new Error("LIVE_NO_PRICE")
  const side = params.szi > 0 ? "sell" : "buy"
  const placed = await placeRaw(network, orderAuth, {
    symbol: params.marketId,
    side: side.toUpperCase(),
    type: "LIMIT",
    quantity: decimal(Math.abs(params.szi), { errorCode: "LIVE_SIZE" }),
    reduceOnly: "true",
    price: decimal(
      immediateLimitPrice({
        mark,
        side,
        priceTick: params.priceTick ?? null,
        priceMultiplierUp: params.priceMultiplierUp ?? null,
        priceMultiplierDown: params.priceMultiplierDown ?? null,
      })
    ),
    timeInForce: "IOC",
  })
  const orderId = String(placed.orderId)
  const final = await orderById(
    network,
    orderAuth,
    params.marketId,
    orderId
  ).catch(() => placed)
  const filledSz = num(final?.executedQty)
  const fullyClosed =
    filledSz !== null && filledSz + 1e-9 >= Math.abs(params.szi)
  if (fullyClosed) {
    const rows = await openOrders(
      network,
      account(orderAuth),
      orderCredential(orderAuth, parseAsterCredential),
      params.marketId
    )
    for (const row of rows) {
      if (!["STOP_MARKET", "TAKE_PROFIT_MARKET"].includes(row.type)) continue
      await cancelAsterOrder(network, orderAuth, {
        marketId: params.marketId,
        orderId: String(row.orderId),
      })
    }
  }
  return {
    avgPx: num(final?.avgPrice),
    filledSz,
  }
}

export async function setAsterBrackets(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: {
    marketId: string
    position: Pick<WalletPosition, "szi" | "protectionOrderIds">
    targets: Array<{ px: number; sz: number | null }>
    slPx: number | null
    slSz: number | null
  }
): Promise<{ slOrderId: string | null }> {
  await assertRealMoneyAllowed(network)
  assertBracketValues(params)
  const oldIds = [...new Set(params.position.protectionOrderIds)]
  const long = params.position.szi > 0
  const size = Math.abs(params.position.szi)
  const legs = [
    ...(params.slPx !== null
      ? [
          {
            label: `stop at ${params.slPx}`,
            sl: true,
            // A null size is `closePosition`, which sells whatever is held
            // when it fires — the whole-position stop. A number is a fixed
            // `quantity` with `reduceOnly`, the same shape a sized target
            // already uses, so it sells that many coins and no more.
            order: protectionParams({
              marketId: params.marketId,
              long,
              kind: "stop" as const,
              triggerPx: params.slPx,
              size: params.slSz,
            }),
          },
        ]
      : []),
    ...params.targets.map((target) => ({
      label: `target at ${target.px}`,
      sl: false,
      order: protectionParams({
        marketId: params.marketId,
        long,
        kind: "target" as const,
        triggerPx: target.px,
        size: target.sz ?? size,
      }),
    })),
  ]

  const landed: string[] = []
  let slOrderId: string | null = null
  for (const leg of legs) {
    try {
      const placed = await placeRaw(network, orderAuth, leg.order)
      if (leg.sl) slOrderId = String(placed.orderId)
      landed.push(leg.label)
    } catch (error) {
      throw new Error(
        `LIVE_BRACKET_REPLACE_PARTIAL:The old protection is still on.${landed.length > 0 ? ` The new ${landed.join(" and ")} also went on.` : ""} The new ${leg.label} was refused: ${scrubbedMessage(error)}`
      )
    }
  }

  for (const orderId of oldIds) {
    try {
      await cancelAsterOrder(network, orderAuth, {
        marketId: params.marketId,
        orderId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.startsWith("ASTER_ORDER_GONE:")) continue
      throw new Error(
        `LIVE_BRACKET_REPLACE_DOUBLED:${landed.length > 0 ? `The new ${landed.join(" and ")} is on, but` : "Nothing new was requested, and"} an old protection order could not be cancelled: ${scrubbedMessage(error)}`
      )
    }
  }
  if (oldIds.length > 0) {
    const stillOpen = await openOrders(
      network,
      account(orderAuth),
      orderCredential(orderAuth, parseAsterCredential),
      params.marketId
    )
    const still = stillOpen.filter((row) =>
      oldIds.includes(String(row.orderId))
    )
    if (still.length > 0) {
      throw new Error(
        `LIVE_BRACKET_REPLACE_DOUBLED:${landed.length > 0 ? `The new ${landed.join(" and ")} is on, but` : "Nothing new was requested, and"} ${still.length} old protection ${still.length === 1 ? "order is" : "orders are"} still on Aster.`
      )
    }
  }
  return { slOrderId }
}

export async function fetchAsterOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  credentialFn: () => string | null
): Promise<WalletOrderFill[]> {
  const pushed = asterFillsFromStream(network, address, since, credentialFn)
  if (pushed) return pushed

  const blob = credentialFn()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parseAsterCredential(blob)
  const symbols = knownSymbols.get(`${network}:${address.toLowerCase()}`)
  const recoveryVersion = asterFillsRecoveryVersion(network, address)
  if (!symbols || symbols.size === 0) {
    markAsterFillsRecovered(network, address, since, [], recoveryVersion)
    return []
  }
  const answers = await Promise.all(
    [...symbols].map((symbol) =>
      asterSigned(network, address, parsed, "GET", "/fapi/v3/userTrades", 5, {
        symbol,
        ...(since > 0 ? { startTime: since } : {}),
      })
    )
  )
  const fills: WalletOrderFill[] = []
  for (const answer of answers) {
    const rows = z.array(z.unknown()).safeParse(answer)
    if (!rows.success) throw new Error("LIVE_UNREADABLE")
    for (const raw of rows.data) {
      const parsedFill = fillSchema.safeParse(raw)
      if (!parsedFill.success) throw new Error("LIVE_UNREADABLE")
      const row = parsedFill.data
      const px = num(row.price)
      const sz = num(row.qty)
      const at = num(row.time)
      if (
        px === null ||
        !(px > 0) ||
        sz === null ||
        !(sz > 0) ||
        at === null ||
        at < 0
      ) {
        throw new Error("LIVE_UNREADABLE")
      }
      const pnl = num(row.realizedPnl) ?? 0
      fills.push({
        fillId: String(row.id),
        orderId: String(row.orderId),
        marketId: row.symbol,
        side: row.side === "BUY" ? "buy" : "sell",
        px,
        sz,
        at,
        closedPnl: pnl,
        fee: num(row.commission) ?? 0,
        dir:
          pnl === 0
            ? row.side === "BUY"
              ? "Open long"
              : "Open short"
            : row.side === "BUY"
              ? "Close short"
              : "Close long",
        liquidation: false,
      })
    }
  }
  fills.sort((a, b) => a.at - b.at)
  markAsterFillsRecovered(network, address, since, fills, recoveryVersion)
  return fills
}

export async function fetchAsterOrderInfo(
  network: NetworkId,
  address: string,
  orderId: string,
  marketId: string,
  credentialFn: () => string | null
): Promise<WalletOrderInfo> {
  const blob = credentialFn()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const answer = await asterSigned(
    network,
    address,
    parseAsterCredential(blob),
    "GET",
    "/fapi/v3/order",
    1,
    { symbol: marketId, orderId }
  )
  const parsed = orderSchema.safeParse(answer)
  if (!parsed.success) return { kind: "none", triggerPx: null }
  const type = parsed.data.type
  return {
    kind:
      type === "STOP_MARKET"
        ? "stop"
        : type === "TAKE_PROFIT_MARKET"
          ? "target"
          : "none",
    triggerPx: num(parsed.data.stopPrice),
  }
}

export function clearAsterOrderState(): void {
  leverageCache.clear()
  marginModeCache.clear()
  accountMarginModeCache.clear()
  accountMarginModeLoads.clear()
  knownSymbols.clear()
  portfolioCache.clear()
  clearAsterUserSnapshots()
}
