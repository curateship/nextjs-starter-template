import { randomBytes } from "node:crypto"

import { z } from "zod"

import type {
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  WalletOpenOrder,
  WalletOrderInfo,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/edgex/translate"
import { formatUsd } from "@/lib/trade/format"
import {
  assertOrderValue,
  assertPlaceOrderValues,
  decimalString,
} from "@/server/protocols/connector-helpers"
import {
  edgexCredentialFrom,
  forgetEdgexAccountRead,
  readEdgexAccount,
  toEdgexWalletPositions,
  type EdgexAccountRead,
} from "@/server/protocols/edgex/account"
import {
  edgexContract,
  edgexMarketIdOf,
  edgexSigningFacts,
  type EdgexContract,
  type EdgexSigningFacts,
} from "@/server/protocols/edgex/catalogue"
import {
  edgexPrivate,
  parseEdgexCredential,
  type EdgexCredential,
} from "@/server/protocols/edgex/client"
import { edgexMarketOpen } from "@/server/protocols/edgex/live-prices"
import { fetchEdgexPrices } from "@/server/protocols/edgex/markets"
import {
  closedSentence,
  edgexRefusalSentence,
  type EdgexRefusalContext,
} from "@/server/protocols/edgex/refusals"
import { signEdgexOrder } from "@/server/protocols/edgex/signer"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import { scrubbedMessage } from "@/server/protocols/scrub"
import { venueTouched } from "@/server/protocols/touched"

/**
 * **A market order is a limit order with Immediate-or-Cancel, capped 3%
 * through the price.** Never edgeX's own MARKET type (`trading-rules.md`,
 * and Tyler's decision on 5 Sep 2026).
 */
export const EDGEX_THROUGH_PRICE = 0.03

const CREATE = "/api/v2/private/order/createOrder"
const CANCEL = "/api/v2/private/order/cancelOrderById"
const ACTIVE = "/api/v2/private/order/getActiveOrderPage"
const BY_ID = "/api/v2/private/order/getOrderById"
const LEVERAGE = "/api/v2/private/account/updateLeverageSetting"

/**
 * The client order id edgeX gets: `trade-` and the app's own id without its
 * `0x`, or a random one. The same id in always gives the same id out, so a
 * lost answer can still be looked up by it, and the order's signature nonce
 * is derived from it (`signer.ts`).
 */
export function edgexClientOrderId(given?: string | null): string {
  const core = given?.replace(/^0x/i, "").replace(/[^0-9A-Za-z-]/g, "") ?? ""
  return `trade-${core || randomBytes(12).toString("hex")}`
}

/** A price on the market's tick, rounded the way that never overpays. */
export function edgexSnapPrice(
  px: number,
  tick: number,
  direction: "down" | "up" | "nearest"
): number {
  const ticks = px / tick
  const whole =
    direction === "down"
      ? Math.floor(ticks + 1e-9)
      : direction === "up"
        ? Math.ceil(ticks - 1e-9)
        : Math.round(ticks)
  return Number((whole * tick).toFixed(12))
}

/** A size on the market's step, never more than was asked for. */
export function edgexSnapSize(sz: number, step: number): number {
  return Number((Math.floor(sz / step + 1e-9) * step).toFixed(12))
}

/** Decimal text on the tick or step, without float dust or exponents. */
function onStep(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  return decimalString(Number(value.toFixed(decimals)))
}

type OrderContext = {
  credential: EdgexCredential
  contract: EdgexContract
  facts: EdgexSigningFacts
  account: EdgexAccountRead
}

/**
 * Everything one order needs: the credential, the market's facts, the
 * chain it is signed for and the account's current read.
 */
async function orderContext(
  network: NetworkId,
  auth: OrderAuth,
  marketId: string,
  opening: boolean
): Promise<OrderContext> {
  const credential = parseEdgexCredential(auth.agentKey)
  const contract = await edgexContract(network, marketId, "order").catch((error: unknown) => {
    if (error instanceof Error && error.message === "EDGEX_MARKET_UNKNOWN") {
      throw new Error(
        "LIVE_EXCHANGE:edgeX does not list this market for trading now. It may have been switched off on edgeX."
      )
    }
    throw error
  })
  if (opening && !contract.canOpen) {
    throw new Error(
      "LIVE_EXCHANGE:edgeX is only letting positions on this market be closed right now, not opened."
    )
  }
  const facts = await edgexSigningFacts(network)
  const account = await readEdgexAccount(network, credential, "order")
  if (account.liquidating) {
    throw new Error(`LIVE_EXCHANGE:${edgexRefusalSentence("EDGEX_LIQUIDATING")}`)
  }
  return { credential, contract, facts, account }
}

/**
 * The one door every change to an edgeX account goes through: both
 * real-money switches, then the signed POST, then the held account read
 * dropped so the next panel sees what changed.
 */
async function send(
  network: NetworkId,
  credential: EdgexCredential,
  path: string,
  body: Record<string, unknown>,
  context: EdgexRefusalContext = {}
): Promise<unknown> {
  await assertRealMoneyAllowed(network)
  try {
    return await edgexPrivate(network, credential, "POST", path, body, {
      priority: "order",
      context,
    })
  } finally {
    // Rung when the request finishes, not when it starts, for the reason
    // KuCoin's client gives: a read taken mid-change must not be held.
    venueTouched("edgex")
    forgetEdgexAccountRead(network, credential)
  }
}

type OrderTerms = {
  side: "BUY" | "SELL"
  type: "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET"
  timeInForce: "GOOD_TIL_CANCEL" | "POST_ONLY" | "IMMEDIATE_OR_CANCEL"
  size: string
  /** The price sent: the limit, or "0" for a stop or target. */
  price: string
  /** The price signed: the limit, or the worst a stop or target may fill at. */
  l2Price: string
  reduceOnly: boolean
  clientOrderId: string
  trigger?: { price: string; positionWide: boolean }
}

/**
 * One order's body, signed. A field with nothing to say is left out, so the
 * text signed for the request and the JSON sent always name the same fields.
 */
export async function edgexOrderBody(
  context: Pick<OrderContext, "credential" | "contract" | "facts">,
  terms: OrderTerms,
  now = Date.now()
): Promise<Record<string, unknown>> {
  const signed = await signEdgexOrder({
    credential: context.credential,
    facts: context.facts,
    contract: context.contract,
    side: terms.side,
    size: terms.size,
    l2Price: terms.l2Price,
    clientOrderId: terms.clientOrderId,
    now,
  })
  return {
    contractId: context.contract.contractId,
    side: terms.side,
    size: terms.size,
    price: terms.price,
    clientOrderId: terms.clientOrderId,
    type: terms.type,
    timeInForce: terms.timeInForce,
    reduceOnly: terms.reduceOnly,
    ...(terms.trigger
      ? {
          triggerPrice: terms.trigger.price,
          // edgeX's mark equalled its oracle price on every contract in the
          // 24 Sep 2026 ticker, and its mark is what positions are valued
          // and liquidated at, so stops watch the oracle.
          triggerPriceType: "ORACLE_PRICE",
          isPositionTpsl: terms.trigger.positionWide,
        }
      : {}),
    ...signed,
  }
}

const orderSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    contractId: z.union([z.string(), z.number()]).optional(),
    clientOrderId: z.string().optional(),
    side: z.string().optional(),
    type: z.string().optional(),
    price: z.union([z.string(), z.number()]).optional(),
    size: z.union([z.string(), z.number()]).optional(),
    triggerPrice: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    reduceOnly: z.boolean().optional(),
    isPositionTpsl: z.boolean().optional(),
    cumFillSize: z.union([z.string(), z.number()]).optional(),
    cumFillValue: z.union([z.string(), z.number()]).optional(),
    cumMatchSize: z.union([z.string(), z.number()]).optional(),
    cumMatchValue: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

export type EdgexOrderRow = z.infer<typeof orderSchema>

/** Whether an order waits at a trigger rather than resting in the book. */
export function isEdgexTrigger(type: string | undefined): boolean {
  return /^(STOP|TAKE_PROFIT)_/.test(type ?? "")
}

function filledFigures(row: EdgexOrderRow | null): { avgPx: number | null; filledSz: number | null } {
  const size = num(row?.cumFillSize) ?? num(row?.cumMatchSize)
  const value = num(row?.cumFillValue) ?? num(row?.cumMatchValue)
  if (size === null || !(size > 0) || value === null) return { avgPx: null, filledSz: null }
  return { avgPx: value / size, filledSz: size }
}

/** How long an Immediate-or-Cancel order is given to settle before it is read. */
let SETTLE_READS_MS = [250, 500, 1_000, 1_500]

/** Tests read back at once instead of waiting three seconds. */
export function setEdgexSettleDelaysForTests(delays: number[]): void {
  SETTLE_READS_MS = delays
}

async function readOrder(
  network: NetworkId,
  credential: EdgexCredential,
  orderId: string
): Promise<EdgexOrderRow | null> {
  const answer = await edgexPrivate(network, credential, "GET", BY_ID, { orderIdList: orderId }, { priority: "order" })
  const rows = Array.isArray(answer) ? answer : []
  const parsed = orderSchema.safeParse(rows.find((one) => String((one as { id?: unknown })?.id) === orderId))
  return parsed.success ? parsed.data : null
}

/**
 * Reads an order back until edgeX has finished with it. edgeX answers a new
 * order with its id alone, so the answer says nothing about a fill. A
 * resting order is read once; an Immediate-or-Cancel one until it is FILLED
 * or CANCELED.
 */
async function settledOrder(
  network: NetworkId,
  credential: EdgexCredential,
  orderId: string,
  waitForEnd: boolean
): Promise<EdgexOrderRow | null> {
  let last: EdgexOrderRow | null = null
  for (const wait of SETTLE_READS_MS) {
    await new Promise((resolve) => setTimeout(resolve, wait))
    // The order is already on edgeX. A read that fails here must not turn
    // into "the order failed", or a retry places it twice.
    const read = await readOrder(network, credential, orderId).catch(() => null)
    if (read) last = read
    const status = last?.status ?? ""
    if (!waitForEnd && status !== "PENDING" && status !== "") return last
    if (status === "FILLED" || status === "CANCELED") return last
  }
  return last
}

/**
 * Sends one order, and signs it once more if edgeX refused its signature.
 * The task's rule: a stale nonce or expiry is signed afresh once. A refused
 * order was never placed, so signing and sending it again cannot double it.
 */
async function sendOrder(
  network: NetworkId,
  context: OrderContext,
  terms: OrderTerms,
  refusal: EdgexRefusalContext,
  extra: Record<string, unknown> = {}
): Promise<string> {
  let answer: unknown
  try {
    answer = await send(network, context.credential, CREATE, { ...(await edgexOrderBody(context, terms)), ...extra }, refusal)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (!message.includes(edgexRefusalSentence("EDGEX_L2_SIGNATURE"))) throw error
    answer = await send(network, context.credential, CREATE, { ...(await edgexOrderBody(context, terms)), ...extra }, refusal)
  }
  const orderId = (answer as { orderId?: unknown } | null)?.orderId
  if (typeof orderId !== "string" && typeof orderId !== "number") {
    throw new Error(
      "LIVE_NO_ANSWER:edgeX took the order but answered with nothing Trade could read, so whether it rests is unknown. Check Open orders before placing it again."
    )
  }
  return String(orderId)
}

/** The worst price a stop or target signs, as edgeX's SDK signs it. */
function guardL2Price(contract: EdgexContract, closing: "BUY" | "SELL", mark: number): string {
  // A buy may pay up to ten times the oracle price and a sell take as little
  // as one tick: the SDK's `_get_market_order_price`. It is a cap written
  // into the signature, not the price the stop fills at.
  if (closing === "SELL") return onStep(contract.tickSize, contract.tickSize)
  return onStep(edgexSnapPrice(mark * 10, contract.tickSize, "up"), contract.tickSize)
}

/**
 * Places one order.
 *
 * - A resting order is a LIMIT with GOOD_TIL_CANCEL, or POST_ONLY when it
 *   must rest or be refused. A market order is a LIMIT with
 *   IMMEDIATE_OR_CANCEL at the 3% cap.
 * - Size snaps down to the market's step and price to its tick; an order
 *   below the smallest size is refused in dollars before anything is sent.
 * - A stock contract whose exchange is shut is refused before sending.
 * - A leverage on the order is set, and read back, first.
 * - An entry that knows its stop or target carries them as edgeX's open
 *   stop and target, each signed separately.
 */
export async function placeEdgexOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  return saying(async () => {
    assertPlaceOrderValues(params)
    const context = await orderContext(network, auth, params.marketId, !params.reduceOnly)
    const { contract } = context
    const side = params.side === "buy" ? "BUY" : "SELL"
    const crossing = params.kind === "market"

    if (edgexMarketOpen(network, contract.marketId) === false) {
      throw new Error(`LIVE_EXCHANGE:${closedSentence({ market: contract.base })}`)
    }
    const sz = edgexSnapSize(params.sz, contract.stepSize)
    if (!(sz >= contract.minOrderSize)) {
      const minUsd = contract.minOrderSize * params.px
      throw new Error(
        `LIVE_ORDER_TOO_SMALL:edgeX's smallest ${contract.base} order is ${decimalString(contract.minOrderSize)} ${contract.base}, about ${formatUsd(minUsd)} at this price. This order is ${formatUsd(sz * params.px)}. Use a bigger size.`
      )
    }
    if (contract.maxOrderSize !== null && sz > contract.maxOrderSize) {
      throw new Error(
        `LIVE_EXCHANGE:edgeX takes at most ${decimalString(contract.maxOrderSize)} ${contract.base} in one order on this market. Use a smaller size.`
      )
    }
    const asked = crossing
      ? params.px * (side === "BUY" ? 1 + EDGEX_THROUGH_PRICE : 1 - EDGEX_THROUGH_PRICE)
      : params.px
    // A cap never rounds past itself: a buy's cap rounds down, a sell's up.
    const px = edgexSnapPrice(
      asked,
      contract.tickSize,
      crossing ? (side === "BUY" ? "down" : "up") : "nearest"
    )
    if (!(px > 0)) throw new Error("LIVE_PRICE")

    let leverage =
      context.account.leverageByContract.get(contract.contractId) ??
      context.account.defaultLeverage ??
      contract.defaultLeverage
    if (params.leverage != null && params.leverage > 0) {
      leverage = await applyEdgexLeverage(network, context, params.leverage)
    }

    const size = onStep(sz, contract.stepSize)
    const price = onStep(px, contract.tickSize)
    const guarded = !params.reduceOnly && (params.tpPx !== null || params.slPx !== null)
    const orderId = await sendOrder(
      network,
      context,
      {
        side,
        type: "LIMIT",
        timeInForce: crossing
          ? "IMMEDIATE_OR_CANCEL"
          : params.kind === "postOnly"
            ? "POST_ONLY"
            : "GOOD_TIL_CANCEL",
        size,
        price,
        l2Price: price,
        reduceOnly: params.reduceOnly,
        clientOrderId: edgexClientOrderId(params.clientOrderId),
      },
      {
        // Named in dollars if edgeX says there is not enough cash: what is
        // free, and what this order holds at its leverage.
        minUsd: contract.minOrderSize * px,
        freeUsd: context.account.free,
        needUsd: (sz * px) / leverage,
        market: contract.base,
      },
      guarded ? await openGuardFields(context, params, side, size) : {}
    )

    const settled = await settledOrder(network, context.credential, orderId, crossing)
    const status = settled?.status ?? "PENDING"
    const { avgPx, filledSz } = filledFigures(settled)
    if (crossing && settled === null) {
      throw new Error(
        `LIVE_NO_ANSWER:edgeX took the order (${orderId}) but its result could not be read, so whether it filled is unknown. Check Positions and Open orders before placing it again.`
      )
    }
    if (crossing && !(filledSz !== null && filledSz > 0)) {
      throw new Error(
        "LIVE_EXCHANGE:edgeX had nothing to fill within 3% of the price, so nothing was bought or sold. Try again, or place a limit order."
      )
    }
    if (!crossing && status === "CANCELED") {
      throw new Error(
        params.kind === "postOnly"
          ? "LIVE_EXCHANGE:edgeX cancelled the order because it would have filled at once, and it was sent to rest only. Move the price further from the market."
          : "LIVE_EXCHANGE:edgeX cancelled the order as soon as it arrived. Check Open orders and the account on edgeX before trying again."
      )
    }
    return {
      status: status === "FILLED" || (crossing && filledSz !== null) ? "filled" : "resting",
      orderId,
      avgPx,
      filledSz,
      protection: guarded ? "ok" : null,
      protectionNote: null,
    }
  })
}

/**
 * The stop and target an entry carries with it, as edgeX's `openSl` and
 * `openTp`: each its own signed order for the entry's size, closing on the
 * opposite side, triggered on the oracle price, with a worst price 3%
 * through its trigger. edgeX's SDK shows the fields and not their meaning,
 * so this leg shape is unproven until Tyler's first real order carries one.
 */
async function openGuardFields(
  context: OrderContext,
  params: PlaceOrderParams,
  entrySide: "BUY" | "SELL",
  size: string
): Promise<Record<string, unknown>> {
  const closing = entrySide === "BUY" ? "SELL" : "BUY"
  const fields: Record<string, unknown> = {}
  for (const [kind, trigger] of [
    ["Sl", params.slPx],
    ["Tp", params.tpPx],
  ] as const) {
    if (trigger === null) continue
    const worst = trigger * (closing === "SELL" ? 1 - EDGEX_THROUGH_PRICE : 1 + EDGEX_THROUGH_PRICE)
    const price = onStep(
      edgexSnapPrice(worst, context.contract.tickSize, closing === "SELL" ? "up" : "down"),
      context.contract.tickSize
    )
    const clientOrderId = edgexClientOrderId(null)
    const signed = await signEdgexOrder({
      credential: context.credential,
      facts: context.facts,
      contract: context.contract,
      side: closing,
      size,
      l2Price: price,
      clientOrderId,
    })
    fields[`isSetOpen${kind}`] = true
    fields[`open${kind}`] = {
      side: closing,
      price,
      size,
      clientOrderId,
      triggerPrice: onStep(
        edgexSnapPrice(trigger, context.contract.tickSize, "nearest"),
        context.contract.tickSize
      ),
      triggerPriceType: "ORACLE_PRICE",
      ...signed,
    }
  }
  return fields
}

/** What edgeX said about each order a cancel named. */
function cancelled(answer: unknown, orderId: string): string | null {
  const result = (answer as { cancelResultMap?: Record<string, unknown> } | null)?.cancelResultMap?.[orderId]
  return typeof result === "string" ? result : null
}

/**
 * Cancels one order by edgeX's own id. edgeX answers SUCCESS for the request
 * and a result per order inside it, so the order's own result is read: an
 * order that already filled or was cancelled is said to be gone.
 */
export async function cancelEdgexOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  return saying(async () => {
    if (!/^\d+$/.test(params.orderId)) throw new Error("LIVE_ORDER_ID")
    const credential = parseEdgexCredential(auth.agentKey)
    const answer = await send(network, credential, CANCEL, { orderIdList: [params.orderId] })
    const result = cancelled(answer, params.orderId)
    if (result !== null && result !== "SUCCESS") {
      throw new Error(`LIVE_ORDER_REFUSED:${edgexRefusalSentence("EDGEX_ORDER_GONE")}`)
    }
  })
}

/**
 * Moves a resting order: cancel, then place. edgeX has no amend call.
 * Cancelling first means the worst case is no order rather than two; when
 * the place fails after the cancel went through, the refusal says exactly
 * that.
 */
export async function modifyEdgexOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: {
    marketId: string
    orderId: string
    side: "buy" | "sell"
    px: number
    sz: number
    reduceOnly: boolean
  }
): Promise<void> {
  assertOrderValue(params.sz, "LIVE_SIZE")
  assertOrderValue(params.px, "LIVE_PRICE")
  await cancelEdgexOrder(network, auth, params)
  try {
    await placeEdgexOrder(network, auth, {
      marketId: params.marketId,
      side: params.side,
      kind: "limit",
      px: params.px,
      sz: params.sz,
      reduceOnly: params.reduceOnly,
      leverage: null,
      tpPx: null,
      slPx: null,
    })
  } catch (error) {
    const said = /^[A-Z][A-Z0-9_]*:([^]+)$/.exec(error instanceof Error ? error.message : "")?.[1]
    throw new Error(
      `LIVE_MOVE_HALF_DONE:The old order came off, but edgeX refused the new one${said ? ` (${said.trim()})` : ""}. No order is resting there now. Place it again at the price you want.`
    )
  }
}

/** Closes the whole position with a reduce-only IOC at the 3% cap. */
export async function closeEdgexPosition(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; szi: number }
): Promise<{ avgPx: number | null; filledSz: number | null }> {
  return saying(async () => {
    if (!(params.szi !== 0)) throw new Error("LIVE_POSITION_GONE")
    const mark = (await fetchEdgexPrices(network, [params.marketId], { forOrder: true })).get(
      params.marketId
    )
    if (mark === undefined) {
      throw new Error("LIVE_EXCHANGE:edgeX gave no price for this market, so the close was not sent.")
    }
    const outcome = await placeEdgexOrder(network, auth, {
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
  })
}

/**
 * Sets one contract's leverage and reads it back.
 *
 * On edgeX leverage is a setting per contract, over an account-wide default
 * (contract 0), and an order uses whatever the contract was last set to. So
 * it is set before the first order on a contract and read back from the
 * account, never assumed to have taken. edgeX refuses the change while the
 * contract has open orders (`ACCOUNT_UPDATE_LEVERAGE_FAILED_ORDER`, from its
 * SDK's tests), and that refusal is its own sentence.
 */
async function applyEdgexLeverage(
  network: NetworkId,
  context: OrderContext,
  leverage: number
): Promise<number> {
  const { contract } = context
  if (!(leverage >= 1) || leverage > contract.maxLeverage + 1e-9) {
    throw new Error(
      `LIVE_LEVERAGE:edgeX allows 1x to ${contract.maxLeverage}x on ${contract.base}. Pick a leverage in that range.`
    )
  }
  const whole = Math.floor(leverage)
  const held = context.account.leverageByContract.get(contract.contractId)
  if (held === whole) return whole
  await send(network, context.credential, LEVERAGE, {
    contractId: contract.contractId,
    leverage: String(whole),
  })
  const read = await readEdgexAccount(network, context.credential, "order")
  const now = read.leverageByContract.get(contract.contractId)
  if (now !== whole) {
    throw new Error(
      `LIVE_LEVERAGE:edgeX answered the leverage change but ${now === undefined ? "states no leverage" : `still holds ${now}x`} on ${contract.base}. Nothing else was sent.`
    )
  }
  return whole
}

/** Changes the leverage on a market, open position or not. */
export async function setEdgexLeverage(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; leverage: number; szi: number }
): Promise<void> {
  return saying(async () => {
    const context = await orderContext(network, auth, params.marketId, false)
    await applyEdgexLeverage(network, context, params.leverage)
  })
}

/** Every open order, stops and targets included, 200 a page. */
async function readOpenOrders(
  network: NetworkId,
  credential: EdgexCredential,
  priority: "background" | "order" = "background"
): Promise<EdgexOrderRow[]> {
  const rows: EdgexOrderRow[] = []
  let offsetData = ""
  for (let page = 0; page < 5; page += 1) {
    const answer = (await edgexPrivate(
      network,
      credential,
      "GET",
      ACTIVE,
      { size: 200, offsetData },
      { priority }
    )) as { dataList?: unknown[]; nextPageOffsetData?: unknown } | null
    for (const raw of Array.isArray(answer?.dataList) ? answer.dataList : []) {
      const parsed = orderSchema.safeParse(raw)
      if (parsed.success) rows.push(parsed.data)
    }
    offsetData = typeof answer?.nextPageOffsetData === "string" ? answer.nextPageOffsetData : ""
    if (!offsetData) break
  }
  return rows
}

/** The position rows with their stops and targets read off the open orders. */
export function withEdgexProtection(
  positions: WalletPosition[],
  orders: ReadonlyArray<EdgexOrderRow & { marketId: string }>
): WalletPosition[] {
  return positions.map((position) => {
    const guards = orders.filter(
      (order) =>
        order.marketId === position.marketId &&
        isEdgexTrigger(order.type) &&
        (order.reduceOnly === true || order.isPositionTpsl === true)
    )
    const stop = guards.find((order) => order.type?.startsWith("STOP_"))
    const targets = guards
      .filter((order) => order.type?.startsWith("TAKE_PROFIT_"))
      .flatMap((order) => {
        const px = num(order.triggerPrice)
        if (px === null) return []
        return [{ px, sz: order.isPositionTpsl ? null : num(order.size), orderId: String(order.id) }]
      })
      .sort((left, right) => left.px - right.px)
    const slPx = num(stop?.triggerPrice)
    return {
      ...position,
      targets,
      tpPx: targets[0]?.px ?? null,
      tpSz: targets[0]?.sz ?? null,
      tpOrderId: targets[0]?.orderId ?? null,
      slPx,
      slOrderId: stop ? String(stop.id) : null,
      ...(stop && !stop.isPositionTpsl ? { slSz: num(stop.size) ?? undefined } : {}),
      protectionOrderIds: guards.map((order) => String(order.id)),
    }
  })
}

/** Open orders with the market id each belongs to. */
async function namedOrders(
  network: NetworkId,
  rows: readonly EdgexOrderRow[]
): Promise<Array<EdgexOrderRow & { marketId: string }>> {
  const named: Array<EdgexOrderRow & { marketId: string }> = []
  for (const order of rows) {
    const marketId =
      order.contractId === undefined ? null : await edgexMarketIdOf(network, String(order.contractId))
    if (marketId !== null) named.push({ ...order, marketId })
  }
  return named
}

/** What a live wallet holds and has waiting, from edgeX itself. */
export async function fetchEdgexPortfolio(
  network: NetworkId,
  _address: string,
  credential: () => string | null,
  priority: "background" | "order" = "background"
): Promise<WalletPortfolio> {
  const edgex = edgexCredentialFrom(credential)
  const read = await readEdgexAccount(network, edgex, priority)
  const positions = await toEdgexWalletPositions(network, read)
  let rows: Array<EdgexOrderRow & { marketId: string }>
  try {
    rows = await namedOrders(network, await readOpenOrders(network, edgex, priority))
  } catch {
    // The positions still stand; an empty list here must not read as "no
    // orders", so the answer says the orders could not be read.
    return { positions, orders: [], ordersUnavailable: true }
  }
  const orders: WalletOpenOrder[] = rows.flatMap((order) => {
    const trigger = isEdgexTrigger(order.type)
    const px = num(trigger ? order.triggerPrice : order.price)
    const filled = num(order.cumFillSize) ?? 0
    const size = num(order.size)
    const side = order.side?.toUpperCase()
    if (px === null || size === null || (side !== "BUY" && side !== "SELL")) return []
    return [
      {
        orderId: String(order.id),
        marketId: order.marketId,
        side: side === "BUY" ? ("buy" as const) : ("sell" as const),
        px,
        sz: Math.max(0, size - filled),
        reduceOnly: order.reduceOnly === true || order.isPositionTpsl === true,
        trigger,
      },
    ]
  })
  return { positions: withEdgexProtection(positions, rows), orders }
}

/**
 * What one order was, asked after it is gone: a stop, a target or neither.
 * edgeX still answers an order by its id once it has filled or been
 * cancelled.
 */
export async function fetchEdgexOrderInfo(
  network: NetworkId,
  _address: string,
  orderId: string,
  _marketId: string,
  credential: () => string | null
): Promise<WalletOrderInfo> {
  if (!/^\d+$/.test(orderId)) return { kind: "none", triggerPx: null }
  const row = await readOrder(network, edgexCredentialFrom(credential), orderId)
  if (!row) return { kind: "none", triggerPx: null }
  const type = row.type ?? ""
  const triggerPx = num(row.triggerPrice)
  const shown = triggerPx !== null && triggerPx > 0 ? triggerPx : null
  if (type.startsWith("STOP_")) return { kind: "stop", triggerPx: shown }
  if (type.startsWith("TAKE_PROFIT_")) return { kind: "target", triggerPx: shown }
  return { kind: "none", triggerPx: null }
}

/**
 * A refusal in words the trading screens show, wrapped around the whole
 * operation, as on ApeX and Lighter.
 */
async function saying<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/^(LIVE_[A-Z_]+|EXCHANGE_BUSY)(:|$)/.test(message)) throw new Error(message)
    const said = /^[A-Z][A-Z0-9_]*:([^]+)$/.exec(message)?.[1]
    throw new Error(`LIVE_EXCHANGE:${said ? said.trim() : scrubbedMessage(error)}`)
  }
}

/** Refuses a stop or target on the side of the price it would fire on at once. */
export function edgexWrongSide(
  szi: number,
  mark: number,
  slPx: number | null,
  targets: ReadonlyArray<{ px: number }>
): string | null {
  const long = szi > 0
  if (slPx !== null && (long ? slPx >= mark : slPx <= mark)) {
    return `A ${long ? "long" : "short"} position's stop has to sit ${long ? "below" : "above"} the price, which is ${decimalString(mark)} now. Move the stop to the other side.`
  }
  for (const target of targets) {
    if (long ? target.px <= mark : target.px >= mark) {
      return `A ${long ? "long" : "short"} position's target has to sit ${long ? "above" : "below"} the price, which is ${decimalString(mark)} now. Move the target to the other side.`
    }
  }
  return null
}

/**
 * Places one stop or target on a position as edgeX's own conditional order:
 * STOP_MARKET or TAKE_PROFIT_MARKET, reduce-only, triggered on the oracle
 * price. Its price is "0" and its signature carries the SDK's worst price,
 * as edgeX's own code sends one. A stop for the whole position is flagged
 * `isPositionTpsl`; a fixed size (a grid's own stop) is an ordinary
 * reduce-only one.
 */
async function placeEdgexGuard(
  network: NetworkId,
  context: OrderContext,
  leg: {
    kind: "stop" | "target"
    closing: "BUY" | "SELL"
    triggerPx: number
    size: number
    wholePosition: boolean
    mark: number
  }
): Promise<string> {
  const { contract } = context
  const size = onStep(edgexSnapSize(leg.size, contract.stepSize), contract.stepSize)
  if (!(Number(size) > 0)) throw new Error("LIVE_SIZE")
  return sendOrder(
    network,
    context,
    {
      side: leg.closing,
      type: leg.kind === "stop" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET",
      timeInForce: "IMMEDIATE_OR_CANCEL",
      size,
      price: "0",
      l2Price: guardL2Price(contract, leg.closing, leg.mark),
      reduceOnly: true,
      clientOrderId: edgexClientOrderId(null),
      trigger: {
        price: onStep(edgexSnapPrice(leg.triggerPx, contract.tickSize, "nearest"), contract.tickSize),
        positionWide: leg.wholePosition,
      },
    },
    { market: contract.base }
  )
}

/** Whether an open order is a guard on this contract. */
function isGuardOn(order: EdgexOrderRow, contractId: string): boolean {
  return (
    String(order.contractId ?? "") === contractId &&
    isEdgexTrigger(order.type) &&
    (order.reduceOnly === true || order.isPositionTpsl === true)
  )
}

/**
 * Replaces the stop and targets on a position, never leaving it uncovered.
 *
 * edgeX has no amend, so a moved stop is a new order. The order of work is
 * the whole point:
 *
 * 1. The new stop and targets are placed.
 * 2. They are read back from the open orders. One edgeX has not listed is
 *    not trusted, and nothing old is touched.
 * 3. Only then is every old guard on this contract cancelled, the ones the
 *    caller named and any leftover the read found. One that will not cancel
 *    is named, so the screen can say which stop still stands.
 *
 * If a place fails, the old stop stands and the sentence says so.
 */
export async function setEdgexBrackets(
  network: NetworkId,
  auth: OrderAuth,
  params: {
    marketId: string
    position: Pick<WalletPosition, "szi" | "protectionOrderIds">
    targets: Array<{ px: number; sz: number | null }>
    slPx: number | null
    slSz: number | null
  }
): Promise<{ slOrderId: string | null }> {
  return saying(async () => {
    const { szi } = params.position
    if (szi === 0) throw new Error("LIVE_POSITION_GONE")
    if (params.slPx !== null) assertOrderValue(params.slPx, "LIVE_PRICE")
    for (const target of params.targets) assertOrderValue(target.px, "LIVE_PRICE")
    const context = await orderContext(network, auth, params.marketId, false)
    const closing = szi > 0 ? "SELL" : "BUY"

    // Clearing every guard needs no price; placing one needs it for the
    // wrong-side check and for the worst price a buy stop signs.
    const placing = params.slPx !== null || params.targets.length > 0
    let mark = 0
    if (placing) {
      const read = (await fetchEdgexPrices(network, [params.marketId], { forOrder: true })).get(params.marketId)
      if (read === undefined) {
        throw new Error("LIVE_EXCHANGE:edgeX gave no price for this market, so the stop was not sent and the old one stands.")
      }
      mark = read
      const wrong = edgexWrongSide(szi, mark, params.slPx, params.targets)
      if (wrong) throw new Error(`LIVE_EXCHANGE:${wrong}`)
    }

    const before = await readOpenOrders(network, context.credential, "order")
    const oldGuards = new Set(params.position.protectionOrderIds)
    for (const order of before) {
      if (isGuardOn(order, context.contract.contractId)) oldGuards.add(String(order.id))
    }

    const placed: string[] = []
    let slOrderId: string | null = null
    try {
      if (params.slPx !== null) {
        slOrderId = await placeEdgexGuard(network, context, {
          kind: "stop",
          closing,
          triggerPx: params.slPx,
          size: params.slSz ?? Math.abs(szi),
          wholePosition: params.slSz === null,
          mark,
        })
        placed.push(slOrderId)
      }
      for (const target of params.targets) {
        placed.push(
          await placeEdgexGuard(network, context, {
            kind: "target",
            closing,
            triggerPx: target.px,
            size: target.sz ?? Math.abs(szi),
            wholePosition: target.sz === null,
            mark,
          })
        )
      }
    } catch (error) {
      const said = /^[A-Z][A-Z0-9_]*:([^]+)$/.exec(error instanceof Error ? error.message : "")?.[1]
      throw new Error(
        `LIVE_BRACKET_REPLACE_PARTIAL:edgeX refused the new stop or target${said ? ` (${said.trim()})` : ""}. ${oldGuards.size > 0 ? "The old stop and target still stand." : "The position has no stop."}${placed.length > 0 ? " Part of the new set went on, so check Open orders." : ""}`
      )
    }

    if (placed.length > 0) {
      const listed = await readOpenOrders(network, context.credential, "order").catch(() => null)
      if (listed === null) {
        throw new Error(
          "LIVE_BRACKET_REPLACE_PARTIAL:The new stop was sent, but edgeX's order list could not be read to confirm it, so the old stop was left on as well. Check Open orders on edgeX and cancel whichever you do not want."
        )
      }
      const resting = new Set(listed.map((order) => String(order.id)))
      if (placed.some((id) => !resting.has(id))) {
        throw new Error(
          "LIVE_BRACKET_REPLACE_PARTIAL:edgeX took the new stop but does not list it as waiting, so the old stop was left on. Check Open orders on edgeX before moving it again."
        )
      }
    }

    const stuck: string[] = []
    for (const orderId of oldGuards) {
      if (placed.includes(orderId)) continue
      try {
        const answer = await send(network, context.credential, CANCEL, { orderIdList: [orderId] })
        const result = cancelled(answer, orderId)
        // An order that already fired or lapsed is gone, and that is fine.
        if (result !== null && result !== "SUCCESS" && !/NOT_?FOUND|NOT_?EXIST|FILLED|CANCELL?ED/.test(result)) {
          stuck.push(orderId)
        }
      } catch (error) {
        if (!(error instanceof Error && error.message.includes(edgexRefusalSentence("EDGEX_ORDER_GONE")))) {
          stuck.push(orderId)
        }
      }
    }
    if (stuck.length > 0) {
      throw new Error(
        `LIVE_BRACKET_REPLACE_DOUBLED:The new stop is on, but edgeX would not cancel the old one (order ${stuck.join(", ")}), so both are waiting. Cancel the old one in Open orders; if both fire the position is sold twice over.`
      )
    }
    return { slOrderId }
  })
}
