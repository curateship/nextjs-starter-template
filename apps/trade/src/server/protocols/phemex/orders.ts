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
import { num } from "@/lib/protocols/phemex/translate"
import { snapToTick } from "@/lib/protocols/tick"
import {
  assertBracketValues,
  assertPlaceOrderValues,
  connectorErrors,
  decimalString,
  loadConnectorHeldPromise,
  orderCredential,
} from "@/server/protocols/connector-helpers"
import {
  clearPhemexAccountCache,
  phemexAccountPositions,
} from "@/server/protocols/phemex/account"
import {
  parsePhemexCredential,
  phemexPublic,
  phemexSigned,
} from "@/server/protocols/phemex/client"
import {
  dropIdlePhemexPrivateFeeds,
  phemexQuietSince,
} from "@/server/protocols/phemex/private-feed"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import { phemexRefusalError } from "@/server/protocols/phemex/refusals"
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

const { exchange: exchangeError, refused: refusedError } = connectorErrors({
  explain: (reason) => phemexRefusalError(reason).message,
  refusedWhen: (message) => message.startsWith("PHEMEX_"),
})

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
  const capped =
    side === "buy" ? px * (1 + MARKET_SLIPPAGE) : px * (1 - MARKET_SLIPPAGE)
  return snapToTick(capped, tick)
}

// ----- Position mode -------------------------------------------------------

/**
 * Which way this account keeps positions, and what that means for an order.
 *
 * **Phemex accounts come in two shapes and the wrong one is refused outright.**
 * A one-way account holds a single position per market and labels every order
 * `Merged`. A hedged account holds a long AND a short at once, and every
 * order must say which of the two it belongs to — `Merged` there comes back
 * as `TE_ERR_INCONSISTENT_POS_MODE`, which is what stopped an order placed on
 * the exchange's own website from being cancelled here.
 *
 * The mode is the account's to choose, not this app's. An earlier version
 * tried to switch accounts to one-way on first use; that is somebody else's
 * setting, it cannot change while a position is open, and it was silently
 * failing anyway. So the account is asked which mode it is in, and the app
 * speaks that.
 */
type PosMode = "OneWay" | "Hedged"

/** How long the account's mode stands before it is asked for again. */
const POS_MODE_GOOD_FOR_MS = 5 * 60_000

/**
 * What the account says about one market: which mode it is in, and what
 * leverage each side is currently running. The leverage is carried because a
 * hedged account will only accept BOTH sides at once when one is being
 * changed, and the other side must go back exactly as it was — it belongs to
 * a position this order has nothing to do with.
 */
type SymbolState = {
  mode: PosMode
  mergedRr: string | null
  longRr: string | null
  shortRr: string | null
}

const posModes = new Map<
  string,
  { at: number; bySymbol: Map<string, SymbolState> }
>()

async function symbolStateOf(
  network: NetworkId,
  address: string,
  blob: string,
  symbol: string
): Promise<SymbolState> {
  const key = `${network}:${parsePhemexCredential(blob).keyId}`
  const held = posModes.get(key)
  if (!held || Date.now() - held.at > POS_MODE_GOOD_FOR_MS) {
    const { positions } = await phemexAccountPositions(
      network,
      address,
      () => blob
    )
    const bySymbol = new Map<string, SymbolState>()
    for (const raw of positions) {
      const row = raw as {
        symbol?: unknown
        posMode?: unknown
        posSide?: unknown
        leverageRr?: unknown
      }
      if (typeof row.symbol !== "string") continue
      if (row.posMode !== "Hedged" && row.posMode !== "OneWay") continue
      const found = bySymbol.get(row.symbol) ?? {
        mode: row.posMode,
        mergedRr: null,
        longRr: null,
        shortRr: null,
      }
      found.mode = row.posMode
      // A hedged account sends one row per side, each carrying that side's
      // own leverage.
      const rr =
        typeof row.leverageRr === "string" || typeof row.leverageRr === "number"
          ? String(row.leverageRr)
          : null
      if (rr !== null && row.posSide === "Long") found.longRr = rr
      if (rr !== null && row.posSide === "Short") found.shortRr = rr
      if (rr !== null && row.posSide !== "Long" && row.posSide !== "Short") {
        found.mergedRr = rr
      }
      bySymbol.set(row.symbol, found)
    }
    posModes.set(key, { at: Date.now(), bySymbol })
  }
  // A market the account has never touched carries no row. Hedged is the
  // safer guess of the two: it names a side, and a one-way account tells us
  // so plainly rather than doing something unintended.
  return (
    posModes.get(key)?.bySymbol.get(symbol) ?? {
      mode: "Hedged",
      mergedRr: null,
      longRr: null,
      shortRr: null,
    }
  )
}

async function posModeOf(
  network: NetworkId,
  address: string,
  blob: string,
  symbol: string
): Promise<PosMode> {
  return (await symbolStateOf(network, address, blob, symbol)).mode
}

/**
 * Which position an order belongs to, in the exchange's words.
 *
 * On a hedged account the side alone does not say: a sell either opens a
 * short or closes a long, and only `reduceOnly` tells them apart. Opening
 * buys and closing sells belong to the Long; opening sells and closing buys
 * belong to the Short.
 */
function posSideFor(
  mode: PosMode,
  side: "buy" | "sell",
  reduceOnly: boolean
): "Merged" | "Long" | "Short" {
  if (mode === "OneWay") return "Merged"
  return (side === "buy") !== reduceOnly ? "Long" : "Short"
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
  // Words on most endpoints, NUMBERS on the by-currency order list — and a
  // schema that insisted on words threw every one of those rows away, so a
  // limit order placed on the exchange's own website never appeared here.
  side: z.union([z.string(), z.number()]).default(""),
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
 * Which way an order or a position goes, in the app's words.
 *
 * Phemex says this two ways: "Buy"/"Sell" on most endpoints, and 1/2 on the
 * by-currency order list. Both are read here so no caller has to know which
 * endpoint its row came from.
 */
function sideOf(side: string | number | undefined): "buy" | "sell" {
  if (typeof side === "number") return side === 2 ? "sell" : "buy"
  return String(side ?? "")
    .toLowerCase()
    .startsWith("s")
    ? "sell"
    : "buy"
}

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
      ? (data as { rows: unknown[] }).rows
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
  assertPlaceOrderValues(params)
  const credential = orderCredential(orderAuth, parsePhemexCredential)
  const rules = await symbolRules(network, params.marketId)

  const sz = floorToStep(params.sz, rules.qtyStepSize)
  if (!(sz > 0)) throw new Error("LIVE_SIZE_TOO_SMALL")

  const mode = await posModeOf(network, "", orderAuth.agentKey, params.marketId)

  if (params.leverage !== null) {
    // Set only when opening fresh — the caller already sends null when the
    // position exists. Positive is isolated margin: the trade's stake is all
    // it can lose, which is the promise the app's screens make.
    //
    // **A hedged account names the side here too.** It holds a long and a
    // short at once, each with its own leverage, so it has its own field for
    // each and refuses the one-way field outright — `TE_ERR_INCONSISTENT_POS_
    // MODE`, thrown before the order is even looked at. That refusal is what
    // stopped a plain "buy $100 of Bitcoin" on 20 Aug 2026, and it looked
    // exactly like the order being rejected rather than the leverage.
    //
    // **Both sides go together or neither does.** The exchange says so
    // outright — "longLeverageRr and shortLeverageRr must exist or not exist
    // at the same time" — so the side NOT being opened is sent back exactly
    // as it already is, read from the same account snapshot that told us the
    // mode. Sending the asked-for number for both would quietly change the
    // leverage on the other side's open position, which moves where it gets
    // liquidated.
    const forSide = posSideFor(mode, params.side, params.reduceOnly)
    const state = await symbolStateOf(
      network,
      "",
      orderAuth.agentKey,
      params.marketId
    )
    // **Phemex writes the margin mode into the sign of the leverage.**
    // Positive is isolated — the trade's stake is all it can lose — and
    // NEGATIVE is cross, where the whole balance backs the position. The two
    // sides of a hedged symbol must be in the same mode as each other, and
    // the exchange refuses the pair outright when they are not: `39108
    // invalid leverages`, thrown before the order is looked at.
    //
    // Measured on the real account on 20 Aug 2026. ADA sat on cross (`-3`
    // long, `-1` short). Sending `1` for the long and leaving the short at
    // `-1` was refused; sending `-1` and `-1` was accepted; sending the
    // existing pair back unchanged was accepted. So the mode belongs to the
    // account and the app follows it — a watched order fired every few
    // seconds for ten minutes and was refused every time, because this asked
    // for isolated on an account set to cross.
    //
    // Changing somebody's margin mode for them is not this code's business:
    // it decides where a position gets liquidated, and they set it on the
    // exchange deliberately.
    const cross = (state.longRr ?? state.shortRr ?? "").startsWith("-")
    const asked = Math.abs(params.leverage)
    const leverageRr = decimalString(cross ? -asked : asked, {
      allowNegative: true,
    })
    const bothSides = {
      longLeverageRr:
        forSide === "Long" ? leverageRr : (state.longRr ?? leverageRr),
      shortLeverageRr:
        forSide === "Short" ? leverageRr : (state.shortRr ?? leverageRr),
    }
    try {
      await phemexSigned(network, credential, "PUT", "/g-positions/leverage", {
        symbol: params.marketId,
        ...(mode === "Hedged" ? bothSides : { leverageRr }),
      })
    } catch (error) {
      throw refusedError(error)
    }
  }

  const isMarket = params.kind === "market"
  const px = isMarket
    ? cappedPx(params.side, params.px, rules.tickSize)
    : snapToTick(params.px, rules.tickSize)
  if (!(px > 0)) throw new Error("LIVE_PRICE")

  const query: Record<string, string | number | boolean> = {
    clOrdID: randomUUID(),
    symbol: params.marketId,
    side: params.side === "buy" ? "Buy" : "Sell",
    posSide: posSideFor(mode, params.side, params.reduceOnly),
    ordType: "Limit",
    priceRp: decimalString(px),
    orderQtyRq: decimalString(sz, { errorCode: "LIVE_SIZE" }),
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
    query.takeProfitRp = decimalString(snapToTick(params.tpPx, rules.tickSize))
    query.tpTrigger = "ByMarkPrice"
  }
  if (params.slPx !== null) {
    query.stopLossRp = decimalString(snapToTick(params.slPx, rules.tickSize))
    query.slTrigger = "ByMarkPrice"
  }

  let placed: OrderRow
  try {
    const answer = await phemexSigned(
      network,
      credential,
      "PUT",
      "/g-orders/create",
      query
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
        throw new Error(
          "LIVE_ORDER_REFUSED:The order missed and was cancelled."
        )
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

/**
 * Cancelling one order, whichever mode the account is in.
 *
 * A hedged account wants the side the order belongs to, and a cancel does not
 * carry one — the app knows an order by its market and its id. So the mode is
 * asked first, and on a hedged account the Long is tried and then the Short.
 * "No such order" is the exchange telling us to look on the other side, not a
 * failure; anything else is reported as it is.
 */
async function cancelOne(
  network: NetworkId,
  credential: { keyId: string; secret: string },
  blob: string,
  marketId: string,
  orderId: string
): Promise<void> {
  const mode = await posModeOf(network, "", blob, marketId)
  const sides = mode === "OneWay" ? ["Merged"] : ["Long", "Short"]
  let lastMissing: unknown = null
  for (const posSide of sides) {
    try {
      await phemexSigned(network, credential, "DELETE", "/g-orders/cancel", {
        symbol: marketId,
        orderID: orderId,
        posSide,
      })
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      // 10002 is the venue's "no order by that id here".
      if (message.startsWith("PHEMEX_10002")) {
        lastMissing = error
        continue
      }
      throw error
    }
  }
  if (lastMissing) throw lastMissing
}

export async function cancelPhemexOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  try {
    await cancelOne(
      network,
      orderCredential(orderAuth, parsePhemexCredential),
      orderAuth.agentKey,
      params.marketId,
      params.orderId
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
      orderCredential(orderAuth, parsePhemexCredential),
      "PUT",
      "/g-orders/replace",
      {
        symbol: params.marketId,
        orderID: params.orderId,
        priceRp: decimalString(snapToTick(params.px, rules.tickSize)),
        orderQtyRq: decimalString(sz, { errorCode: "LIVE_SIZE" }),
        posSide: posSideFor(
          await posModeOf(network, "", orderAuth.agentKey, params.marketId),
          params.side,
          params.reduceOnly
        ),
      }
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

// ----- Leverage and margin on an open position ----------------------------

export async function setPhemexLeverage(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; leverage: number; szi: number }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  if (params.szi === 0) throw new Error("LIVE_POSITION_GONE")
  // Phemex requires both hedged sides in one request. Read them again here so
  // a recent change made on Phemex is never overwritten by a held answer.
  clearPhemexAccountCache()
  posModes.clear()
  const state = await symbolStateOf(
    network,
    "",
    orderAuth.agentKey,
    params.marketId
  )
  const asked = Math.max(1, Math.round(params.leverage))
  const current =
    state.mode === "OneWay"
      ? state.mergedRr
      : params.szi > 0
        ? state.longRr
        : state.shortRr
  if (current === null) {
    throw new Error(
      "LIVE_LEVERAGE:Phemex did not state this position's current leverage, so Trade cannot keep its margin mode unchanged. Refresh the account and try again."
    )
  }
  const cross = current.startsWith("-")
  const leverageRr = decimalString(cross ? -asked : asked, {
    allowNegative: true,
  })
  const forSide = params.szi > 0 ? "Long" : "Short"

  try {
    await phemexSigned(
      network,
      orderCredential(orderAuth, parsePhemexCredential),
      "PUT",
      "/g-positions/leverage",
      {
        symbol: params.marketId,
        ...(state.mode === "OneWay"
          ? { leverageRr }
          : {
              longLeverageRr:
                forSide === "Long" ? leverageRr : (state.longRr ?? leverageRr),
              shortLeverageRr:
                forSide === "Short"
                  ? leverageRr
                  : (state.shortRr ?? leverageRr),
            }),
      }
    )
  } catch (error) {
    throw exchangeError(error)
  }
  clearPhemexAccountCache()
  posModes.clear()
}

export async function adjustPhemexMargin(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; szi: number; dollars: number }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  if (params.szi === 0) throw new Error("LIVE_POSITION_GONE")
  if (!Number.isFinite(params.dollars) || params.dollars === 0) {
    throw new Error("LIVE_MARGIN_NOTHING")
  }

  clearPhemexAccountCache()
  const { positions } = await phemexAccountPositions(
    network,
    "",
    () => orderAuth.agentKey
  )
  const wantedSide = params.szi > 0 ? "Long" : "Short"
  const raw = positions.find((value) => {
    const row = value as {
      symbol?: unknown
      posMode?: unknown
      posSide?: unknown
      side?: unknown
      sizeRq?: unknown
    }
    const size = num(row.sizeRq)
    const sideMatches =
      row.posMode !== "OneWay" ||
      (params.szi > 0
        ? sideOf(row.side as string) === "buy"
        : sideOf(row.side as string) === "sell")
    return (
      row.symbol === params.marketId &&
      size !== null &&
      size > 0 &&
      sideMatches &&
      (row.posMode === "OneWay" || row.posSide === wantedSide)
    )
  }) as { positionMarginRv?: unknown; posMode?: unknown } | undefined
  const current = num(raw?.positionMarginRv)
  if (current === null) throw new Error("LIVE_POSITION_GONE")
  const target = current + params.dollars
  if (!(target > 0)) throw new Error("LIVE_MARGIN_TOO_MUCH")

  try {
    await phemexSigned(
      network,
      orderCredential(orderAuth, parsePhemexCredential),
      "POST",
      "/g-positions/assign",
      {
        symbol: params.marketId,
        posSide: raw?.posMode === "OneWay" ? "Merged" : wantedSide,
        posBalanceRv: decimalString(target),
      }
    )
  } catch (error) {
    throw exchangeError(error)
  }
  clearPhemexAccountCache()
  posModes.clear()
}

// ----- Brackets -------------------------------------------------------------

export async function setPhemexBrackets(
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
  // Every stop this file places carries `closeOnTrigger`, and it is not yet
  // proven whether Phemex honours a smaller `orderQtyRq` beside that flag or
  // closes the whole position anyway. Until a real-exchange test answers
  // that, a fixed-size stop here could sell coins it promised to leave alone
  // — so it is refused outright rather than placed on hope. The pairing gate
  // upstream already keeps grid-above-ladder off Phemex wallets; this is the
  // door bolted from the inside as well.
  if (params.slSz !== null) throw new Error("LIVE_SIZED_STOP_UNSUPPORTED")
  const credential = orderCredential(orderAuth, parsePhemexCredential)
  const rules = await symbolRules(network, params.marketId)
  const size = Math.abs(params.position.szi)
  if (!(size > 0)) throw new Error("LIVE_POSITION_GONE")
  const exitSide = params.position.szi > 0 ? "Sell" : "Buy"
  // A stop or a target only ever reduces, so it belongs to the very position
  // it guards — the long on a long, the short on a short. On a one-way
  // account this is simply "Merged" and the distinction does not arise.
  const legPosSide = posSideFor(
    await posModeOf(network, "", orderAuth.agentKey, params.marketId),
    params.position.szi > 0 ? "sell" : "buy",
    true
  )

  const placeLeg = async (leg: {
    ordType: "Stop" | "MarketIfTouched"
    triggerPx: number
    sz: number
  }) => {
    await phemexSigned(network, credential, "PUT", "/g-orders/create", {
      clOrdID: randomUUID(),
      symbol: params.marketId,
      side: exitSide,
      posSide: legPosSide,
      ordType: leg.ordType,
      stopPxRp: decimalString(snapToTick(leg.triggerPx, rules.tickSize)),
      orderQtyRq: decimalString(floorToStep(leg.sz, rules.qtyStepSize), {
        errorCode: "LIVE_SIZE",
      }),
      triggerType: "ByMarkPrice",
      timeInForce: "ImmediateOrCancel",
      reduceOnly: true,
      closeOnTrigger: true,
    })
  }

  const landed: string[] = []
  try {
    if (params.slPx !== null) {
      await placeLeg({ ordType: "Stop", triggerPx: params.slPx, sz: size })
      landed.push(`stop at ${params.slPx}`)
    }
    for (const target of params.targets) {
      await placeLeg({
        ordType: "MarketIfTouched",
        triggerPx: target.px,
        sz: target.sz ?? size,
      })
      landed.push(`target at ${target.px}`)
    }
  } catch (error) {
    throw new Error(
      `LIVE_BRACKET_REPLACE_PARTIAL:The old protection is still on.${landed.length > 0 ? ` The new ${landed.join(" and ")} also went on.` : ""} The replacement was refused: ${scrubbedMessage(error)}`
    )
  }

  // Every new leg is standing before an old one is touched. Phemex allows 20
  // conditional orders per market, so the largest replacement uses eight for
  // the brief overlap: four old and four new.
  for (const orderId of new Set(params.position.protectionOrderIds)) {
    if (!orderId) continue
    try {
      await phemexSigned(network, credential, "DELETE", "/g-orders/cancel", {
        symbol: params.marketId,
        orderID: orderId,
        posSide: legPosSide,
      })
    } catch (error) {
      throw new Error(
        `LIVE_BRACKET_REPLACE_DOUBLED:${landed.length > 0 ? `The new ${landed.join(" and ")} is on, but` : "Nothing new was requested, and"} an old protection order could not be cancelled: ${scrubbedMessage(error)}`
      )
    }
  }
  // Phemex's create answer is not captured leg by leg, and nothing here needs
  // the whole-position stop's id — only a sized stop's owner does, and sized
  // stops are refused above.
  return { slOrderId: null }
}

/**
 * Empties the short-lived answer caches. Tests drive their own time, and a
 * two-second answer carried from one case into the next would make them lie
 * to each other — the same reason `clearMarketRulesCache` exists.
 */
export function clearPhemexOrderCaches(): void {
  openOrdersCache.clear()
  fillsCache.clear()
  // What the account said about each market's mode and leverage is held for
  // five minutes too, and a held answer from one test is a wrong answer in
  // the next.
  posModes.clear()
}

// ----- Reading the account back ---------------------------------------------

/**
 * One row of the account's position read.
 *
 * **The size field is `sizeRq`, and getting that wrong cost a whole day.**
 * This schema asked for `size`, which the endpoint does not send — so every
 * row read as size zero, every position was skipped, and the app showed
 * "Positions 0" while Phemex held real coin. Nothing said so: an optional
 * field that is absent is not an error, it is just nought.
 *
 * The damage went further than a wrong screen. A watched order learns that
 * its buy filled by seeing the position appear; with no position ever
 * appearing it kept waiting, and each failed pass rolled it back to unspent,
 * so it bought again. That is how one XRP watch bought 78.76 coins in two
 * goes on 20 Aug 2026 when it was asked for 39.
 *
 * Every name here is copied from a real row rather than a document.
 */
const positionSchema = z.object({
  symbol: z.string(),
  side: z.union([z.string(), z.number()]).optional(),
  sizeRq: z.union([z.string(), z.number()]).optional(),
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
 * How many pages any paged read here may walk before it stops.
 *
 * **A page loop with no ceiling is worse than a slow one.** Every request
 * answers perfectly well, so no deadline ever fires; if the exchange keeps
 * handing back a full page — because it ignored the offset, or because the
 * account has more history than a screen needs — the loop runs forever,
 * holding its caller open and hammering the exchange. A reconcile that never
 * returned was exactly this, and it froze the two panels that wait on it.
 *
 * Five thousand rows is far past anything these screens read, so stopping
 * there is a bound rather than a truncation anyone will notice.
 */
const MAX_PAGES = 25

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
  const seen = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await phemexSigned(
      network,
      credential,
      "GET",
      "/exchange/order/v2/orderList",
      { ...params, offset: page * ORDER_LIST_PAGE, limit: ORDER_LIST_PAGE }
    )
    const back = rowsOf(answer)
    // An exchange that ignores the offset hands back the same page forever.
    // Keeping only rows never seen turns that into a stop rather than a loop
    // with no end.
    const fresh = back.filter((row) => !seen.has(idOf(row)))
    for (const row of fresh) seen.add(idOf(row))
    rows.push(...fresh)
    if (back.length < ORDER_LIST_PAGE || fresh.length === 0) break
  }
  return rows
}

/** The open-order list is asked for as often as the account is, and shared
 * for the same reason and the same two seconds. */
const OPEN_ORDERS_GOOD_FOR_MS = 2_000

const openOrdersCache = new Map<
  string,
  { at: number; answer: Promise<OrderRow[]> }
>()

/**
 * The longest an answer is held on the socket's word alone.
 *
 * **A ceiling, not a target.** The line in `private-feed.ts` is trustworthy
 * enough that in principle an answer could stand until it says otherwise. In
 * principle is not good enough for money: if Phemex ever accepts a
 * subscription and then quietly stops sending order events while still
 * answering the heartbeat, nothing else would notice. Two minutes bounds that
 * to two minutes, and it still turns a read every two seconds into a read
 * every two minutes on an account where nothing is happening.
 */
const HOLD_WHILE_QUIET_MS = 2 * 60_000

async function openOrders(
  network: NetworkId,
  credential: { keyId: string; secret: string },
  /** The ciphertext-holding thunk, so the socket never keeps a plaintext. */
  blob: () => string | null
): Promise<OrderRow[]> {
  const key = `${network}:${credential.keyId}`
  return loadConnectorHeldPromise(
    openOrdersCache,
    key,
    {
      network,
      keyId: credential.keyId,
      credential: blob,
      goodForMs: OPEN_ORDERS_GOOD_FOR_MS,
      maximumMs: HOLD_WHILE_QUIET_MS,
      quietSince: phemexQuietSince,
    },
    () =>
      orderListPages(network, credential, {
        currency: "USDT",
        ordStatus: "1,5,6",
      })
  )
}

export async function fetchPhemexPortfolio(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<WalletPortfolio> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parsePhemexCredential(blob)
  // Swept from the pass that reads a portfolio rather than on a timer of its
  // own, which would keep the socket module alive in a process that has
  // finished with it.
  dropIdlePhemexPrivateFeeds()

  const [{ positions: rawPositions }, orders] = await Promise.all([
    phemexAccountPositions(network, address, () => blob),
    openOrders(network, parsed, credential),
  ])

  const openBySymbol = new Map<string, OrderRow[]>()
  for (const row of orders) {
    const list = openBySymbol.get(row.symbol) ?? []
    list.push(row)
    openBySymbol.set(row.symbol, list)
  }

  const protectionIds = new Set<string>()
  const positions: WalletPosition[] = []
  for (const raw of rawPositions) {
    const row = positionSchema.safeParse(raw)
    if (!row.success) continue
    const size = num(row.data.sizeRq) ?? 0
    if (!(size > 0)) continue
    const szi = sideOf(row.data.side) === "sell" ? -size : size

    // The protection legs are the untriggered exit orders sitting on the
    // same symbol: a stop-family order guards the downside, a touched-family
    // one takes the profit. Their ids are what `setBrackets` replaces.
    // Sorted by id, so a position carrying more than one stop names the same
    // one on every read instead of flipping between them. By id and not by
    // time because the order id is the only thing here that never changes;
    // the point is that the answer holds still, not which leg wins.
    const legs = (openBySymbol.get(row.data.symbol) ?? [])
      .filter((one) => statusNameOf(one) === "Untriggered")
      .sort((left, right) => idOf(left).localeCompare(idOf(right)))
    const protection = legs.filter((one) => {
      const type = typeNameOf(one)
      return STOP_TYPES.has(type) || TARGET_TYPES.has(type)
    })
    for (const leg of protection) {
      const id = idOf(leg)
      if (id) protectionIds.add(id)
    }
    const stop = protection.find((one) => STOP_TYPES.has(typeNameOf(one)))
    const targets = protection
      .filter((one) => TARGET_TYPES.has(typeNameOf(one)))
      .map((target) => ({
        px: num(target.stopPxRp),
        sz: (() => {
          const legSz = num(target.orderQtyRq)
          if (legSz === null) return null
          return legSz < size * (1 - 1e-6) ? legSz : null
        })(),
        orderId: idOf(target) || null,
      }))
      .filter(
        (
          target
        ): target is {
          px: number
          sz: number | null
          orderId: string | null
        } => target.px !== null
      )
      .sort((left, right) => left.px - right.px)
    const target = targets[0] ?? null

    positions.push({
      marketId: row.data.symbol,
      szi,
      entryPx: num(row.data.avgEntryPriceRp) ?? 0,
      leverage: Math.abs(num(row.data.leverageRr) ?? 1),
      marginUsed: num(row.data.positionMarginRv) ?? 0,
      liquidationPx: num(row.data.liquidationPriceRp),
      targets,
      tpPx: target?.px ?? null,
      tpSz: target?.sz ?? null,
      slPx: stop ? num(stop.stopPxRp) : null,
      tpOrderId: target?.orderId ?? null,
      slOrderId: stop ? idOf(stop) || null : null,
      // Every untriggered leg on this market, not only the two picked above,
      // because `setBrackets` has to cancel all of them — see
      // `protectionOrderIds`.
      protectionOrderIds: protection.map((one) => idOf(one)).filter(Boolean),
    })
  }

  const walletOrders: WalletOpenOrder[] = orders
    .filter((row) => !protectionIds.has(idOf(row)))
    .map((row) => {
      const trigger = statusNameOf(row) === "Untriggered"
      const sz = Math.max(
        0,
        (num(row.orderQtyRq) ?? 0) - (num(row.cumQtyRq) ?? 0)
      )
      return {
        orderId: idOf(row),
        marketId: row.symbol,
        side: sideOf(row.side),
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
 * How far back a FIRST sweep reaches, when the app has no fill of its own to
 * count from.
 *
 * Asking an exchange for all of history, per symbol, is the slowest thing
 * this connector can do — and on a newly added wallet that is exactly what
 * "since the beginning" means. A month is more than the Journal shows at a
 * glance, and it finishes.
 */
const FIRST_SWEEP_MS = 30 * 24 * 3_600_000

/**
 * Every trade the account made since the watermark.
 *
 * Phemex only answers trades PER SYMBOL, so the symbols are discovered
 * first: every order the account touched in the window (the by-currency
 * order list) plus every symbol it holds. A trade on a symbol with no order
 * and no position in the window cannot exist — an execution IS an order.
 */
/**
 * How long one fills answer stands in for the next, and how many coins one
 * sweep asks about.
 *
 * **Phemex answers trades one coin at a time.** Every other venue here
 * answers the whole account in one call, so the engine asks for fills on
 * every pass without thinking about it — and on Phemex that same habit
 * became a request per coin the account has ever touched, several times a
 * minute, until the exchange started refusing the key altogether and the
 * wallet card said it could not be reached.
 *
 * Sharing one answer for a few seconds collapses the engine's ask and the
 * screen's into one, and a ceiling on coins keeps a long history from
 * turning one sweep into fifty requests. Older trades are not lost — they
 * are read on later sweeps, oldest watermark first.
 */
const FILLS_GOOD_FOR_MS = 10_000
const SYMBOLS_PER_SWEEP = 8

const fillsCache = new Map<
  string,
  { at: number; answer: Promise<WalletOrderFill[]> }
>()

export async function fetchPhemexOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  credential: () => string | null
): Promise<WalletOrderFill[]> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parsePhemexCredential(blob)
  const key = `${network}:${parsed.keyId}:${Math.floor(since / 60_000)}`
  // The expensive one. A sweep is an order list plus a separate read for every
  // coin held, and on an account where nothing has filled it finds nothing,
  // every ten seconds, for ever.
  return loadConnectorHeldPromise(
    fillsCache,
    key,
    {
      network,
      keyId: parsed.keyId,
      credential,
      goodForMs: FILLS_GOOD_FOR_MS,
      maximumMs: HOLD_WHILE_QUIET_MS,
      quietSince: phemexQuietSince,
    },
    () => readPhemexFills(network, address, since, credential)
  )
}

async function readPhemexFills(
  network: NetworkId,
  address: string,
  since: number,
  credential: () => string | null
): Promise<WalletOrderFill[]> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parsePhemexCredential(blob)
  const end = Date.now()
  // A watermark of zero is a wallet that has never been swept, not a request
  // for everything the venue remembers.
  const from = since > 0 ? since : end - FIRST_SWEEP_MS

  const symbols = new Set<string>()
  const [{ positions }, touched] = await Promise.all([
    phemexAccountPositions(network, address, () => blob),
    // The per-symbol history endpoint cannot say which symbols exist, and
    // the account-wide one refuses without a symbol — the by-currency order
    // list is the one read that names every market the account touched.
    orderListPages(network, parsed, {
      currency: "USDT",
      start: Math.max(0, from),
    }).catch(() => null),
  ])
  // **Only coins actually held.** Phemex answers this account with a row for
  // every market it has ever touched — 134 of them on 20 Aug 2026, nearly all
  // long closed and sitting at nought. Adding them all made one sweep ask
  // about 134 coins, which is both the burst that gets the key rationed and
  // the reason a single dead market could break everything: one of those
  // symbols answers 400, and the whole sweep threw. Phemex fills stopped
  // being recorded at 16:27 that day and nothing said so.
  for (const raw of positions) {
    const row = positionSchema.safeParse(raw)
    if (!row.success) continue
    if (!((num(row.data.sizeRq) ?? 0) > 0)) continue
    if (symbols.size >= SYMBOLS_PER_SWEEP) break
    symbols.add(row.data.symbol)
  }
  // Coins held come first — they are the ones a trade can still be made on —
  // then the most recently touched, up to the ceiling.
  for (const row of touched ?? []) {
    if (symbols.size >= SYMBOLS_PER_SWEEP) break
    symbols.add(row.symbol)
  }

  /**
   * How many symbols are asked about at once.
   *
   * Phemex answers trades per symbol, so a wallet that has touched a dozen
   * coins is a dozen round trips — one after another, that was most of the
   * time this sweep took. A handful at a time is quick without becoming the
   * burst that gets a key rationed.
   */
  const AT_A_TIME = 4
  const fills: WalletOrderFill[] = []
  const queue = [...symbols]

  const walkOne = async (symbol: string) => {
    const seenFills = new Set<string>()
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * FILL_PAGE
      const answer = await phemexSigned(
        network,
        parsed,
        "GET",
        "/api-data/g-futures/trades",
        {
          symbol,
          start: Math.max(0, from),
          end,
          offset,
          limit: FILL_PAGE,
        }
      )
      const rows = ((answer as { rows?: unknown[] })?.rows ?? [])
        .map((row) => fillSchema.safeParse(row))
        .filter((row) => row.success)
        .map((row) => row.data)

      // The same guard the order list uses: a page carrying nothing new
      // means the exchange is not advancing, and the walk stops.
      const fresh = rows.filter(
        (row) => !seenFills.has(row.execID ?? row.execId ?? "")
      )
      for (const row of fresh) seenFills.add(row.execID ?? row.execId ?? "")

      for (const row of fresh) {
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
          dir: liquidation
            ? "Liquidation"
            : row.side === "Sell"
              ? "Sell"
              : "Buy",
          liquidation,
        })
      }
      if (rows.length < FILL_PAGE || fresh.length === 0) break
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(AT_A_TIME, queue.length) }, async () => {
      for (let symbol = queue.pop(); symbol; symbol = queue.pop()) {
        // **One coin's refusal must not lose the other coins' trades.** This
        // endpoint answers per symbol, and a market Phemex will no longer
        // answer for — delisted, renamed — replies 400. Letting that through
        // threw away the whole sweep, so a real fill on a live coin never
        // reached the Journal and no arrow was ever drawn for it. Whatever
        // this symbol was hiding is read again on the next sweep.
        await walkOne(symbol).catch((error) => {
          console.error(`Phemex fills refused for ${symbol}`, error)
        })
      }
    })
  )

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
