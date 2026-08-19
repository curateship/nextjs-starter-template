import { randomUUID } from "node:crypto"

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
import { num, roundPhemexPx } from "@/lib/protocols/phemex/translate"
import { phemexAccountPositions } from "@/server/protocols/phemex/account"
import {
  parsePhemexCredential,
  phemexPublic,
  phemexSigned,
} from "@/server/protocols/phemex/client"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import { scrubbedMessage } from "@/server/protocols/scrub"

/**
 * Real orders against Phemex — the one file in this folder that changes an
 * account.
 *
 * The rules it keeps, in the order they bite:
 *
 * - **The real-money gate is called first, always.** Testnet signs freely;
 *   mainnet refuses until both layers are deliberately on.
 * - **One-way positions, forced.** Phemex accounts can run "hedged" — a long
 *   and a short on the same coin at once — which would double-book every
 *   ladder. The mode is switched to one-way per symbol before the first
 *   order this process sends there; an account already one-way answers with
 *   a refusal that is safely ignored.
 * - **A "market" order is a capped IOC limit.** Sent 3% through the asked
 *   price and told to fill-or-die, so a thin book cannot fill one far from
 *   what was on screen — the same rule as every other venue here.
 * - **Sizes are floored to the market's own step.** The shared engine sizes
 *   by decimal places; the exchange's step is the truth, enforced here, and
 *   an order that floors to nothing is refused out loud.
 * - **Nothing retries.** A rate-limited mutate throws `EXCHANGE_BUSY`; a
 *   retried order is a possible double order.
 *
 * Phemex accepts an order and *then* works it, so a just-placed IOC may
 * answer "New" for a beat. The placement polls the order once or twice for
 * its final state; one that stays pending is reported resting and the fills
 * sweep tells the truth a moment later.
 */

const MARKET_SLIPPAGE = 0.03

/** How an IOC's final state is chased: a few short looks, then let the sweep tell it. */
const IOC_POLLS = 3
const IOC_POLL_WAIT_MS = 400

// ----- The market's own rules, cached -------------------------------------

/**
 * Tick and step per symbol, from the public rulebook. Needed at order time
 * (the cap must land on a legal price; the size on a legal step) and cached
 * a few minutes because listings change on the exchange's timescale, not
 * ours.
 */
const RULES_GOOD_FOR_MS = 5 * 60_000

type SymbolRules = { tickSize: number | null; qtyStepSize: number | null }

const rulesCache = new Map<
  NetworkId,
  { at: number; bySymbol: Map<string, SymbolRules> }
>()

const productSchema = z.object({
  symbol: z.string(),
  tickSize: z.union([z.string(), z.number()]).optional(),
  qtyStepSize: z.union([z.string(), z.number()]).optional(),
})

async function symbolRules(
  network: NetworkId,
  symbol: string
): Promise<SymbolRules> {
  const cached = rulesCache.get(network)
  if (!cached || Date.now() - cached.at > RULES_GOOD_FOR_MS) {
    const answer = (await phemexPublic(network, "/public/products")) as {
      perpProductsV2?: unknown[]
    }
    const bySymbol = new Map<string, SymbolRules>()
    for (const raw of answer.perpProductsV2 ?? []) {
      const parsed = productSchema.safeParse(raw)
      if (!parsed.success) continue
      bySymbol.set(parsed.data.symbol, {
        tickSize: num(parsed.data.tickSize),
        qtyStepSize: num(parsed.data.qtyStepSize),
      })
    }
    rulesCache.set(network, { at: Date.now(), bySymbol })
  }
  const rules = rulesCache.get(network)?.bySymbol.get(symbol)
  if (!rules) throw new Error("LIVE_UNLISTED")
  return rules
}

// ----- Small shared pieces -------------------------------------------------

function auth(orderAuth: OrderAuth): { keyId: string; secret: string } {
  return parsePhemexCredential(orderAuth.agentKey)
}

/** An exchange refusal as a thrown, scrubbed, code-prefixed error. */
function exchangeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "EXCHANGE_BUSY") return new Error("EXCHANGE_BUSY")
  return new Error(`LIVE_EXCHANGE:${scrubbedMessage(error)}`)
}

/** A refusal at the door — nothing was placed. Carries that promise as its code. */
function refusedError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "EXCHANGE_BUSY") return new Error("EXCHANGE_BUSY")
  if (message.startsWith("PHEMEX_")) {
    return new Error(`LIVE_ORDER_REFUSED:${scrubbedMessage(error)}`)
  }
  return exchangeError(error)
}

/** The exchange's decimal string for a number — never scientific notation. */
function decimalString(value: number): string {
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 12,
  })
}

/** Size floored to the market's own step. Zero means "too small to exist". */
function floorToStep(sz: number, step: number | null): number {
  if (step === null || !(step > 0)) return sz
  const steps = Math.floor(sz / step + 1e-9)
  return Number((steps * step).toFixed(12))
}

/** The capped price a "market" order is really sent at. */
function cappedPx(
  side: "buy" | "sell",
  px: number,
  tick: number | null
): number {
  const capped = side === "buy" ? px * (1 + MARKET_SLIPPAGE) : px * (1 - MARKET_SLIPPAGE)
  return roundPhemexPx(capped, null, tick)
}

// ----- Position mode -------------------------------------------------------

/**
 * Symbols this process has already forced to one-way, per network — the
 * switch is idempotent but not free, and an account that is already one-way
 * refuses the call, so once per symbol per process is exactly enough.
 */
const onewaySymbols = new Map<NetworkId, Set<string>>()

async function ensureOneWay(
  network: NetworkId,
  credential: { keyId: string; secret: string },
  symbol: string
): Promise<void> {
  const done = onewaySymbols.get(network) ?? new Set<string>()
  onewaySymbols.set(network, done)
  if (done.has(symbol)) return
  try {
    await phemexSigned(
      network,
      credential,
      "PUT",
      "/g-positions/switch-pos-mode-sync",
      { symbol, targetPosMode: "OneWay" },
      undefined,
      false
    )
  } catch {
    // Already one-way, or a position is open (the mode cannot change under
    // one) — either way the account is in a mode orders will state
    // explicitly (`posSide: "Merged"`), and a genuinely hedged account
    // refuses THAT loudly rather than double-booking here.
  }
  done.add(symbol)
}

// ----- Reading orders back -------------------------------------------------

const orderRowSchema = z.object({
  orderId: z.string().optional(),
  orderID: z.string().optional(),
  clOrdId: z.string().optional(),
  clOrdID: z.string().optional(),
  // Optional because a just-placed order's acknowledgement can be thinner
  // than a listed row; anything read as a LIST is filtered to rows that
  // actually name their market.
  symbol: z.string().default(""),
  side: z.string().default(""),
  ordType: z.union([z.string(), z.number()]).optional(),
  ordStatus: z.union([z.string(), z.number()]).optional(),
  priceRp: z.union([z.string(), z.number()]).optional(),
  stopPxRp: z.union([z.string(), z.number()]).optional(),
  orderQtyRq: z.union([z.string(), z.number()]).optional(),
  cumQtyRq: z.union([z.string(), z.number()]).optional(),
  cumValueRv: z.union([z.string(), z.number()]).optional(),
  reduceOnly: z.boolean().optional(),
  closedPnlRv: z.union([z.string(), z.number()]).optional(),
  actionTimeNs: z.union([z.string(), z.number()]).optional(),
})

type OrderRow = z.infer<typeof orderRowSchema>

const idOf = (row: OrderRow) => row.orderId ?? row.orderID ?? ""

/**
 * Phemex speaks two dialects for the same enums: the per-order endpoints
 * answer words ("Filled", "Stop") while the by-currency order list answers
 * the code numbers behind them. Both are normalized to the words here, from
 * the exchange's own tables, so the rest of this file reads one language.
 */
const ORDER_STATUS_NAMES: Record<number, string> = {
  1: "Untriggered",
  5: "New",
  6: "PartiallyFilled",
  7: "Filled",
  8: "Canceled",
}

const ORDER_TYPE_NAMES: Record<number, string> = {
  1: "Market",
  2: "Limit",
  3: "Stop",
  4: "StopLimit",
  5: "MarketIfTouched",
  6: "LimitIfTouched",
  7: "ProtectedMarket",
  8: "MarketAsLimit",
  9: "StopAsLimit",
  10: "MarketIfTouchedAsLimit",
  11: "Bracket",
  12: "BoTpLimit",
  13: "BoSlLimit",
  14: "BoSlMarket",
}

function statusNameOf(row: OrderRow): string {
  if (typeof row.ordStatus === "number") {
    return ORDER_STATUS_NAMES[row.ordStatus] ?? String(row.ordStatus)
  }
  return row.ordStatus ?? ""
}

function typeNameOf(row: OrderRow): string {
  if (typeof row.ordType === "number") {
    return ORDER_TYPE_NAMES[row.ordType] ?? String(row.ordType)
  }
  return row.ordType ?? ""
}

const STOP_TYPES = new Set(["Stop", "StopLimit", "BoSlMarket", "BoSlLimit"])
const TARGET_TYPES = new Set(["MarketIfTouched", "LimitIfTouched", "BoTpLimit"])

function rowsOf(answer: unknown): OrderRow[] {
  const data = answer as { rows?: unknown } | unknown[] | null
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { rows?: unknown })?.rows)
      ? ((data as { rows: unknown[] }).rows)
      : []
  return list
    .map((row) => orderRowSchema.safeParse(row))
    .filter((row) => row.success)
    .map((row) => row.data)
    .filter((row) => row.symbol !== "")
}

async function orderById(
  network: NetworkId,
  credential: { keyId: string; secret: string },
  symbol: string,
  orderId: string
): Promise<OrderRow | null> {
  const answer = await phemexSigned(
    network,
    credential,
    "GET",
    "/api-data/g-futures/orders/by-order-id",
    { symbol, orderID: orderId }
  )
  return rowsOf(answer)[0] ?? null
}

// ----- Placing --------------------------------------------------------------

export async function placePhemexOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  await assertRealMoneyAllowed(network)
  const credential = auth(orderAuth)
  const rules = await symbolRules(network, params.marketId)

  const sz = floorToStep(params.sz, rules.qtyStepSize)
  if (!(sz > 0)) throw new Error("LIVE_SIZE_TOO_SMALL")

  await ensureOneWay(network, credential, params.marketId)

  if (params.leverage !== null) {
    // Set only when opening fresh — the caller already sends null when the
    // position exists. Positive is isolated margin: the trade's stake is all
    // it can lose, which is the promise the app's screens make.
    try {
      await phemexSigned(
        network,
        credential,
        "PUT",
        "/g-positions/leverage",
        {
          symbol: params.marketId,
          leverageRr: decimalString(params.leverage),
        },
        undefined,
        false
      )
    } catch (error) {
      throw refusedError(error)
    }
  }

  const isMarket = params.kind === "market"
  const px = isMarket
    ? cappedPx(params.side, params.px, rules.tickSize)
    : roundPhemexPx(params.px, null, rules.tickSize)
  if (!(px > 0)) throw new Error("LIVE_PRICE")

  const query: Record<string, string | number | boolean> = {
    clOrdID: randomUUID(),
    symbol: params.marketId,
    side: params.side === "buy" ? "Buy" : "Sell",
    posSide: "Merged",
    ordType: "Limit",
    priceRp: decimalString(px),
    orderQtyRq: decimalString(sz),
    timeInForce:
      params.kind === "market"
        ? "ImmediateOrCancel"
        : params.kind === "postOnly"
          ? "PostOnly"
          : "GoodTillCancel",
    reduceOnly: params.reduceOnly,
  }
  // Protection rides the entry itself: the exchange keeps the stop and the
  // target with the position, so a partly-accepted pair cannot happen — the
  // whole order stands or the whole order is refused.
  if (params.tpPx !== null) {
    query.takeProfitRp = decimalString(
      roundPhemexPx(params.tpPx, null, rules.tickSize)
    )
    query.tpTrigger = "ByMarkPrice"
  }
  if (params.slPx !== null) {
    query.stopLossRp = decimalString(
      roundPhemexPx(params.slPx, null, rules.tickSize)
    )
    query.slTrigger = "ByMarkPrice"
  }

  let placed: OrderRow
  try {
    const answer = await phemexSigned(
      network,
      credential,
      "PUT",
      "/g-orders/create",
      query,
      undefined,
      false
    )
    const parsed = orderRowSchema.safeParse(answer)
    if (!parsed.success) throw new Error("LIVE_UNREADABLE")
    placed = parsed.data
  } catch (error) {
    throw refusedError(error)
  }

  const orderId = idOf(placed)
  const protection =
    params.tpPx !== null || params.slPx !== null ? ("ok" as const) : null

  // An IOC either filled or died; the exchange just needs a beat to say
  // which. Anything still pending after the polls is reported resting — the
  // fills sweep carries the truth forward either way.
  if (query.timeInForce === "ImmediateOrCancel" && orderId) {
    for (let poll = 0; poll < IOC_POLLS; poll += 1) {
      await new Promise((resolve) => setTimeout(resolve, IOC_POLL_WAIT_MS))
      const row = await orderById(
        network,
        credential,
        params.marketId,
        orderId
      ).catch(() => null)
      if (!row) continue
      const cumQty = num(row.cumQtyRq) ?? 0
      const cumValue = num(row.cumValueRv)
      const status = statusNameOf(row)
      if (status === "Filled" || (status === "Canceled" && cumQty > 0)) {
        return {
          status: "filled",
          orderId,
          avgPx: cumValue !== null && cumQty > 0 ? cumValue / cumQty : px,
          filledSz: cumQty,
          protection,
          protectionNote: null,
        }
      }
      if (status === "Canceled" || status === "Rejected") {
        throw new Error("LIVE_ORDER_REFUSED:The order missed and was cancelled.")
      }
    }
  }

  return {
    status: "resting",
    orderId: orderId || null,
    avgPx: null,
    filledSz: null,
    protection,
    protectionNote: null,
  }
}

// ----- Cancel, modify, close ------------------------------------------------

export async function cancelPhemexOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  try {
    await phemexSigned(
      network,
      auth(orderAuth),
      "DELETE",
      "/g-orders/cancel",
      { symbol: params.marketId, orderID: params.orderId, posSide: "Merged" },
      undefined,
      false
    )
  } catch (error) {
    throw exchangeError(error)
  }
}

export async function modifyPhemexOrder(
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
  const rules = await symbolRules(network, params.marketId)
  const sz = floorToStep(params.sz, rules.qtyStepSize)
  if (!(sz > 0)) throw new Error("LIVE_SIZE_TOO_SMALL")
  try {
    // A native amend — the order keeps its place-in-book identity and there
    // is no cancelled-but-not-replaced gap to fall into.
    await phemexSigned(
      network,
      auth(orderAuth),
      "PUT",
      "/g-orders/replace",
      {
        symbol: params.marketId,
        orderID: params.orderId,
        priceRp: decimalString(roundPhemexPx(params.px, null, rules.tickSize)),
        orderQtyRq: decimalString(sz),
        posSide: "Merged",
      },
      undefined,
      false
    )
  } catch (error) {
    throw exchangeError(error)
  }
}

export async function closePhemexPosition(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; szi: number }
): Promise<{ avgPx: number | null; filledSz: number | null }> {
  // Closing is a capped market order the other way, reduce-only so it can
  // never overshoot into a fresh position. The mark price is read publicly —
  // the cap needs a price to cap against.
  const prices = await phemexPublic(network, "/md/v2/ticker/24hr", {
    symbol: params.marketId,
  })
  const mark = num((prices as { markPriceRp?: unknown })?.markPriceRp)
  if (mark === null || !(mark > 0)) throw new Error("LIVE_NO_PRICE")

  const outcome = await placePhemexOrder(network, orderAuth, {
    marketId: params.marketId,
    side: params.szi > 0 ? "sell" : "buy",
    kind: "market",
    px: mark,
    sz: Math.abs(params.szi),
    reduceOnly: true,
    leverage: null,
    tpPx: null,
    slPx: null,
  })
  return { avgPx: outcome.avgPx, filledSz: outcome.filledSz }
}

// ----- Brackets -------------------------------------------------------------

export async function setPhemexBrackets(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: {
    marketId: string
    position: Pick<WalletPosition, "szi" | "tpOrderId" | "slOrderId">
    tpPx: number | null
    tpSz: number | null
    slPx: number | null
  }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  const credential = auth(orderAuth)
  const rules = await symbolRules(network, params.marketId)
  const size = Math.abs(params.position.szi)
  if (!(size > 0)) throw new Error("LIVE_POSITION_GONE")
  const exitSide = params.position.szi > 0 ? "Sell" : "Buy"

  // Old legs first, so the position is never guarded twice. A leg already
  // gone is fine — that is the state being aimed for.
  for (const orderId of [params.position.tpOrderId, params.position.slOrderId]) {
    if (!orderId) continue
    await phemexSigned(
      network,
      credential,
      "DELETE",
      "/g-orders/cancel",
      { symbol: params.marketId, orderID: orderId, posSide: "Merged" },
      undefined,
      false
    ).catch(() => {})
  }

  const placeLeg = async (leg: {
    ordType: "Stop" | "MarketIfTouched"
    triggerPx: number
    sz: number
  }) => {
    await phemexSigned(
      network,
      credential,
      "PUT",
      "/g-orders/create",
      {
        clOrdID: randomUUID(),
        symbol: params.marketId,
        side: exitSide,
        posSide: "Merged",
        ordType: leg.ordType,
        stopPxRp: decimalString(
          roundPhemexPx(leg.triggerPx, null, rules.tickSize)
        ),
        orderQtyRq: decimalString(floorToStep(leg.sz, rules.qtyStepSize)),
        triggerType: "ByMarkPrice",
        timeInForce: "ImmediateOrCancel",
        reduceOnly: true,
        closeOnTrigger: true,
      },
      undefined,
      false
    )
  }

  try {
    if (params.slPx !== null) {
      await placeLeg({ ordType: "Stop", triggerPx: params.slPx, sz: size })
    }
    if (params.tpPx !== null) {
      await placeLeg({
        ordType: "MarketIfTouched",
        triggerPx: params.tpPx,
        sz: params.tpSz ?? size,
      })
    }
  } catch (error) {
    throw exchangeError(error)
  }
}

// ----- Reading the account back ---------------------------------------------

const positionSchema = z.object({
  symbol: z.string(),
  side: z.string().optional(),
  size: z.union([z.string(), z.number()]).optional(),
  avgEntryPriceRp: z.union([z.string(), z.number()]).optional(),
  positionMarginRv: z.union([z.string(), z.number()]).optional(),
  liquidationPriceRp: z.union([z.string(), z.number()]).optional(),
  leverageRr: z.union([z.string(), z.number()]).optional(),
})

/**
 * The account's open orders — resting and untriggered alike — read by
 * currency so no symbol is forgotten. The closed-orders endpoint doubles as
 * the open-orders one: it filters by status, and New(5), PartiallyFilled(6)
 * and Untriggered(1) ARE the open states.
 */
/** How many order-list rows one page carries. */
const ORDER_LIST_PAGE = 200

/**
 * The by-currency order list, walked to the end. Paged because a truncated
 * answer here is a truncated protection-legs read — a stop the portfolio
 * cannot see is a stop `setBrackets` would double-place beside.
 */
async function orderListPages(
  network: NetworkId,
  credential: { keyId: string; secret: string },
  params: Record<string, string | number | boolean>
): Promise<OrderRow[]> {
  const rows: OrderRow[] = []
  for (let offset = 0; ; offset += ORDER_LIST_PAGE) {
    const answer = await phemexSigned(
      network,
      credential,
      "GET",
      "/exchange/order/v2/orderList",
      { ...params, offset, limit: ORDER_LIST_PAGE }
    )
    const page = rowsOf(answer)
    rows.push(...page)
    if (page.length < ORDER_LIST_PAGE) return rows
  }
}

async function openOrders(
  network: NetworkId,
  credential: { keyId: string; secret: string }
): Promise<OrderRow[]> {
  return orderListPages(network, credential, {
    currency: "USDT",
    ordStatus: "1,5,6",
  })
}

export async function fetchPhemexPortfolio(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<WalletPortfolio> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parsePhemexCredential(blob)

  const [{ positions: rawPositions }, orders] = await Promise.all([
    phemexAccountPositions(network, address, () => blob),
    openOrders(network, parsed),
  ])

  const openBySymbol = new Map<string, OrderRow[]>()
  for (const row of orders) {
    const list = openBySymbol.get(row.symbol) ?? []
    list.push(row)
    openBySymbol.set(row.symbol, list)
  }

  const positions: WalletPosition[] = []
  for (const raw of rawPositions) {
    const row = positionSchema.safeParse(raw)
    if (!row.success) continue
    const size = num(row.data.size) ?? 0
    if (!(size > 0)) continue
    const szi = row.data.side === "Sell" ? -size : size

    // The protection legs are the untriggered exit orders sitting on the
    // same symbol: a stop-family order guards the downside, a touched-family
    // one takes the profit. Their ids are what `setBrackets` replaces.
    const legs = (openBySymbol.get(row.data.symbol) ?? []).filter(
      (one) => statusNameOf(one) === "Untriggered"
    )
    const stop = legs.find((one) => STOP_TYPES.has(typeNameOf(one)))
    const target = legs.find((one) => TARGET_TYPES.has(typeNameOf(one)))

    positions.push({
      marketId: row.data.symbol,
      szi,
      entryPx: num(row.data.avgEntryPriceRp) ?? 0,
      leverage: Math.abs(num(row.data.leverageRr) ?? 1),
      marginUsed: num(row.data.positionMarginRv) ?? 0,
      liquidationPx: num(row.data.liquidationPriceRp),
      tpPx: target ? num(target.stopPxRp) : null,
      // Null when the target's leg covers the whole position; a smaller leg
      // reports its own size so a partial take-profit reads back honestly.
      tpSz: (() => {
        const legSz = target ? num(target.orderQtyRq) : null
        if (legSz === null) return null
        return legSz < size * (1 - 1e-6) ? legSz : null
      })(),
      slPx: stop ? num(stop.stopPxRp) : null,
      tpOrderId: target ? idOf(target) || null : null,
      slOrderId: stop ? idOf(stop) || null : null,
    })
  }

  const walletOrders: WalletOpenOrder[] = orders.map((row) => {
    const trigger = statusNameOf(row) === "Untriggered"
    const sz = Math.max(0, (num(row.orderQtyRq) ?? 0) - (num(row.cumQtyRq) ?? 0))
    return {
      orderId: idOf(row),
      marketId: row.symbol,
      side: row.side === "Sell" ? "sell" : "buy",
      px: (trigger ? num(row.stopPxRp) : num(row.priceRp)) ?? 0,
      sz,
      reduceOnly: row.reduceOnly ?? false,
      trigger,
    }
  })

  return { positions, orders: walletOrders }
}

// ----- Fills and old orders --------------------------------------------------

const fillSchema = z.object({
  execID: z.string().optional(),
  execId: z.string().optional(),
  orderID: z.string().optional(),
  orderId: z.string().optional(),
  symbol: z.string(),
  side: z.string(),
  execPriceRp: z.union([z.string(), z.number()]).optional(),
  execQtyRq: z.union([z.string(), z.number()]).optional(),
  execFeeRv: z.union([z.string(), z.number()]).optional(),
  closedPnlRv: z.union([z.string(), z.number()]).optional(),
  tradeType: z.string().optional(),
  transactTimeNs: z.union([z.string(), z.number()]).optional(),
})

const FILL_PAGE = 200

/**
 * Every trade the account made since the watermark.
 *
 * Phemex only answers trades PER SYMBOL, so the symbols are discovered
 * first: every order the account touched in the window (the by-currency
 * order list) plus every symbol it holds. A trade on a symbol with no order
 * and no position in the window cannot exist — an execution IS an order.
 */
export async function fetchPhemexOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  credential: () => string | null
): Promise<WalletOrderFill[]> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parsePhemexCredential(blob)
  const end = Date.now()

  const symbols = new Set<string>()
  const [{ positions }, touched] = await Promise.all([
    phemexAccountPositions(network, address, () => blob),
    // The per-symbol history endpoint cannot say which symbols exist, and
    // the account-wide one refuses without a symbol — the by-currency order
    // list is the one read that names every market the account touched.
    orderListPages(network, parsed, {
      currency: "USDT",
      start: Math.max(0, since),
    }).catch(() => null),
  ])
  for (const raw of positions) {
    const row = positionSchema.safeParse(raw)
    if (row.success) symbols.add(row.data.symbol)
  }
  for (const row of touched ?? []) symbols.add(row.symbol)

  const fills: WalletOrderFill[] = []
  for (const symbol of symbols) {
    for (let offset = 0; ; offset += FILL_PAGE) {
      const answer = await phemexSigned(
        network,
        parsed,
        "GET",
        "/api-data/g-futures/trades",
        {
          symbol,
          start: Math.max(0, since),
          end,
          offset,
          limit: FILL_PAGE,
        }
      )
      const rows = ((answer as { rows?: unknown[] })?.rows ?? [])
        .map((row) => fillSchema.safeParse(row))
        .filter((row) => row.success)
        .map((row) => row.data)

      for (const row of rows) {
        // Funding settlements arrive in the same feed; they are not fills
        // and the journal accounts for funding elsewhere.
        if (row.tradeType === "Funding") continue
        const at = Math.floor((num(row.transactTimeNs) ?? 0) / 1_000_000)
        const liquidation =
          row.tradeType === "LiqTrade" || row.tradeType === "AdlTrade"
        fills.push({
          fillId: row.execID ?? row.execId ?? "",
          orderId: row.orderID ?? row.orderId ?? "",
          marketId: row.symbol,
          side: row.side === "Sell" ? "sell" : "buy",
          px: num(row.execPriceRp) ?? 0,
          sz: num(row.execQtyRq) ?? 0,
          at,
          closedPnl: num(row.closedPnlRv) ?? 0,
          fee: num(row.execFeeRv) ?? 0,
          dir: liquidation ? "Liquidation" : row.side === "Sell" ? "Sell" : "Buy",
          liquidation,
        })
      }
      if (rows.length < FILL_PAGE) break
    }
  }

  fills.sort((a, b) => a.at - b.at)
  return fills
}

export async function fetchPhemexOrderInfo(
  network: NetworkId,
  _address: string,
  orderId: string,
  marketId: string,
  credential: () => string | null
): Promise<WalletOrderInfo> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const row = await orderById(
    network,
    parsePhemexCredential(blob),
    marketId,
    orderId
  )
  if (!row) return { kind: "none", triggerPx: null }
  const ordType = typeNameOf(row)
  const kind = STOP_TYPES.has(ordType)
    ? ("stop" as const)
    : TARGET_TYPES.has(ordType)
      ? ("target" as const)
      : ("none" as const)
  const triggerPx = num(row.stopPxRp)
  return {
    kind,
    triggerPx: triggerPx !== null && triggerPx > 0 ? triggerPx : null,
  }
}
