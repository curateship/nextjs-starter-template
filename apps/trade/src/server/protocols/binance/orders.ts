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
import {
  binanceSymbolFor,
  coinNameFor,
} from "@/lib/protocols/binance/translate"
import { num } from "@/lib/protocols/number"
import { rememberPromise } from "@/lib/protocols/promise-cache"
import { snapToTick } from "@/lib/protocols/tick"
import {
  binanceCredentialOf,
  clearBinanceAccountReads,
  fetchBinancePositions,
} from "@/server/protocols/binance/account"
import {
  binancePublic,
  binanceSigned,
  parseBinanceCredential,
  requireBinanceMainnet,
  type BinanceCredential,
  type BinancePriority,
} from "@/server/protocols/binance/client"
import { isOrderGone } from "@/server/protocols/binance/refusals"
import {
  binanceFillsFromStream,
  binanceFillsRecoveryVersion,
  binanceStopKindOf,
  binanceUserStreamState,
  markBinanceFillsRecovered,
} from "@/server/protocols/binance/user-stream"
import {
  assertBracketValues,
  assertPlaceOrderValues,
  decimalString as decimal,
  orderCredential,
} from "@/server/protocols/connector-helpers"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import { scrubbedMessage } from "@/server/protocols/scrub"

/**
 * Binance USDⓈ-M futures orders: place, cancel, move, close, leverage,
 * margin, stops and targets, and the reads that show them.
 *
 * **Two kinds of order id.** Plain orders live on `/fapi/v1/order`. Since
 * 9 Dec 2025 Binance keeps every stop and target on a separate stop-order
 * service (`/fapi/v1/algoOrder`) with ids of its own, and refuses them on
 * the plain path with -4120. The two id ranges are not kept apart by
 * Binance, so a stop's id is written here as `algo:<id>` and every call that
 * takes an id reads the prefix to know which service to ask.
 *
 * **Market orders are capped.** Trade never sends Binance a MARKET order.
 * An immediate order is a LIMIT at no worse than 3% through the price,
 * cancelled at once if it cannot fill (IOC), and kept inside the market's own
 * price band.
 *
 * Every call that could move money passes both real-money switches first.
 */

const ALGO = "algo:"
const MARKET_CAP = 0.03
const PRICE_BAND_SHARE = 0.95
const PORTFOLIO_GOOD_FOR_MS = 15_000
/** Binance answers fills in windows of at most seven days. */
const FILL_WINDOW_MS = 7 * 24 * 60 * 60_000
/** Binance's own shape for a client order id. */
const CLIENT_ID = /^[.A-Z:/a-z0-9_-]{1,36}$/

const decimalField = z.union([z.string(), z.number()])

const orderSchema = z.object({
  orderId: z.union([z.string(), z.number()]),
  symbol: z.string(),
  side: z.enum(["BUY", "SELL"]),
  type: z.string(),
  origType: z.string().optional(),
  status: z.string().optional(),
  price: decimalField.optional(),
  avgPrice: decimalField.optional(),
  stopPrice: decimalField.optional(),
  origQty: decimalField.optional(),
  executedQty: decimalField.optional(),
  reduceOnly: z.boolean().optional(),
  time: decimalField.optional(),
  updateTime: decimalField.optional(),
})

const algoSchema = z.object({
  algoId: z.union([z.string(), z.number()]),
  symbol: z.string(),
  side: z.enum(["BUY", "SELL"]),
  orderType: z.string(),
  algoStatus: z.string().optional(),
  triggerPrice: decimalField.optional(),
  quantity: decimalField.optional(),
  closePosition: z.boolean().optional(),
  actualOrderId: z.union([z.string(), z.number()]).optional(),
})

const fillSchema = z.object({
  id: z.union([z.string(), z.number()]),
  orderId: z.union([z.string(), z.number()]),
  symbol: z.string(),
  side: z.enum(["BUY", "SELL"]),
  price: decimalField,
  qty: decimalField,
  realizedPnl: decimalField.optional(),
  commission: decimalField.optional(),
  time: decimalField,
})

type PlainOrder = z.infer<typeof orderSchema>
type AlgoOrder = z.infer<typeof algoSchema>

const leverageCache = new Map<string, number>()
const knownSymbols = new Map<string, Set<string>>()
/** When each key's traded coins were last asked for, and from when. */
const discovered = new Map<string, { at: number; from: number }>()
const DISCOVER_EVERY_MS = 60_000
const portfolioCache = new Map<
  string,
  { at: number; answer: Promise<WalletPortfolio> }
>()

function symbolOf(marketId: string): string {
  const symbol = binanceSymbolFor(marketId)
  if (!symbol) throw new Error("BINANCE_MARKET_UNKNOWN")
  return symbol
}

function marketOf(symbol: string): string {
  const coin = coinNameFor(symbol)
  if (!coin) throw new Error("LIVE_UNREADABLE")
  return coin
}

function credentialOf(orderAuth: OrderAuth): BinanceCredential {
  return orderCredential(orderAuth, parseBinanceCredential)
}

function remember(credential: BinanceCredential, symbol: string): void {
  const held = knownSymbols.get(credential.key) ?? new Set<string>()
  held.add(symbol)
  knownSymbols.set(credential.key, held)
}

/** Every change clears the held reads, so the next one asks Binance. */
function changed(): void {
  portfolioCache.clear()
  clearBinanceAccountReads()
}

async function act(
  network: NetworkId,
  orderAuth: OrderAuth,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  params: Record<string, string | number>
): Promise<unknown> {
  try {
    return await binanceSigned(
      network,
      credentialOf(orderAuth),
      method,
      path,
      params
    )
  } finally {
    changed()
  }
}

async function readOrder(
  network: NetworkId,
  credential: BinanceCredential,
  path: string,
  params: Record<string, string | number>,
  priority: BinancePriority = "order"
): Promise<unknown> {
  return binanceSigned(network, credential, "GET", path, params, { priority })
}

/**
 * The price an immediate order is sent at: 3% through the mark, or the
 * market's own band if that is tighter, snapped onto the price tick.
 */
export function immediateLimitPrice(input: {
  mark: number
  side: "buy" | "sell"
  priceTick: number | null
  priceMultiplierUp: number | null
  priceMultiplierDown: number | null
}): number {
  const fixedCap =
    input.mark * (input.side === "buy" ? 1 + MARKET_CAP : 1 - MARKET_CAP)
  const up = input.priceMultiplierUp
  const down = input.priceMultiplierDown
  const bandCap =
    input.side === "buy" && up !== null && up > 1
      ? input.mark * (1 + (up - 1) * PRICE_BAND_SHARE)
      : input.side === "sell" && down !== null && down > 0 && down < 1
        ? input.mark * (1 - (1 - down) * PRICE_BAND_SHARE)
        : fixedCap
  const capped =
    input.side === "buy" ? Math.min(fixedCap, bandCap) : Math.max(fixedCap, bandCap)
  if (input.priceTick === null || !(input.priceTick > 0)) return capped
  // Rounded toward the mark, so snapping never pushes the price past the cap.
  const ticks = capped / input.priceTick
  return snapToTick(
    (input.side === "buy" ? Math.floor(ticks) : Math.ceil(ticks)) *
      input.priceTick,
    input.priceTick
  )
}

async function setLeverageOn(
  network: NetworkId,
  orderAuth: OrderAuth,
  symbol: string,
  leverage: number
): Promise<void> {
  const asked = Math.max(1, Math.round(leverage))
  const credential = credentialOf(orderAuth)
  const key = `${credential.key}:${symbol}`
  if (leverageCache.get(key) === asked) return
  try {
    await act(network, orderAuth, "POST", "/fapi/v1/leverage", {
      symbol,
      leverage: asked,
    })
    leverageCache.set(key, asked)
  } catch (error) {
    throw new Error(
      `LIVE_LEVERAGE:Binance could not set ${marketOf(symbol)} to ${asked}x, so nothing was ordered. (${scrubbedMessage(error).replace(/^LIVE_ORDER_REFUSED:/, "")})`
    )
  }
}

/** The leverage Binance holds for this market now, read before an order. */
async function currentLeverage(
  network: NetworkId,
  orderAuth: OrderAuth,
  symbol: string
): Promise<number> {
  let answer: unknown
  try {
    answer = await readOrder(network, credentialOf(orderAuth), "/fapi/v1/symbolConfig", {
      symbol,
    })
  } catch (error) {
    throw new Error(
      `LIVE_ORDER_SETTINGS:Binance could not confirm ${marketOf(symbol)}'s leverage, so nothing was ordered. (${scrubbedMessage(error).replace(/^LIVE_ORDER_REFUSED:/, "")})`
    )
  }
  const rows = Array.isArray(answer) ? answer : []
  const row = rows.find(
    (one) => (one as { symbol?: unknown })?.symbol === symbol
  ) as { leverage?: unknown } | undefined
  const leverage = num(row?.leverage)
  if (leverage === null || !Number.isInteger(leverage) || leverage < 1) {
    throw new Error(
      `LIVE_ORDER_SETTINGS:Binance did not return ${marketOf(symbol)}'s leverage, so nothing was ordered.`
    )
  }
  return leverage
}

function protectionParams(input: {
  symbol: string
  long: boolean
  kind: "stop" | "target"
  triggerPx: number
  size: number | null
}): Record<string, string | number> {
  return {
    algoType: "CONDITIONAL",
    symbol: input.symbol,
    side: input.long ? "SELL" : "BUY",
    type: input.kind === "stop" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET",
    triggerPrice: decimal(input.triggerPx),
    // Fired against the mark, the price Binance liquidates against, so one
    // odd trade on the book cannot set a stop off.
    workingType: "MARK_PRICE",
    // A null size is Binance's close-all: it sells whatever is held when it
    // fires, however the position grew. A number is a fixed reduce-only size.
    ...(input.size === null
      ? { closePosition: "true" }
      : {
          quantity: decimal(input.size, { errorCode: "LIVE_SIZE" }),
          reduceOnly: "true",
        }),
  }
}

async function placeProtection(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: Record<string, string | number>
): Promise<string> {
  const answer = await act(network, orderAuth, "POST", "/fapi/v1/algoOrder", params)
  const parsed = algoSchema.safeParse(answer)
  if (!parsed.success) throw new Error("LIVE_UNREADABLE")
  return `${ALGO}${parsed.data.algoId}`
}

export async function placeBinanceOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  assertPlaceOrderValues(params)
  await assertRealMoneyAllowed(network)
  requireBinanceMainnet(network)
  const symbol = symbolOf(params.marketId)
  const credential = credentialOf(orderAuth)
  if (params.leverage !== null && !params.reduceOnly) {
    const wanted = Math.max(1, Math.round(params.leverage))
    const held = await currentLeverage(network, orderAuth, symbol)
    leverageCache.set(`${credential.key}:${symbol}`, held)
    if (held !== wanted) {
      await setLeverageOn(network, orderAuth, symbol, wanted)
    }
  }
  remember(credential, symbol)

  const market = params.kind === "market"
  const price = market
    ? immediateLimitPrice({
        mark: params.px,
        side: params.side,
        priceTick: params.priceTick ?? null,
        priceMultiplierUp: params.priceMultiplierUp ?? null,
        priceMultiplierDown: params.priceMultiplierDown ?? null,
      })
    : params.px
  const order: Record<string, string | number> = {
    symbol,
    side: params.side.toUpperCase(),
    type: "LIMIT",
    quantity: decimal(params.sz, { errorCode: "LIVE_SIZE" }),
    price: decimal(price),
    timeInForce: params.kind === "postOnly" ? "GTX" : market ? "IOC" : "GTC",
    // RESULT answers once the order has done what it will do at once, so an
    // immediate order comes back with its fill and needs no second read.
    newOrderRespType: "RESULT",
  }
  if (params.reduceOnly) order.reduceOnly = "true"
  if (params.clientOrderId && CLIENT_ID.test(params.clientOrderId)) {
    order.newClientOrderId = params.clientOrderId
  }
  const answer = await act(network, orderAuth, "POST", "/fapi/v1/order", order)
  const placed = orderSchema.safeParse(answer)
  if (!placed.success) {
    throw new Error(
      "LIVE_NO_ANSWER:Binance took the order but its answer could not be read. Check Binance's own site before trying again."
    )
  }
  const filledSz = num(placed.data.executedQty) ?? 0
  const avgPx = num(placed.data.avgPrice)
  if (market && filledSz === 0) {
    throw new Error(
      "LIVE_ORDER_REFUSED:Binance could not fill any of it within 3% of the price, so nothing was bought or sold."
    )
  }
  const filled = placed.data.status === "FILLED" || (market && filledSz > 0)

  let protection: PlaceOrderOutcome["protection"] = null
  let protectionNote: string | null = null
  if (params.tpPx !== null || params.slPx !== null) {
    const failures: string[] = []
    for (const kind of ["stop", "target"] as const) {
      const triggerPx = kind === "stop" ? params.slPx : params.tpPx
      if (triggerPx === null) continue
      try {
        await placeProtection(
          network,
          orderAuth,
          protectionParams({
            symbol,
            long: params.side === "buy",
            kind,
            triggerPx,
            size: null,
          })
        )
      } catch (error) {
        failures.push(
          scrubbedMessage(error).replace(/^LIVE_ORDER_REFUSED:/, "")
        )
      }
    }
    protection = failures.length === 0 ? "ok" : "partial"
    protectionNote =
      failures.length === 0
        ? null
        : `The entry was placed, but Binance refused part of its protection (${failures.join(" ")}) Check the position now.`
  }

  return {
    status: filled ? "filled" : "resting",
    orderId: String(placed.data.orderId),
    avgPx: filled && avgPx !== null && avgPx > 0 ? avgPx : null,
    filledSz: filled ? filledSz : null,
    protection,
    protectionNote,
  }
}

export async function cancelBinanceOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  if (params.orderId.startsWith(ALGO)) {
    await act(network, orderAuth, "DELETE", "/fapi/v1/algoOrder", {
      algoId: params.orderId.slice(ALGO.length),
    })
    return
  }
  await act(network, orderAuth, "DELETE", "/fapi/v1/order", {
    symbol: symbolOf(params.marketId),
    orderId: params.orderId,
  })
}

/**
 * Moves a resting order to a new price in place. Binance's amend keeps the
 * order's id and asks for its side and size again. A stop or target cannot
 * be amended on Binance; those move through `setBrackets`.
 */
export async function modifyBinanceOrder(
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
  assertPlaceOrderValues({ px: params.px, sz: params.sz, tpPx: null, slPx: null })
  await assertRealMoneyAllowed(network)
  if (params.orderId.startsWith(ALGO)) {
    throw new Error(
      "LIVE_ORDER_REFUSED:Binance cannot move a stop or target in place. Set the stop or target again instead."
    )
  }
  try {
    await act(network, orderAuth, "PUT", "/fapi/v1/order", {
      symbol: symbolOf(params.marketId),
      orderId: params.orderId,
      side: params.side.toUpperCase(),
      quantity: decimal(params.sz, { errorCode: "LIVE_SIZE" }),
      price: decimal(params.px),
    })
  } catch (error) {
    if (isOrderGone(error)) {
      throw new Error(
        "LIVE_ORDER_GONE:That order filled or was cancelled while it was being moved."
      )
    }
    throw error
  }
}

export async function setBinanceLeverage(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; leverage: number }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  const symbol = symbolOf(params.marketId)
  // A hand-set leverage always reaches Binance, even when it matches what the
  // cache last saw: here the call is the point.
  leverageCache.delete(`${credentialOf(orderAuth).key}:${symbol}`)
  await setLeverageOn(network, orderAuth, symbol, params.leverage)
}

/**
 * Adds cash to, or takes it back from, one isolated position. Binance's
 * `type` is 1 to add and 2 to take back. A cross position has no cash of
 * its own, and Binance refuses it in words.
 */
export async function adjustBinanceMargin(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; szi: number; dollars: number }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  if (params.szi === 0) throw new Error("LIVE_POSITION_GONE")
  if (!Number.isFinite(params.dollars) || params.dollars === 0) {
    throw new Error("LIVE_MARGIN_NOTHING")
  }
  await act(network, orderAuth, "POST", "/fapi/v1/positionMargin", {
    symbol: symbolOf(params.marketId),
    amount: decimal(Math.abs(params.dollars)),
    type: params.dollars > 0 ? 1 : 2,
  })
}

async function openPlainOrders(
  network: NetworkId,
  credential: BinanceCredential,
  priority: BinancePriority,
  symbol?: string
): Promise<PlainOrder[]> {
  const answer = await readOrder(
    network,
    credential,
    "/fapi/v1/openOrders",
    symbol ? { symbol } : {},
    priority
  )
  if (!Array.isArray(answer)) throw new Error("LIVE_UNREADABLE")
  return answer.map((raw) => {
    const parsed = orderSchema.safeParse(raw)
    if (!parsed.success) throw new Error("LIVE_UNREADABLE")
    return parsed.data
  })
}

async function openAlgoOrders(
  network: NetworkId,
  credential: BinanceCredential,
  priority: BinancePriority,
  symbol?: string
): Promise<AlgoOrder[]> {
  const answer = await readOrder(
    network,
    credential,
    "/fapi/v1/openAlgoOrders",
    symbol ? { symbol } : {},
    priority
  )
  // Binance's SDK types this answer as a list. It is read as either a list
  // or an object holding one, so a wrapped answer is not taken for "none".
  const rows = Array.isArray(answer)
    ? answer
    : Array.isArray((answer as { orders?: unknown } | null)?.orders)
      ? (answer as { orders: unknown[] }).orders
      : null
  if (rows === null) throw new Error("LIVE_UNREADABLE")
  return rows.map((raw) => {
    const parsed = algoSchema.safeParse(raw)
    if (!parsed.success) throw new Error("LIVE_UNREADABLE")
    return parsed.data
  })
}

function isStop(type: string): boolean {
  return type === "STOP_MARKET"
}

function isTarget(type: string): boolean {
  return type === "TAKE_PROFIT_MARKET"
}

/** Positions, resting orders and their stops and targets, joined. Exported for tests. */
export function joinBinancePortfolio(
  base: WalletPortfolio,
  plain: readonly PlainOrder[],
  algos: readonly AlgoOrder[]
): WalletPortfolio {
  const positions = base.positions.map((position) => ({
    ...position,
    targets: [...position.targets],
    protectionOrderIds: [...position.protectionOrderIds],
  }))
  // Oldest first, so a position carrying more than one stop names the same
  // one on every read instead of flipping between them.
  const oldestFirst = [...algos].sort((left, right) =>
    String(left.algoId).localeCompare(String(right.algoId), undefined, {
      numeric: true,
    })
  )
  for (const row of oldestFirst) {
    const type = row.orderType.toUpperCase()
    if (!isStop(type) && !isTarget(type)) continue
    const position = positions.find(
      (one) => one.marketId === coinNameFor(row.symbol)
    )
    if (!position) continue
    const triggerPx = num(row.triggerPrice)
    if (triggerPx === null) throw new Error("LIVE_UNREADABLE")
    const id = `${ALGO}${row.algoId}`
    // Every leg is counted, including ones that do not become the position's
    // own stop or target, because `setBrackets` has to cancel all of them.
    position.protectionOrderIds.push(id)
    if (isTarget(type)) {
      position.targets.push({
        px: triggerPx,
        sz: row.closePosition ? null : num(row.quantity),
        orderId: id,
      })
    } else if (position.slPx === null) {
      position.slPx = triggerPx
      position.slOrderId = id
    }
  }
  for (const position of positions) {
    position.targets.sort((left, right) => left.px - right.px)
    const first = position.targets[0] ?? null
    position.tpPx = first?.px ?? null
    position.tpSz = first?.sz ?? null
    position.tpOrderId = first?.orderId ?? null
  }
  const orders: WalletOpenOrder[] = []
  for (const row of plain) {
    const px = num(row.price)
    const sz = num(row.origQty)
    const marketId = coinNameFor(row.symbol)
    if (px === null || sz === null || marketId === null) {
      throw new Error("LIVE_UNREADABLE")
    }
    orders.push({
      orderId: String(row.orderId),
      marketId,
      side: row.side === "BUY" ? "buy" : "sell",
      px,
      sz,
      reduceOnly: row.reduceOnly ?? false,
      trigger: false,
    })
  }
  return { positions, orders }
}

/** What a live wallet holds and has waiting, with stops and targets joined. */
export async function fetchBinanceOrderPortfolio(
  network: NetworkId,
  address: string,
  credentialFn: () => string | null,
  priority: BinancePriority = "background"
): Promise<WalletPortfolio> {
  const credential = binanceCredentialOf(credentialFn)
  const held = portfolioCache.get(credential.key)
  // A message on the account stream after this read was taken means
  // something moved on Binance itself, so the held read is dropped.
  const changedAt = binanceUserStreamState(network, address).changedAt
  if (
    held &&
    Date.now() - held.at < PORTFOLIO_GOOD_FOR_MS &&
    changedAt < held.at
  ) {
    return held.answer
  }
  const answer = Promise.all([
    fetchBinancePositions(network, credentialFn, priority),
    openPlainOrders(network, credential, priority),
    openAlgoOrders(network, credential, priority),
  ]).then(([base, plain, algos]) => {
    for (const row of plain) remember(credential, row.symbol)
    for (const row of algos) remember(credential, row.symbol)
    for (const row of base.positions) {
      const symbol = binanceSymbolFor(row.marketId)
      if (symbol) remember(credential, symbol)
    }
    return joinBinancePortfolio(base, plain, algos)
  })
  return rememberPromise(portfolioCache, credential.key, {
    at: Date.now(),
    answer,
  })
}

export async function closeBinancePosition(
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
  const symbol = symbolOf(params.marketId)
  const markAnswer = (await binancePublic(
    network,
    "/fapi/v1/premiumIndex",
    { symbol },
    "order"
  )) as { markPrice?: unknown } | null
  const mark = num(markAnswer?.markPrice)
  if (mark === null || !(mark > 0)) throw new Error("LIVE_NO_PRICE")
  const side = params.szi > 0 ? "sell" : "buy"
  const answer = await act(network, orderAuth, "POST", "/fapi/v1/order", {
    symbol,
    side: side.toUpperCase(),
    type: "LIMIT",
    quantity: decimal(Math.abs(params.szi), { errorCode: "LIVE_SIZE" }),
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
    reduceOnly: "true",
    newOrderRespType: "RESULT",
  })
  const placed = orderSchema.safeParse(answer)
  if (!placed.success) {
    throw new Error(
      "LIVE_NO_ANSWER:Binance took the close but its answer could not be read. Check Binance's own site before trying again."
    )
  }
  const filledSz = num(placed.data.executedQty)
  const fullyClosed =
    filledSz !== null && filledSz + 1e-9 >= Math.abs(params.szi)
  if (fullyClosed) {
    // A close-all stop would do nothing once the position is gone, but a
    // sized target would open a new position if it fired, so every stop and
    // target on this market comes off.
    const algos = await openAlgoOrders(
      network,
      credentialOf(orderAuth),
      "order",
      symbol
    )
    for (const row of algos) {
      const type = row.orderType.toUpperCase()
      if (!isStop(type) && !isTarget(type)) continue
      try {
        await cancelBinanceOrder(network, orderAuth, {
          marketId: params.marketId,
          orderId: `${ALGO}${row.algoId}`,
        })
      } catch (error) {
        if (isOrderGone(error)) continue
        // The close itself went through. Saying only "refused" here would
        // read as a failed close, and the leftover target could open a new
        // position if it fired.
        throw new Error(
          `LIVE_EXCHANGE:The position closed, but a stop or target on it could not be taken off Binance (${scrubbedMessage(error).replace(/^LIVE_ORDER_REFUSED:/, "")}) Cancel it on Binance's own site.`
        )
      }
    }
  }
  const avgPx = num(placed.data.avgPrice)
  return { avgPx: avgPx !== null && avgPx > 0 ? avgPx : null, filledSz }
}

/**
 * Replaces the stop and target riding on a position.
 *
 * **The new ones go on before the old ones come off**, so the position is
 * never without a stop, even for a moment. If Binance refuses a new leg, the
 * old protection is still there and the refusal says so. If an old leg will
 * not come off, the answer says two are on.
 */
export async function setBinanceBrackets(
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
  assertBracketValues(params)
  await assertRealMoneyAllowed(network)
  const symbol = symbolOf(params.marketId)
  const oldIds = [...new Set(params.position.protectionOrderIds)]
  const long = params.position.szi > 0
  const size = Math.abs(params.position.szi)
  const legs = [
    ...(params.slPx !== null
      ? [
          {
            label: `stop at ${params.slPx}`,
            stop: true,
            order: protectionParams({
              symbol,
              long,
              kind: "stop",
              triggerPx: params.slPx,
              size: params.slSz,
            }),
          },
        ]
      : []),
    ...params.targets.map((target) => ({
      label: `target at ${target.px}`,
      stop: false,
      order: protectionParams({
        symbol,
        long,
        kind: "target",
        triggerPx: target.px,
        size: target.sz ?? size,
      }),
    })),
  ]

  const landed: string[] = []
  let slOrderId: string | null = null
  for (const leg of legs) {
    try {
      const id = await placeProtection(network, orderAuth, leg.order)
      if (leg.stop) slOrderId = id
      landed.push(leg.label)
    } catch (error) {
      throw new Error(
        `LIVE_BRACKET_REPLACE_PARTIAL:The old protection is still on.${landed.length > 0 ? ` The new ${landed.join(" and ")} also went on.` : ""} The new ${leg.label} was refused: ${scrubbedMessage(error).replace(/^LIVE_ORDER_REFUSED:/, "")}`
      )
    }
  }

  for (const orderId of oldIds) {
    try {
      await cancelBinanceOrder(network, orderAuth, {
        marketId: params.marketId,
        orderId,
      })
    } catch (error) {
      if (isOrderGone(error)) continue
      throw new Error(
        `LIVE_BRACKET_REPLACE_DOUBLED:${landed.length > 0 ? `The new ${landed.join(" and ")} is on, but` : "Nothing new was requested, and"} an old protection order could not be cancelled: ${scrubbedMessage(error).replace(/^LIVE_ORDER_REFUSED:/, "")}`
      )
    }
  }
  if (oldIds.length > 0) {
    const still = (
      await openAlgoOrders(network, credentialOf(orderAuth), "order", symbol)
    ).filter((row) => oldIds.includes(`${ALGO}${row.algoId}`))
    if (still.length > 0) {
      throw new Error(
        `LIVE_BRACKET_REPLACE_DOUBLED:${landed.length > 0 ? `The new ${landed.join(" and ")} is on, but` : "Nothing new was requested, and"} ${still.length} old protection ${still.length === 1 ? "order is" : "orders are"} still on Binance.`
      )
    }
  }
  return { slOrderId }
}

/** One `userTrades` row in the app's shape. Exported for tests. */
export function toBinanceFill(raw: unknown): WalletOrderFill {
  const parsed = fillSchema.safeParse(raw)
  if (!parsed.success) throw new Error("LIVE_UNREADABLE")
  const row = parsed.data
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
  return {
    fillId: String(row.id),
    orderId: String(row.orderId),
    marketId: marketOf(row.symbol),
    side: row.side === "BUY" ? "buy" : "sell",
    px,
    sz,
    at,
    closedPnl: pnl,
    // Binance states the fee as a positive amount paid.
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
  }
}

/**
 * Adds every coin the account has traded since a moment to the ones this
 * process already knows.
 *
 * `userTrades` answers one coin at a time, and the coins seen in positions
 * and orders are only the ones held now. After a restart, a coin whose
 * position closed while the server was down would otherwise never be asked
 * about, and its fills would never reach the Journal. Every trade Binance
 * charges a fee for writes a row to the account's money history, with its
 * coin, so one read of that history names them all. It costs 30 request
 * units, so it runs at most once a minute per key.
 */
async function discoverTradedSymbols(
  network: NetworkId,
  credential: BinanceCredential,
  startTime: number,
  priority: BinancePriority
): Promise<void> {
  const held = discovered.get(credential.key)
  if (held && Date.now() - held.at < DISCOVER_EVERY_MS && held.from <= startTime) {
    return
  }
  const answer = await readOrder(
    network,
    credential,
    "/fapi/v1/income",
    { startTime, limit: 1000 },
    priority
  )
  if (!Array.isArray(answer)) throw new Error("LIVE_UNREADABLE")
  for (const raw of answer) {
    const symbol = (raw as { symbol?: unknown } | null)?.symbol
    if (typeof symbol === "string" && coinNameFor(symbol) !== null) {
      remember(credential, symbol)
    }
  }
  discovered.set(credential.key, { at: Date.now(), from: startTime })
}

/**
 * Fills since a moment, from the pushed stream when it has covered the whole
 * stretch, otherwise from `userTrades` per market this account has touched.
 * Binance answers `userTrades` one market at a time and seven days at a time,
 * so an older `since` reads the last seven days.
 */
export async function fetchBinanceOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  credentialFn: () => string | null,
  priority: BinancePriority = "background"
): Promise<WalletOrderFill[]> {
  const pushed = binanceFillsFromStream(network, address, since, credentialFn)
  if (pushed) return pushed

  const credential = binanceCredentialOf(credentialFn)
  const recoveryVersion = binanceFillsRecoveryVersion(network, address)
  const startTime = Math.max(since, Date.now() - FILL_WINDOW_MS + 60_000)
  await discoverTradedSymbols(network, credential, startTime, priority)
  const symbols = knownSymbols.get(credential.key)
  if (!symbols || symbols.size === 0) {
    markBinanceFillsRecovered(network, address, since, [], recoveryVersion)
    return []
  }
  const answers = await Promise.all(
    [...symbols].map((symbol) =>
      readOrder(
        network,
        credential,
        "/fapi/v1/userTrades",
        { symbol, startTime, limit: 1000 },
        priority
      )
    )
  )
  const fills: WalletOrderFill[] = []
  for (const answer of answers) {
    if (!Array.isArray(answer)) throw new Error("LIVE_UNREADABLE")
    for (const raw of answer) fills.push(toBinanceFill(raw))
  }
  fills.sort((a, b) => a.at - b.at)
  markBinanceFillsRecovered(network, address, since, fills, recoveryVersion)
  return fills
}

function kindOf(type: string | undefined): WalletOrderInfo["kind"] {
  const upper = type?.toUpperCase() ?? ""
  if (isStop(upper)) return "stop"
  if (isTarget(upper)) return "target"
  return "none"
}

/**
 * What one order was, asked after it is gone: the way a stop firing is told
 * from an ordinary sell. A fill names the plain order a stop became when it
 * fired, never the stop's own id, so that order is looked up among the
 * stop-order service's history (`actualOrderId`) as well.
 */
export async function fetchBinanceOrderInfo(
  network: NetworkId,
  address: string,
  orderId: string,
  marketId: string,
  credentialFn: () => string | null
): Promise<WalletOrderInfo> {
  const credential = binanceCredentialOf(credentialFn)
  if (orderId.startsWith(ALGO)) {
    const parsed = algoSchema.safeParse(
      await readOrder(network, credential, "/fapi/v1/algoOrder", {
        algoId: orderId.slice(ALGO.length),
      })
    )
    if (!parsed.success) return { kind: "none", triggerPx: null }
    return {
      kind: kindOf(parsed.data.orderType),
      triggerPx: num(parsed.data.triggerPrice),
    }
  }
  const streamed = binanceStopKindOf(network, address, orderId)
  if (streamed) return streamed

  const symbol = symbolOf(marketId)
  const plain = orderSchema.safeParse(
    await readOrder(network, credential, "/fapi/v1/order", { symbol, orderId })
  )
  if (plain.success) {
    const kind = kindOf(plain.data.origType ?? plain.data.type)
    if (kind !== "none") {
      return { kind, triggerPx: num(plain.data.stopPrice) }
    }
  }
  // The stop was made before the order it fired into, so the week that ends
  // just after that order is searched. The pushed stream above covers a stop
  // older than that.
  const placedAt = plain.success ? num(plain.data.time) : null
  const history = await readOrder(network, credential, "/fapi/v1/allAlgoOrders", {
    symbol,
    ...(placedAt !== null
      ? {
          startTime: placedAt + 60_000 - FILL_WINDOW_MS,
          endTime: placedAt + 60_000,
        }
      : {}),
    limit: 100,
  })
  for (const raw of Array.isArray(history) ? history : []) {
    const row = algoSchema.safeParse(raw)
    if (!row.success) continue
    if (String(row.data.actualOrderId ?? "") !== orderId) continue
    return {
      kind: kindOf(row.data.orderType),
      triggerPx: num(row.data.triggerPrice),
    }
  }
  return { kind: "none", triggerPx: null }
}

export function clearBinanceOrderState(): void {
  leverageCache.clear()
  knownSymbols.clear()
  discovered.clear()
  portfolioCache.clear()
}
