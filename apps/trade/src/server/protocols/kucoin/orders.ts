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
import {
  coinsOf,
  lotsOf,
  num,
  type KucoinLotRule,
} from "@/lib/protocols/kucoin/translate"
import { snapToTick } from "@/lib/protocols/tick"
import {
  isKucoinCredentialRefusal,
  kucoinSigned,
  parseKucoinCredential,
  type KucoinCredential,
} from "@/server/protocols/kucoin/client"
import {
  kucoinMarketOrderLimit,
  kucoinMarketRules,
} from "@/server/protocols/kucoin/markets"
import {
  dropIdleKucoinPrivateFeeds,
  kucoinQuietSince,
} from "@/server/protocols/kucoin/private-feed"
import { clearVenueTouched } from "@/server/protocols/touched"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import { kucoinRefusalError } from "@/server/protocols/kucoin/refusals"
import { scrubbedMessage } from "@/server/protocols/scrub"

/**
 * Real orders against KuCoin Futures — the one file in this folder that
 * changes an account.
 *
 * The rules it keeps, in the order they bite:
 *
 * - **The real-money gate is called first, always**, and it is doubly
 *   load-bearing here: KuCoin has no practice network, so this gate is the
 *   only thing between a click and money.
 * - **Sizes are whole contracts.** The app speaks coins; KuCoin trades lots
 *   of `multiplier` coins each. Every size is floored to a legal lot, and an
 *   order that floors to nothing is refused out loud rather than sent as a
 *   surprise nothing.
 * - **A "market" order is a capped IOC limit**, sent no more than 3% through
 *   the asked price and kept inside KuCoin's live per-market boundary, so a
 *   thin book cannot fill far away or reject a legal trigger because its
 *   allowed band is narrower.
 * - **Protection is a separate order book.** A stop or a target is an
 *   untriggered order of its own, triggered on the mark price to match how
 *   the other venues trigger, and read back from `/stopOrders`.
 * - **Nothing retries.** A rate-limited mutate throws `EXCHANGE_BUSY`; a
 *   retried order is a possible double order.
 *
 * **The one behavioural difference from the other exchanges**: KuCoin has no
 * amend-an-order call, so moving an order is two orders' worth of work. The
 * new one goes on FIRST and the old one comes off after, so the level is
 * covered twice for a moment rather than left empty. `modify` says so where it
 * does it; `workspace/docs/rules/trading-rules.md` states the rule and what the
 * doubled moment can cost.
 */

const MARKET_SLIPPAGE = 0.03
/** Room for KuCoin's moving boundary between the public read and signed act. */
const MARKET_LIMIT_HEADROOM = 0.001

/** How a just-placed order's outcome is chased before the sweep tells it. */
const PLACE_POLLS = 3
const PLACE_POLL_WAIT_MS = 400

// ----- Small shared pieces -------------------------------------------------

function auth(orderAuth: OrderAuth): KucoinCredential {
  return parseKucoinCredential(orderAuth.agentKey)
}

/** An exchange refusal as a thrown, scrubbed, code-prefixed error. */
function exchangeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "EXCHANGE_BUSY") return new Error("EXCHANGE_BUSY")
  if (isKucoinCredentialRefusal(error)) return new Error("LIVE_WALLET_KEY")
  const reason = scrubbedMessage(error)
  return new Error(`LIVE_EXCHANGE:${kucoinRefusalError(reason).message}`)
}

/** A refusal at the door — nothing was placed. Carries that promise as its code. */
function refusedError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "EXCHANGE_BUSY") return new Error("EXCHANGE_BUSY")
  if (isKucoinCredentialRefusal(error)) return new Error("LIVE_WALLET_KEY")
  if (message.startsWith("KUCOIN_")) {
    const reason = scrubbedMessage(error)
    return new Error(`LIVE_ORDER_REFUSED:${kucoinRefusalError(reason).message}`)
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

/** The capped price a "market" order is really sent at. */
function cappedPx(
  side: "buy" | "sell",
  px: number,
  tick: number | null,
  exchangeLimit: number
): number {
  const slippageCap =
    side === "buy" ? px * (1 + MARKET_SLIPPAGE) : px * (1 - MARKET_SLIPPAGE)
  const safeExchangeLimit =
    side === "buy"
      ? exchangeLimit * (1 - MARKET_LIMIT_HEADROOM)
      : exchangeLimit * (1 + MARKET_LIMIT_HEADROOM)
  const capped =
    side === "buy"
      ? Math.min(slippageCap, safeExchangeLimit)
      : Math.max(slippageCap, safeExchangeLimit)
  const snapped = snapToTick(capped, tick)
  if (tick === null || !(tick > 0)) return snapped
  // A coarse tick can round the headroom back onto or through the boundary.
  // Move one whole legal tick inward in that case instead of trusting the
  // nearest-tick rounding KuCoin requires for ordinary prices.
  if (side === "buy" && snapped >= exchangeLimit) {
    return snapToTick(exchangeLimit - tick, tick)
  }
  if (side === "sell" && snapped <= exchangeLimit) {
    return snapToTick(exchangeLimit + tick, tick)
  }
  return snapped
}

/**
 * Which way an untriggered order must be crossed to fire.
 *
 * KuCoin says "up" or "down" rather than "stop" or "target", so what a leg
 * MEANS depends on the position it guards: on a long, the exit is a sell, and
 * a sell that fires on the way down is the stop while one that fires on the
 * way up is the target. On a short both are the other way round. Getting this
 * backwards would arm a stop where the profit was meant to be, so it is one
 * function and it is tested.
 */
export function triggerDirection(
  leg: "stop" | "target",
  long: boolean
): "up" | "down" {
  if (leg === "stop") return long ? "down" : "up"
  return long ? "up" : "down"
}

/** Which leg an untriggered order is, read back off a position it guards. */
function legOf(
  stop: string | undefined,
  long: boolean
): "stop" | "target" | null {
  if (stop !== "up" && stop !== "down") return null
  return triggerDirection("stop", long) === stop ? "stop" : "target"
}

// ----- Reading orders back -------------------------------------------------

const orderRowSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: z.string().optional(),
  type: z.string().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  size: z.union([z.string(), z.number()]).optional(),
  filledSize: z.union([z.string(), z.number()]).optional(),
  dealSize: z.union([z.string(), z.number()]).optional(),
  dealValue: z.union([z.string(), z.number()]).optional(),
  filledValue: z.union([z.string(), z.number()]).optional(),
  value: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
  isActive: z.boolean().optional(),
  cancelExist: z.boolean().optional(),
  reduceOnly: z.boolean().optional(),
  closeOrder: z.boolean().optional(),
  stop: z.string().optional(),
  stopPrice: z.union([z.string(), z.number()]).optional(),
  stopPriceType: z.string().optional(),
  stopTriggered: z.boolean().optional(),
})

type OrderRow = z.infer<typeof orderRowSchema>

/** How many rows one page of a paged list carries. */
const PAGE_SIZE = 200

/**
 * How many pages any paged read may walk before it stops. A loop with no
 * ceiling is worse than a slow one: every request answers fine, so no
 * deadline fires, and an exchange that keeps handing back a full page holds
 * its caller open forever.
 */
const MAX_PAGES = 25

/** A paged list walked to the end — a truncated read is a missing stop. */
async function pagedItems(
  network: NetworkId,
  credential: KucoinCredential,
  path: string,
  params: Record<string, string | number | boolean> = {}
): Promise<unknown[]> {
  const items: unknown[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = (await kucoinSigned(network, credential, "GET", path, {
      ...params,
      currentPage: page,
      pageSize: PAGE_SIZE,
    })) as { items?: unknown; totalPage?: number } | null
    const rows = Array.isArray(answer?.items) ? answer.items : []
    items.push(...rows)
    const totalPage = answer?.totalPage ?? 1
    if (rows.length === 0 || page >= totalPage) break
  }
  return items
}

function orderRows(rows: unknown[]): OrderRow[] {
  return rows
    .map((row) => orderRowSchema.safeParse(row))
    .filter((row) => row.success)
    .map((row) => row.data)
}

/** Rows the exchange still holds, never completed stop-order history. */
function activeOrderRows(rows: unknown[]): OrderRow[] {
  return orderRows(rows).filter(
    (row) => row.isActive !== false && row.status?.toLowerCase() !== "done"
  )
}

async function orderById(
  network: NetworkId,
  credential: KucoinCredential,
  orderId: string
): Promise<OrderRow | null> {
  const answer = await kucoinSigned(
    network,
    credential,
    "GET",
    `/api/v1/orders/${encodeURIComponent(orderId)}`
  )
  const parsed = orderRowSchema.safeParse(answer)
  return parsed.success ? parsed.data : null
}

/** Confirm that KuCoin kept a newly placed stop in its working stop book. */
async function stopOrderIsActive(
  network: NetworkId,
  credential: KucoinCredential,
  marketId: string,
  orderId: string
): Promise<boolean> {
  for (let poll = 0; poll < PLACE_POLLS; poll += 1) {
    const row = orderRows(
      await pagedItems(network, credential, "/api/v1/stopOrders", {
        symbol: marketId,
        status: "active",
      })
    ).find((one) => one.id === orderId)
    if (row) {
      return row.isActive !== false && row.status?.toLowerCase() !== "done"
    }
    if (poll < PLACE_POLLS - 1) {
      await new Promise((resolve) => setTimeout(resolve, PLACE_POLL_WAIT_MS))
    }
  }
  return false
}

// ----- Placing --------------------------------------------------------------

type PlacedLeg = { orderId: string }

/** One order body sent, and its id back. Never retried. */
/**
 * Which margin mode a market is set to on this account, and how long that
 * answer stands.
 *
 * **The order has to name it.** KuCoin keeps this per market — cross, where
 * the whole balance backs the position, or isolated, where only what is put
 * behind the trade can be lost. An order that says nothing is treated as
 * isolated, and on a market set to cross the exchange refuses it outright:
 * `330005 The order's margin mode does not match the selected one`. That is
 * what stopped a plain buy on 20 Aug 2026.
 *
 * The account's own setting is sent back rather than a preference of ours.
 * Changing somebody's margin mode from inside an order is not a thing this
 * app should do quietly: it decides how much of the balance is at risk.
 */
const MARGIN_MODE_GOOD_FOR_MS = 5 * 60_000

type MarginMode = "CROSS" | "ISOLATED"

const marginModes = new Map<string, { at: number; mode: MarginMode }>()

async function marginModeOf(
  network: NetworkId,
  credential: KucoinCredential,
  symbol: string
): Promise<MarginMode> {
  const key = `${network}:${credential.keyId}:${symbol}`
  const held = marginModes.get(key)
  if (held && Date.now() - held.at < MARGIN_MODE_GOOD_FOR_MS) return held.mode

  const answer = (await kucoinSigned(
    network,
    credential,
    "GET",
    "/api/v2/position/getMarginMode",
    { symbol }
  )) as { marginMode?: unknown } | null
  // Isolated is the assumption when the exchange will not say, because it is
  // the smaller promise: an order refused for saying the wrong thing is far
  // better than one that quietly puts the whole balance behind a trade.
  const mode: MarginMode = answer?.marginMode === "CROSS" ? "CROSS" : "ISOLATED"
  marginModes.set(key, { at: Date.now(), mode })
  return mode
}

/** Tests drive their own clock; a held answer across them would leak. */
export function clearKucoinMarginModes(): void {
  marginModes.clear()
}

/**
 * Making the leverage asked for the leverage actually used.
 *
 * **On cross margin the order's own leverage is ignored.** KuCoin keeps a
 * leverage per market on the account, and a cross-margin order takes that
 * whatever the order says. An order asking for 1x on a market set to 3x is
 * accepted, opens at 3x, and says nothing — which is how a position ended up
 * on three times the leverage it was asked for on 20 Aug 2026.
 *
 * So on cross the account's setting is changed to what was asked before the
 * order goes, and if it cannot be changed the order is refused rather than
 * placed at a leverage nobody chose. On isolated the order's own field is
 * honoured and this does nothing.
 */
async function applyAskedLeverage(
  network: NetworkId,
  credential: KucoinCredential,
  symbol: string,
  leverage: number
): Promise<void> {
  const answer = (await kucoinSigned(
    network,
    credential,
    "GET",
    "/api/v2/getCrossUserLeverage",
    { symbol }
  )) as { leverage?: unknown } | null
  const now = num(answer?.leverage)
  if (now !== null && Math.abs(now - leverage) < 1e-9) return

  try {
    await kucoinSigned(
      network,
      credential,
      "POST",
      "/api/v2/changeCrossUserLeverage",
      {},
      { symbol, leverage: decimalString(leverage) }
    )
  } catch (error) {
    // Named so the screens can say the true thing: the order was not placed,
    // and why. Silently opening at the account's leverage would be worse than
    // any refusal.
    const refusal = kucoinRefusalError(scrubbedMessage(error)).message
    throw new Error(
      `LIVE_LEVERAGE:This market is on cross margin and its leverage could not be set to ${leverage}x, so nothing was ordered. ${refusal}`
    )
  }
}

async function sendOrder(
  network: NetworkId,
  credential: KucoinCredential,
  body: Record<string, unknown>
): Promise<PlacedLeg> {
  // Every order names the market's margin mode, entries and protection legs
  // and closes alike — see `marginModeOf`. Doing it here rather than at each
  // call site means a leg added later cannot forget and be refused on its own,
  // leaving a position open with no stop.
  const symbol = typeof body.symbol === "string" ? body.symbol : ""
  const marginMode = symbol
    ? await marginModeOf(network, credential, symbol)
    : null

  const answer = (await kucoinSigned(
    network,
    credential,
    "POST",
    "/api/v1/orders",
    {},
    {
      clientOid: randomUUID(),
      ...(marginMode ? { marginMode } : {}),
      ...body,
    }
  )) as { orderId?: unknown } | null
  // `placeKucoinOrder` reads the portfolio before sending. Without this drop,
  // the next engine pass can reuse that pre-order book, fail to see the order
  // it just placed, and send the same part close again.
  dropKucoinOrderBook(network, credential)
  const orderId = typeof answer?.orderId === "string" ? answer.orderId : ""
  if (!orderId) throw new Error("LIVE_UNREADABLE")
  return { orderId }
}

/** The body of one protection leg, for whichever position it guards. */
function protectionBody(input: {
  marketId: string
  long: boolean
  leg: "stop" | "target"
  triggerPx: number
  tick: number | null
  /** Whole contracts, or null to close whatever the position holds. */
  lots: number | null
}): Record<string, unknown> {
  return {
    symbol: input.marketId,
    side: input.long ? "sell" : "buy",
    type: "market",
    stop: triggerDirection(input.leg, input.long),
    // Mark price, so a wick on this one exchange cannot fire a stop the rest
    // of the market never reached — the same trigger the other venues use.
    stopPriceType: "MP",
    stopPrice: decimalString(snapToTick(input.triggerPx, input.tick)),
    ...(input.lots === null
      ? // Closes whatever is held at the moment it fires, and holds no margin
        // meanwhile — which is what a guard on a whole position should do.
        { closeOrder: true }
      : { reduceOnly: true, size: input.lots }),
  }
}

export async function placeKucoinOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  await assertRealMoneyAllowed(network)
  const credential = auth(orderAuth)
  const { lot, priceTick } = await kucoinMarketRules(network, params.marketId)

  const lots = lotsOf(params.sz, lot)
  if (!(lots > 0)) throw new Error("LIVE_SIZE_TOO_SMALL")

  const isMarket = params.kind === "market"

  // Before anything is ordered: on cross margin the order's own leverage is
  // ignored, so the account's setting is made to match what was asked. See
  // `applyAskedLeverage`.
  if (
    params.leverage !== null &&
    (await marginModeOf(network, credential, params.marketId)) === "CROSS"
  ) {
    await applyAskedLeverage(
      network,
      credential,
      params.marketId,
      params.leverage
    )
  }

  // `sendOrder` also asks for margin mode. Do that read first so the live
  // price boundary below is the final exchange read before the signed order;
  // `sendOrder` then reuses the held answer rather than letting the boundary
  // go stale during another round trip.
  let exchangeLimit: number | null = null
  if (isMarket) {
    try {
      await marginModeOf(network, credential, params.marketId)
    } catch (error) {
      throw refusedError(error)
    }
    try {
      exchangeLimit = await kucoinMarketOrderLimit(
        network,
        params.marketId,
        params.side
      )
    } catch (error) {
      if (error instanceof Error && error.message === "LIVE_PRICE") throw error
      // A public rule read failed before KuCoin saw an order. Calling that an
      // order refusal would count it toward pausing the strategy after five.
      throw exchangeError(error)
    }
  }
  const px =
    isMarket && exchangeLimit !== null
      ? cappedPx(params.side, params.px, priceTick, exchangeLimit)
      : snapToTick(params.px, priceTick)
  if (!(px > 0)) throw new Error("LIVE_PRICE")

  const body: Record<string, unknown> = {
    symbol: params.marketId,
    side: params.side,
    type: "limit",
    size: lots,
    price: decimalString(px),
    timeInForce: isMarket ? "IOC" : "GTC",
    reduceOnly: params.reduceOnly,
    ...(params.kind === "postOnly" ? { postOnly: true } : {}),
    // Honoured on isolated margin; on cross the account's own setting decides
    // and `applyAskedLeverage` above has already made it match. Stated only when
    // this opens fresh — adding to a position inherits what it already runs at,
    // and the caller sends null then.
    ...(params.leverage !== null ? { leverage: params.leverage } : {}),
  }

  let placed: PlacedLeg
  try {
    placed = await sendOrder(network, credential, body)
  } catch (error) {
    throw refusedError(error)
  }

  // The entry stands from here on. A refused protection leg must therefore be
  // reported as exactly that — an entry that is not protected — and never
  // folded into a success or turned into a failure that hides the position.
  let protection: PlaceOrderOutcome["protection"] = null
  let protectionNote: string | null = null
  if (params.tpPx !== null || params.slPx !== null) {
    const long = params.side === "buy"
    const failed: string[] = []
    for (const leg of ["stop", "target"] as const) {
      const triggerPx = leg === "stop" ? params.slPx : params.tpPx
      if (triggerPx === null) continue
      try {
        await sendOrder(
          network,
          credential,
          protectionBody({
            marketId: params.marketId,
            long,
            leg,
            triggerPx,
            tick: priceTick,
            lots: null,
          })
        )
      } catch (error) {
        failed.push(`${leg}: ${scrubbedMessage(error)}`)
      }
    }
    protection = failed.length === 0 ? "ok" : "partial"
    protectionNote =
      failed.length === 0
        ? null
        : `The order was placed but its protection was refused (${failed.join("; ")}). The position is not protected — set it by hand.`
  }

  // KuCoin answers a placement with an id and nothing else, so what actually
  // happened is read back. An order still working after the polls is reported
  // resting, and the fills sweep carries the truth forward either way.
  for (let poll = 0; poll < PLACE_POLLS; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, PLACE_POLL_WAIT_MS))
    const row = await orderById(network, credential, placed.orderId).catch(
      () => null
    )
    if (!row) continue
    const filledLots = num(row.filledSize) ?? num(row.dealSize) ?? 0
    const filledValue = num(row.filledValue) ?? num(row.dealValue)
    const filledSz = coinsOf(filledLots, lot)
    const done = row.isActive === false || row.status === "done"
    if (filledLots > 0 && done) {
      return {
        status: "filled",
        orderId: placed.orderId,
        avgPx:
          filledValue !== null && filledSz > 0 ? filledValue / filledSz : px,
        filledSz,
        protection,
        protectionNote,
      }
    }
    if (done && filledLots === 0) {
      // An immediate-or-cancel that met nobody. Nothing was bought, and the
      // caller is told rather than left believing an order rests.
      if (isMarket) {
        throw new Error(
          "LIVE_ORDER_REFUSED:The order missed and was cancelled."
        )
      }
      break
    }
  }

  return {
    status: "resting",
    orderId: placed.orderId,
    avgPx: null,
    filledSz: null,
    protection,
    protectionNote,
  }
}

// ----- Cancel, modify, close ------------------------------------------------

export async function cancelKucoinOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  const credential = auth(orderAuth)
  try {
    await kucoinSigned(
      network,
      credential,
      "DELETE",
      `/api/v1/orders/${encodeURIComponent(params.orderId)}`,
      {}
    )
    dropKucoinOrderBook(network, credential)
  } catch (error) {
    throw exchangeError(error)
  }
}

/**
 * Moving an order, the only way KuCoin allows, and in the only order of doing
 * it that keeps the rule.
 *
 * KuCoin Futures has no amend command. Checked against the exchange's own
 * SDK on 21 Aug 2026: its futures order list is add, cancel and read, with
 * nothing between them. So a move is two calls, and which one goes first is
 * the whole decision.
 *
 * **The new order goes on first and the old one comes off second.** For the
 * fraction of a second between the two calls that level is covered twice,
 * never not at all. The other way round — cancel, then place — is what this
 * used to do, and it left the level empty at exactly the moment price can
 * reach it.
 *
 * The failure that happens most often is the safe one. Both orders hold
 * margin at once while they overlap, so a wallet with little free cash has
 * the new order refused, nothing moves, and the old one is still resting
 * where it was.
 */
export async function modifyKucoinOrder(
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
  const credential = auth(orderAuth)
  const { lot, priceTick } = await kucoinMarketRules(network, params.marketId)

  const lots = lotsOf(params.sz, lot)
  if (!(lots > 0)) throw new Error("LIVE_SIZE_TOO_SMALL")
  const px = snapToTick(params.px, priceTick)
  if (!(px > 0)) throw new Error("LIVE_PRICE")

  try {
    await sendOrder(network, credential, {
      symbol: params.marketId,
      side: params.side,
      type: "limit",
      size: lots,
      price: decimalString(px),
      timeInForce: "GTC",
      reduceOnly: params.reduceOnly,
    })
  } catch (error) {
    // A rate limit and a missing key mean the same thing on every call, and
    // both tell the caller what to do next. Burying them inside a sentence
    // about how KuCoin moves orders would lose that.
    const refused = refusedError(error)
    if (
      refused.message === "EXCHANGE_BUSY" ||
      refused.message === "LIVE_WALLET_KEY"
    ) {
      throw refused
    }
    throw new Error(
      `LIVE_MOVE_REFUSED:The order has not moved and is still resting where it was. KuCoin cannot change an order's price, so the new one has to go on before the old one comes off, and it was refused (${scrubbedMessage(error)}).`
    )
  }

  try {
    await kucoinSigned(
      network,
      credential,
      "DELETE",
      `/api/v1/orders/${encodeURIComponent(params.orderId)}`,
      {}
    )
    dropKucoinOrderBook(network, credential)
  } catch (error) {
    // The old order may simply have gone while the new one was going on —
    // filled, or cancelled from somewhere else — and then nothing is doubled
    // and there is nothing to say.
    //
    // **Only a straight answer that it has gone buys that silence.** An
    // exchange that will not say is not an exchange saying no: a read that
    // failed, or a row that cannot be parsed, leaves two orders possibly
    // resting on real money, and the one place to be wrong is on the side
    // that speaks up.
    const gone = await orderById(network, credential, params.orderId)
      .then(
        (row) =>
          row !== null && (row.isActive === false || row.status === "done")
      )
      .catch(() => false)
    if (!gone) {
      throw new Error(
        `LIVE_MOVE_DOUBLED:The order was moved but the old one could not be taken off (${scrubbedMessage(error)}), so TWO orders may be resting on that market. Check Open orders and cancel one — if both fill you hold twice the position you meant to.`
      )
    }
  }
}

export async function closeKucoinPosition(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; szi: number }
): Promise<{ avgPx: number | null; filledSz: number | null }> {
  await assertRealMoneyAllowed(network)
  const credential = auth(orderAuth)
  const { lot } = await kucoinMarketRules(network, params.marketId)

  // `closeOrder` closes whatever is actually held at the moment it runs,
  // which is what "close this position" means — sizing it ourselves would
  // leave a remainder behind whenever the position moved in between.
  let placed: PlacedLeg
  try {
    placed = await sendOrder(network, credential, {
      symbol: params.marketId,
      side: params.szi > 0 ? "sell" : "buy",
      type: "market",
      closeOrder: true,
    })
  } catch (error) {
    throw refusedError(error)
  }

  for (let poll = 0; poll < PLACE_POLLS; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, PLACE_POLL_WAIT_MS))
    const row = await orderById(network, credential, placed.orderId).catch(
      () => null
    )
    if (!row) continue
    const filledLots = num(row.filledSize) ?? num(row.dealSize) ?? 0
    if (filledLots <= 0) continue
    const filledValue = num(row.filledValue) ?? num(row.dealValue)
    const filledSz = coinsOf(filledLots, lot)
    return {
      avgPx:
        filledValue !== null && filledSz > 0 ? filledValue / filledSz : null,
      filledSz,
    }
  }
  // It went, but the fill had not landed by the time we looked. The sweep
  // reports it a moment later; claiming a price here would be inventing one.
  return { avgPx: null, filledSz: null }
}

// ----- Leverage and margin on an open position ----------------------------

export async function setKucoinLeverage(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; leverage: number }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  const credential = auth(orderAuth)
  if ((await marginModeOf(network, credential, params.marketId)) !== "CROSS") {
    throw exchangeError(new Error("KUCOIN_ISOLATED_LEVERAGE"))
  }
  await applyAskedLeverage(
    network,
    credential,
    params.marketId,
    Math.max(1, Math.round(params.leverage))
  )
}

export async function adjustKucoinMargin(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; szi: number; dollars: number }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  if (params.szi === 0) throw new Error("LIVE_POSITION_GONE")
  if (!Number.isFinite(params.dollars) || params.dollars === 0) {
    throw new Error("LIVE_MARGIN_NOTHING")
  }
  const credential = auth(orderAuth)
  if (
    (await marginModeOf(network, credential, params.marketId)) !== "ISOLATED"
  ) {
    throw exchangeError(new Error("KUCOIN_MARGIN_CROSS"))
  }

  try {
    if (params.dollars > 0) {
      await kucoinSigned(
        network,
        credential,
        "POST",
        "/api/v1/position/margin/deposit-margin",
        {},
        {
          symbol: params.marketId,
          margin: decimalString(params.dollars),
          bizNo: randomUUID(),
        }
      )
    } else {
      await kucoinSigned(
        network,
        credential,
        "POST",
        "/api/v1/margin/withdrawMargin",
        {},
        {
          symbol: params.marketId,
          withdrawAmount: decimalString(-params.dollars),
        }
      )
    }
  } catch (error) {
    throw exchangeError(error)
  }
}

// ----- Brackets -------------------------------------------------------------

export async function setKucoinBrackets(
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
  const credential = auth(orderAuth)
  const { lot, priceTick } = await kucoinMarketRules(network, params.marketId)
  const size = Math.abs(params.position.szi)
  if (!(size > 0)) throw new Error("LIVE_POSITION_GONE")
  const long = params.position.szi > 0

  const replacing = [...new Set(params.position.protectionOrderIds)]
  const targets = params.targets.map((target) => {
    const lots = target.sz === null ? null : lotsOf(target.sz, lot)
    if (lots !== null && !(lots > 0)) throw new Error("LIVE_SIZE_TOO_SMALL")
    return { ...target, lots }
  })
  // KuCoin accepts `closeOrder` stop requests and returns an id, but has been
  // observed marking those rows done immediately without triggering them.
  // Size every open-position stop to what is held now instead. The grid
  // replaces this stop whenever its held size changes.
  const slLots = lotsOf(params.slSz ?? size, lot)
  if (params.slPx !== null && !(slLots > 0)) {
    throw new Error("LIVE_SIZE_TOO_SMALL")
  }

  const landed: string[] = []
  let slOrderId: string | null = null
  try {
    if (params.slPx !== null) {
      const placed = await sendOrder(
        network,
        credential,
        protectionBody({
          marketId: params.marketId,
          long,
          leg: "stop",
          triggerPx: params.slPx,
          tick: priceTick,
          lots: slLots,
        })
      )
      slOrderId = placed.orderId
      if (
        !(await stopOrderIsActive(
          network,
          credential,
          params.marketId,
          placed.orderId
        ))
      ) {
        throw new Error(
          "KuCoin returned an order id but did not keep the stop active."
        )
      }
      landed.push(`stop at ${params.slPx}`)
    }
    for (const target of targets) {
      await sendOrder(
        network,
        credential,
        protectionBody({
          marketId: params.marketId,
          long,
          leg: "target",
          triggerPx: target.px,
          tick: priceTick,
          lots: target.lots,
        })
      )
      landed.push(`target at ${target.px}`)
    }
  } catch (error) {
    throw new Error(
      `LIVE_BRACKET_REPLACE_PARTIAL:The old protection is still on.${landed.length > 0 ? ` The new ${landed.join(" and ")} also went on.` : ""} The replacement was refused: ${scrubbedMessage(error)}`
    )
  }

  // KuCoin allows far more than the eight stop orders the largest old/new
  // overlap can use. New protection stands before the old ids are cancelled.
  for (const orderId of replacing) {
    try {
      await kucoinSigned(
        network,
        credential,
        "DELETE",
        `/api/v1/orders/${encodeURIComponent(orderId)}`,
        {}
      )
      dropKucoinOrderBook(network, credential)
    } catch (error) {
      throw new Error(
        `LIVE_BRACKET_REPLACE_DOUBLED:${landed.length > 0 ? `The new ${landed.join(" and ")} is on, but` : "Nothing new was requested, and"} an old protection order could not be cancelled: ${scrubbedMessage(error)}`
      )
    }
  }
  if (replacing.length > 0) {
    const still = activeOrderRows(
      await pagedItems(network, credential, "/api/v1/stopOrders", {
        symbol: params.marketId,
        status: "active",
      })
    ).filter((row) => replacing.includes(row.id))
    if (still.length > 0) {
      throw new Error(
        `LIVE_BRACKET_REPLACE_DOUBLED:${landed.length > 0 ? `The new ${landed.join(" and ")} is on, but` : "Nothing new was requested, and"} ${still.length} old protection ${still.length === 1 ? "order is" : "orders are"} still on the exchange.`
      )
    }
  }
  return { slOrderId }
}

// ----- Reading the account back ---------------------------------------------

const positionSchema = z.object({
  symbol: z.string(),
  currentQty: z.union([z.string(), z.number()]).optional(),
  avgEntryPrice: z.union([z.string(), z.number()]).optional(),
  liquidationPrice: z.union([z.string(), z.number()]).optional(),
  posMargin: z.union([z.string(), z.number()]).optional(),
  posInit: z.union([z.string(), z.number()]).optional(),
  realLeverage: z.union([z.string(), z.number()]).optional(),
  isOpen: z.boolean().optional(),
})

/**
 * How long the two order books are held before being read again.
 *
 * Two seconds on age alone, the way an answer always stood, so that one cycle
 * of the screen and one pass of the engine share a read instead of making two.
 * After that they stand only while the socket says nothing has happened —
 * which on a quiet account is the whole time, up to the ceiling.
 */
const OPEN_ORDERS_GOOD_FOR_MS = 2_000

/**
 * The longest an answer is held on the socket's word alone.
 *
 * **A ceiling, not a target.** The line in `private-feed.ts` is trustworthy
 * enough that in principle an answer could stand until it says otherwise. In
 * principle is not good enough for money: if KuCoin ever accepts a
 * subscription and then quietly stops sending order events while still
 * answering the heartbeat, nothing else would notice. Two minutes bounds that
 * to two minutes, and it still turns a read every couple of seconds into a
 * read every couple of minutes on an account where nothing is happening.
 */
const HOLD_WHILE_QUIET_MS = 2 * 60_000

/**
 * Whether an answer taken at `at` may still be used.
 *
 * Young answers stand on their age alone. An older one stands only while the
 * exchange has told us nothing has happened since it was taken, and never past
 * the ceiling.
 */
function stillStands(
  network: NetworkId,
  keyId: string,
  credential: () => string | null,
  at: number,
  goodForMs: number
): boolean {
  const age = Date.now() - at
  if (age < goodForMs) return true
  if (age >= HOLD_WHILE_QUIET_MS) return false
  return kucoinQuietSince(network, keyId, credential, at)
}

const orderBooksCache = new Map<
  string,
  { at: number; answer: Promise<{ active: unknown[]; stops: unknown[] }> }
>()

const fillsCache = new Map<
  string,
  { at: number; answer: Promise<WalletOrderFill[]> }
>()

/**
 * Empties the short-lived answers. Tests drive their own time, and an answer
 * carried from one case into the next would make them lie to each other.
 */
export function clearKucoinOrderCaches(): void {
  orderBooksCache.clear()
  fillsCache.clear()
  clearVenueTouched("kucoin")
}

/** A successful order mutation makes the held open-order list obsolete. */
function dropKucoinOrderBook(
  network: NetworkId,
  credential: KucoinCredential
): void {
  orderBooksCache.delete(`${network}:${credential.keyId}`)
}

/**
 * What is resting on this account: the live order book and the untriggered
 * stop book, which KuCoin keeps apart.
 *
 * Untriggered stops and targets live in their own book, so a portfolio read
 * that asked only for orders would show a position with no protection on it at
 * all.
 */
function orderBooks(
  network: NetworkId,
  credential: KucoinCredential,
  /** The ciphertext-holding thunk, so the socket never keeps a plaintext. */
  blob: () => string | null
): Promise<{ active: unknown[]; stops: unknown[] }> {
  const key = `${network}:${credential.keyId}`
  const cached = orderBooksCache.get(key)
  if (
    cached &&
    stillStands(
      network,
      credential.keyId,
      blob,
      cached.at,
      OPEN_ORDERS_GOOD_FOR_MS
    )
  ) {
    return cached.answer
  }
  const at = Date.now()
  const answer = Promise.all([
    pagedItems(network, credential, "/api/v1/orders", { status: "active" }),
    pagedItems(network, credential, "/api/v1/stopOrders", {
      status: "active",
    }),
  ]).then(([active, stops]) => ({ active, stops }))
  // A failed read is never remembered as an answer — one refusal would
  // otherwise be handed to every caller until the ceiling ran out.
  answer.catch(() => {
    if (orderBooksCache.get(key)?.at === at) orderBooksCache.delete(key)
  })
  orderBooksCache.set(key, { at, answer })
  return answer
}

export async function fetchKucoinPortfolio(
  network: NetworkId,
  _address: string,
  credential: () => string | null
): Promise<WalletPortfolio> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parseKucoinCredential(blob)
  // Swept from the pass that reads a portfolio rather than on a timer of its
  // own, which would keep the socket module alive in a process that has
  // finished with it.
  dropIdleKucoinPrivateFeeds()

  const [rawPositions, { active: activeRows, stops: stopRows }] =
    await Promise.all([
      // **Positions are read every time, never held.** They carry the open
      // profit, which moves with the price every second, and KuCoin's position
      // channel speaks only when the position itself changes. Holding these
      // would freeze the profit on a wallet card.
      kucoinSigned(network, parsed, "GET", "/api/v1/positions", {
        currency: "USDT",
      }),
      orderBooks(network, parsed, credential),
    ])

  const open = activeOrderRows(activeRows)
  const untriggered = activeOrderRows(stopRows)

  const bySymbol = new Map<string, OrderRow[]>()
  for (const row of untriggered) {
    const list = bySymbol.get(row.symbol) ?? []
    list.push(row)
    bySymbol.set(row.symbol, list)
  }

  const protectionIds = new Set<string>()
  const positions: WalletPosition[] = []
  for (const raw of Array.isArray(rawPositions) ? rawPositions : []) {
    const row = positionSchema.safeParse(raw)
    if (!row.success) continue
    const lots = num(row.data.currentQty) ?? 0
    if (lots === 0 || row.data.isOpen === false) continue

    const { lot } = await kucoinMarketRules(network, row.data.symbol).catch(
      () => ({ lot: { multiplier: 0, lotSize: 1 } as KucoinLotRule })
    )
    // A market whose rules cannot be read cannot have its size stated in
    // coins, and a position drawn at the wrong size is worse than one that
    // waits for the next read.
    if (!(lot.multiplier > 0)) continue
    const szi = coinsOf(lots, lot)
    const long = szi > 0

    // Sorted by id, so a position carrying more than one stop names the same
    // one on every read instead of flipping between them. By id and not by
    // time because the order id is the only thing here that never changes;
    // whether that puts the oldest first depends on how KuCoin builds an id,
    // and the point is that the answer holds still, not which leg wins.
    const legs = [...(bySymbol.get(row.data.symbol) ?? [])].sort(
      (left, right) => left.id.localeCompare(right.id)
    )
    const protection = legs.filter((one) => legOf(one.stop, long) !== null)
    for (const leg of protection) protectionIds.add(leg.id)
    const stop = protection.find((one) => legOf(one.stop, long) === "stop")
    const targets = protection
      .filter((one) => legOf(one.stop, long) === "target")
      .map((target) => {
        const targetLots = num(target.size)
        return {
          px: num(target.stopPrice),
          sz:
            targetLots !== null && targetLots > 0
              ? coinsOf(targetLots, lot)
              : null,
          orderId: target.id,
        }
      })
      .filter(
        (
          target
        ): target is { px: number; sz: number | null; orderId: string } =>
          target.px !== null
      )
      .sort((left, right) => left.px - right.px)
    const target = targets[0] ?? null

    positions.push({
      marketId: row.data.symbol,
      szi,
      entryPx: num(row.data.avgEntryPrice) ?? 0,
      leverage: Math.abs(num(row.data.realLeverage) ?? 1),
      marginUsed: num(row.data.posMargin) ?? num(row.data.posInit) ?? 0,
      liquidationPx: num(row.data.liquidationPrice),
      targets,
      tpPx: target?.px ?? null,
      tpSz: target?.sz ?? null,
      slPx: stop ? num(stop.stopPrice) : null,
      tpOrderId: target?.orderId ?? null,
      slOrderId: stop?.id ?? null,
      // Every untriggered leg on this market, not only the two picked above,
      // because `setBrackets` has to cancel all of them — see
      // `protectionOrderIds`.
      protectionOrderIds: protection.map((one) => one.id),
    })
  }

  const orders: WalletOpenOrder[] = []
  for (const row of [...open, ...untriggered]) {
    if (protectionIds.has(row.id)) continue
    const { lot } = await kucoinMarketRules(network, row.symbol).catch(() => ({
      lot: { multiplier: 0, lotSize: 1 } as KucoinLotRule,
    }))
    if (!(lot.multiplier > 0)) continue
    const trigger = Boolean(row.stop)
    const lots = num(row.size) ?? 0
    const filled = num(row.filledSize) ?? num(row.dealSize) ?? 0
    orders.push({
      orderId: row.id,
      marketId: row.symbol,
      side: row.side === "sell" ? "sell" : "buy",
      px: (trigger ? num(row.stopPrice) : num(row.price)) ?? 0,
      sz: coinsOf(Math.max(0, lots - filled), lot),
      reduceOnly: row.reduceOnly ?? row.closeOrder ?? false,
      trigger,
    })
  }

  return { positions, orders }
}

// ----- Fills and old orders --------------------------------------------------

const fillSchema = z.object({
  tradeId: z.string().optional(),
  orderId: z.string().optional(),
  symbol: z.string(),
  side: z.string().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  size: z.union([z.string(), z.number()]).optional(),
  fee: z.union([z.string(), z.number()]).optional(),
  openFeePay: z.union([z.string(), z.number()]).optional(),
  closeFeePay: z.union([z.string(), z.number()]).optional(),
  tradeTime: z.union([z.string(), z.number()]).optional(),
  createdAt: z.union([z.string(), z.number()]).optional(),
  tradeType: z.string().optional(),
  liquidity: z.string().optional(),
})

const closedPositionSchema = z.object({
  closeId: z.string().optional(),
  symbol: z.string(),
  closeTime: z.union([z.string(), z.number()]).optional(),
  pnl: z.union([z.string(), z.number()]).optional(),
  tradeFee: z.union([z.string(), z.number()]).optional(),
})

/** KuCoin only answers seven days of closed positions per call. */
const CLOSED_WINDOW_MS = 7 * 24 * 3_600_000

/** As far back as the money is chased — the exchange keeps three months. */
const CLOSED_MAX_WINDOWS = 13

/**
 * What each closed position banked, by symbol and close time.
 *
 * **Why this read exists at all.** KuCoin's fills carry a price, a size and a
 * fee — and no profit. Every other venue states what a closing fill banked,
 * and the Journal is built on that number, so without this a KuCoin trade
 * would report its fees as its whole result: every finished trade a small
 * loss, which is worse than saying nothing. KuCoin does state the money, just
 * one level up — per position closed — and that is what this fetches.
 */
async function closedPositionMoney(
  network: NetworkId,
  credential: KucoinCredential,
  since: number,
  until: number
): Promise<Array<{ symbol: string; closeTime: number; money: number }>> {
  const closed: Array<{ symbol: string; closeTime: number; money: number }> = []
  // Counted once each, whatever the paging does. The windows are asked back
  // to back and a position that closed on a boundary comes back in both, so
  // without this its result would be added to the Journal twice — the kind of
  // wrong number that is worse than no number at all.
  const seen = new Set<string>()
  let from = Math.max(since, until - CLOSED_MAX_WINDOWS * CLOSED_WINDOW_MS)

  while (from < until) {
    const to = Math.min(until, from + CLOSED_WINDOW_MS)
    const answer = (await kucoinSigned(
      network,
      credential,
      "GET",
      "/api/v1/history-positions",
      { from, to, limit: 200 }
    ).catch(() => null)) as { items?: unknown } | unknown[] | null
    const rows = Array.isArray(answer)
      ? answer
      : Array.isArray((answer as { items?: unknown })?.items)
        ? (answer as { items: unknown[] }).items
        : []

    for (const raw of rows) {
      const row = closedPositionSchema.safeParse(raw)
      if (!row.success) continue
      const closeTime = num(row.data.closeTime)
      const pnl = num(row.data.pnl)
      if (closeTime === null || pnl === null) continue
      // The exchange's own id where it gave one; a position cannot close
      // twice on the same market in the same millisecond, so the pair stands
      // in for it where it did not.
      const identity = row.data.closeId ?? `${row.data.symbol}:${closeTime}`
      if (seen.has(identity)) continue
      seen.add(identity)
      // The trading fee is added back because the app subtracts each fill's
      // own fee again when it totals a trade. Adding it here means the
      // Journal's figure lands on the exchange's own realised number rather
      // than one fee below it. If a finished trade ever reads exactly its
      // fees below KuCoin's own screen, this line is the one to change.
      closed.push({
        symbol: row.data.symbol,
        closeTime,
        money: pnl + (num(row.data.tradeFee) ?? 0),
      })
    }
    from = to
  }
  return closed
}

/**
 * Every trade the account made since the watermark, with the money attached.
 *
 * The money comes from the closed-position record above and lands on the fill
 * that CLOSED each position — the last closing fill at or before the moment
 * the exchange says the position went flat. A position closed by one sell
 * therefore carries its whole result on that sell, which is the common case
 * and exactly what the Journal wants; a position closed in pieces reports the
 * whole result on the final piece, so the finished trade totals correctly
 * even though the earlier pieces say nothing.
 */
/**
 * The furthest back this exchange answers for fills. A first sweep therefore
 * picks up a day and carries on from there, which is all this door offers.
 */
const FILLS_WINDOW_MS = 24 * 60 * 60_000

/**
 * How long a fills sweep is held before being made again.
 *
 * The sweep is the expensive one: a paged fills read plus a closed-positions
 * read, and on an account where nothing has filled it finds nothing, over and
 * over. Ten seconds on age alone, and after that only while the socket says
 * the account has been silent.
 */
const FILLS_GOOD_FOR_MS = 10_000

export async function fetchKucoinOrderFills(
  network: NetworkId,
  _address: string,
  since: number,
  credential: () => string | null
): Promise<WalletOrderFill[]> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parseKucoinCredential(blob)
  const key = `${network}:${parsed.keyId}:${Math.floor(since / 60_000)}`
  const cached = fillsCache.get(key)
  if (
    cached &&
    stillStands(network, parsed.keyId, credential, cached.at, FILLS_GOOD_FOR_MS)
  ) {
    return cached.answer
  }
  const at = Date.now()
  const answer = readKucoinFills(network, since, parsed)
  answer.catch(() => {
    if (fillsCache.get(key)?.at === at) fillsCache.delete(key)
  })
  fillsCache.set(key, { at, answer })
  return answer
}

async function readKucoinFills(
  network: NetworkId,
  since: number,
  parsed: KucoinCredential
): Promise<WalletOrderFill[]> {
  const end = Date.now()
  // **Never further back than the exchange will answer.**
  //
  // KuCoin refuses a wide window outright — `100001 When viewing completed
  // data...` — rather than returning what it has. The sweep asks from zero
  // the first time a wallet is read, which made that refusal permanent: the
  // read threw, nothing was stored, so the next sweep asked from zero again.
  // Not one KuCoin fill was ever kept, and closes never reached the Journal.
  const start = Math.max(since, end - FILLS_WINDOW_MS)

  const [rawFills, closed] = await Promise.all([
    pagedItems(network, parsed, "/api/v1/fills", {
      startAt: start,
      endAt: end,
    }),
    closedPositionMoney(network, parsed, start, end),
  ])

  const fills: WalletOrderFill[] = []
  for (const raw of rawFills) {
    const row = fillSchema.safeParse(raw)
    if (!row.success) continue
    const one = row.data
    const { lot } = await kucoinMarketRules(network, one.symbol).catch(() => ({
      lot: { multiplier: 0, lotSize: 1 } as KucoinLotRule,
    }))
    if (!(lot.multiplier > 0)) continue

    // KuCoin states the moment in nanoseconds on some rows and milliseconds
    // on others; a number that large is nanoseconds and nothing else.
    const rawAt = num(one.tradeTime) ?? num(one.createdAt) ?? 0
    const at = rawAt > 1e14 ? Math.floor(rawAt / 1e6) : rawAt
    const liquidation =
      one.tradeType === "liquid" ||
      one.tradeType === "adl" ||
      one.tradeType === "liquidation"

    fills.push({
      fillId: one.tradeId ?? "",
      orderId: one.orderId ?? "",
      marketId: one.symbol,
      side: one.side === "sell" ? "sell" : "buy",
      px: num(one.price) ?? 0,
      sz: coinsOf(num(one.size) ?? 0, lot),
      at,
      // Filled in below, once every fill's time is known.
      closedPnl: 0,
      fee:
        num(one.fee) ??
        (num(one.openFeePay) ?? 0) + (num(one.closeFeePay) ?? 0),
      dir: liquidation ? "Liquidation" : one.side === "sell" ? "Sell" : "Buy",
      liquidation,
    })
  }

  fills.sort((a, b) => a.at - b.at || a.fillId.localeCompare(b.fillId))

  // Each closed position's money goes on the last fill of that market at or
  // before the moment it closed. A close the fills feed does not carry —
  // older than the watermark — simply finds nobody and is left alone.
  for (const one of closed) {
    let landed: WalletOrderFill | null = null
    for (const fill of fills) {
      if (fill.marketId !== one.symbol) continue
      if (fill.at > one.closeTime + 60_000) break
      landed = fill
    }
    if (landed) landed.closedPnl += one.money
  }

  return fills
}

export async function fetchKucoinOrderInfo(
  network: NetworkId,
  _address: string,
  orderId: string,
  _marketId: string,
  credential: () => string | null
): Promise<WalletOrderInfo> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const row = await orderById(network, parseKucoinCredential(blob), orderId)
  if (!row || !row.stop) return { kind: "none", triggerPx: null }

  // Which leg it was depends on the position it guarded, and that position is
  // long gone by the time this is asked. The side is what survives: a stop
  // that fired downwards on a sell guarded a long, and so did a target that
  // fired upwards — so the side plus the direction still name the leg.
  const long = row.side === "sell"
  const kind = legOf(row.stop, long) ?? "none"
  const triggerPx = num(row.stopPrice)
  return {
    kind,
    triggerPx: triggerPx !== null && triggerPx > 0 ? triggerPx : null,
  }
}
