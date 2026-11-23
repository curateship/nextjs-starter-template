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
import { num } from "@/lib/protocols/apex/translate"
import {
  apexCredentialFrom,
  forgetApexAccountRead,
  readApexAccount,
  toApexWalletPositions,
} from "@/server/protocols/apex/account"
import {
  apexContract,
  apexMarketIdOf,
  type ApexContract,
} from "@/server/protocols/apex/catalogue"
import {
  apexPrivate,
  parseApexCredential,
  type ApexCredential,
} from "@/server/protocols/apex/client"
import { fetchApexPrices } from "@/server/protocols/apex/markets"
import { apexRefusalSentence } from "@/server/protocols/apex/refusals"
import { signApexContract } from "@/server/protocols/apex/signer"
import {
  assertOrderValue,
  assertPlaceOrderValues,
  decimalString,
} from "@/server/protocols/connector-helpers"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import { scrubbedMessage } from "@/server/protocols/scrub"
import { venueTouched } from "@/server/protocols/touched"
import { formatUsd } from "@/lib/trade/format"

/**
 * **A market order is a limit order with Immediate-or-Cancel, capped 3%
 * through the price.** Never ApeX's own MARKET type (`trading-rules.md`).
 * ApeX signs a price into every order anyway, and its docs say the price of
 * an order meant to cross must be worse than the index or it is cancelled.
 */
export const APEX_THROUGH_PRICE = 0.03

/**
 * How long an order lives. ApeX's docs recommend 28 days, and a stop or a
 * target must not quietly lapse after a day while the position it guards is
 * still open. Written in milliseconds on the hour, as the docs' formula
 * gives it; the zkLink signature does not cover it.
 */
const ORDER_LIFE_MS = 28 * 24 * 3_600_000

export function apexExpiration(now = Date.now()): number {
  return Math.floor((now + ORDER_LIFE_MS) / 3_600_000) * 3_600_000
}

/** ApeX's documented cap on one account's open orders. */
const APEX_OPEN_ORDER_CAP = 200

/**
 * The client order id ApeX gets.
 *
 * The app hands watched orders an id like Hyperliquid's, `0x` and 32 hex
 * characters. ApeX's connector hashes an id starting `0x` as bytes rather
 * than text, which would sign something ApeX's server may not expect, so the
 * `0x` is dropped and `trade-` put in front. The same id in always gives the
 * same id out, so a lost answer can still be looked up by it.
 */
export function apexClientOrderId(given?: string | null): string {
  const core = given?.replace(/^0x/i, "").replace(/[^0-9A-Za-z-]/g, "") ?? ""
  return `trade-${core || randomBytes(12).toString("hex")}`
}

/** A price on the market's tick, rounded the way that never overpays. */
export function apexSnapPrice(
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
export function apexSnapSize(sz: number, step: number): number {
  return Number((Math.floor(sz / step + 1e-9) * step).toFixed(12))
}

/** Decimal text on the tick or step, without float dust or exponents. */
function onStep(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  return decimalString(Number(value.toFixed(decimals)))
}

/** The fee cap ApeX signs against: price x size x taker rate, up to 6 places. */
export function apexLimitFee(price: string, size: string, takerFeeRate: string): string {
  const fee = Number(price) * Number(size) * Number(takerFeeRate)
  return (Math.ceil(fee * 1e6 - 1e-6) / 1e6).toFixed(6)
}

type OrderContext = {
  credential: ApexCredential
  contract: ApexContract
  accountId: string
  makerFeeRate: string
  takerFeeRate: string
  /** What the account had free when this order was prepared. */
  freeUsd: number
  /** The margin rate this market is held at on the account now. */
  marginRate: number
}

/**
 * Everything one order needs: the credential, the market's facts and the
 * account's ids and fee rates. Refuses, in words, the markets Trade does not
 * trade on ApeX.
 */
async function orderContext(
  network: NetworkId,
  auth: OrderAuth,
  marketId: string,
  opening: boolean
): Promise<OrderContext> {
  const credential = parseApexCredential(auth.agentKey)
  const contract = await apexContract(network, marketId, "order").catch((error: unknown) => {
    // The catalogue lists only perpetual and stock contracts ApeX has
    // switched trading on for, and never a prelaunch contract or a
    // prediction market, so anything else is refused in words.
    if (error instanceof Error && error.message === "APEX_MARKET_UNKNOWN") {
      throw new Error(
        "LIVE_EXCHANGE:ApeX Omni does not list this market for trading now. It may be a prelaunch contract or a prediction market, which Trade never trades, or ApeX may have switched it off."
      )
    }
    throw error
  })
  // ApeX trades stock, index and commodity contracts from a separate RWA
  // account with its own keys and its own signing seed (its docs, "RWA").
  // Sent from the main account they are refused with PermissionDenied, so
  // they are refused here first, with the reason.
  if (contract.kind === "stock") {
    throw new Error(`LIVE_EXCHANGE:${apexRefusalSentence("APEX_STOCK_ACCOUNT")}`)
  }
  if (opening && !contract.canOpen) {
    throw new Error(`LIVE_EXCHANGE:${apexRefusalSentence("APEX_OPEN_CLOSED")}`)
  }
  const account = await readApexAccount(network, credential, "order")
  const { facts } = account.read
  if (facts.makerFeeRate === "" || facts.takerFeeRate === "") {
    throw new Error(
      "LIVE_EXCHANGE:ApeX Omni did not state this account's fee rates, which every order has to sign. Nothing was sent."
    )
  }
  return {
    credential,
    contract,
    accountId: facts.accountId,
    makerFeeRate: facts.makerFeeRate,
    takerFeeRate: facts.takerFeeRate,
    freeUsd: account.balance.free,
    marginRate:
      account.read.positions.find((one) => one.symbol === contract.symbol)
        ?.customMarginRate ?? contract.defaultInitialMarginRate,
  }
}

/**
 * The one door every change to an ApeX account goes through: both
 * real-money switches, then the signed POST, then the held account read
 * dropped so the next panel sees what changed.
 */
async function send(
  network: NetworkId,
  credential: ApexCredential,
  path: string,
  body: Record<string, string | number | boolean | undefined>,
  context: Parameters<typeof apexPrivate>[5] = {}
): Promise<unknown> {
  await assertRealMoneyAllowed(network)
  try {
    return await apexPrivate(network, credential, "POST", path, body, {
      priority: "order",
      ...context,
    })
  } finally {
    // Rung when the request finishes, not when it starts, for the reason
    // KuCoin's client gives: a read taken mid-change must not be held.
    venueTouched("apex")
    forgetApexAccountRead(network, credential)
  }
}

type Leg = {
  side: "BUY" | "SELL"
  size: string
  price: string
  clientOrderId: string
}

/** Signs one order leg the way ApeX's connector does. */
async function signLeg(context: OrderContext, leg: Leg): Promise<string> {
  const { signature } = await signApexContract(context.credential.omniKey, {
    accountId: context.accountId,
    clientOrderId: leg.clientOrderId,
    l2PairId: context.contract.l2PairId,
    size: leg.size,
    price: leg.price,
    side: leg.side,
    makerFeeRate: context.makerFeeRate,
    takerFeeRate: context.takerFeeRate,
  })
  return signature
}

const orderSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    clientOrderId: z.string().optional(),
    clientId: z.string().optional(),
    symbol: z.string().optional(),
    side: z.string().optional(),
    type: z.string().optional(),
    price: z.union([z.string(), z.number()]).optional(),
    triggerPrice: z.union([z.string(), z.number()]).optional(),
    size: z.union([z.string(), z.number()]).optional(),
    remainingSize: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    reduceOnly: z.union([z.boolean(), z.string()]).optional(),
    isPositionTpsl: z.union([z.boolean(), z.string()]).optional(),
    cancelReason: z.string().optional(),
    cumSuccessFillSize: z.union([z.string(), z.number()]).optional(),
    cumSuccessFillValue: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

export type ApexOrderRow = z.infer<typeof orderSchema>

function isTrue(value: unknown): boolean {
  return value === true || value === "true"
}

/** Whether an order waits at a trigger rather than resting in the book. */
export function isApexTrigger(type: string | undefined): boolean {
  return /^(STOP|TAKE_PROFIT)_/.test(type ?? "")
}

/** How long an Immediate-or-Cancel order is given to settle before it is read. */
let SETTLE_READS_MS = [250, 500, 1_000, 1_500]

/** Tests read back at once instead of waiting three seconds. */
export function setApexSettleDelaysForTests(delays: number[]): void {
  SETTLE_READS_MS = delays
}

/**
 * Reads an order back until ApeX has finished with it.
 *
 * ApeX answers an order with PENDING before it has been matched, so the
 * answer to the POST says nothing about a fill. A resting order is read once;
 * an Immediate-or-Cancel one is read until it is FILLED or CANCELED.
 */
async function settledOrder(
  network: NetworkId,
  credential: ApexCredential,
  orderId: string,
  waitForEnd: boolean
): Promise<ApexOrderRow | null> {
  let last: ApexOrderRow | null = null
  for (const wait of SETTLE_READS_MS) {
    await new Promise((resolve) => setTimeout(resolve, wait))
    // The order is already on ApeX. A read that fails here must not turn
    // into "the order failed", or a retry places it twice; the next read
    // tries again, and the caller decides what an unread answer means.
    const answer = await apexPrivate(network, credential, "GET", "/order", { id: orderId }, { priority: "order" }).catch(
      () => null
    )
    const parsed = orderSchema.safeParse(answer)
    if (parsed.success) last = parsed.data
    const status = last?.status ?? ""
    if (!waitForEnd && status !== "PENDING") return last
    if (status === "FILLED" || status === "CANCELED" || status === "EXPIRED") return last
  }
  return last
}

function filledFigures(row: ApexOrderRow | null): { avgPx: number | null; filledSz: number | null } {
  const size = num(row?.cumSuccessFillSize)
  const value = num(row?.cumSuccessFillValue)
  if (size === null || !(size > 0) || value === null) return { avgPx: null, filledSz: null }
  return { avgPx: value / size, filledSz: size }
}

/**
 * Places one order.
 *
 * - A resting order is a LIMIT with GOOD_TIL_CANCEL, or POST_ONLY when it
 *   must rest or be refused. A market order is a LIMIT with
 *   IMMEDIATE_OR_CANCEL at the 3% cap.
 * - Size snaps down to the market's step and price to its tick; an order
 *   below the smallest size is refused in dollars before anything is sent.
 * - A leverage on the first order of a market is set, and read back, first.
 * - An entry that knows its stop or target carries them as ApeX's own
 *   open-TPSL legs, each signed separately, so they exist the moment the
 *   position does.
 */
export async function placeApexOrder(
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

    const sz = apexSnapSize(params.sz, contract.stepSize)
    if (!(sz >= contract.minOrderSize)) {
      const minUsd = contract.minOrderSize * params.px
      throw new Error(
        `LIVE_ORDER_TOO_SMALL:ApeX Omni's smallest ${contract.base} order is ${decimalString(contract.minOrderSize)} ${contract.base}, about ${formatUsd(minUsd)} at this price. This order is ${formatUsd(sz * params.px)}. Use a bigger size.`
      )
    }
    if (contract.maxOrderSize !== null && sz > contract.maxOrderSize) {
      throw new Error(
        `LIVE_EXCHANGE:ApeX Omni takes at most ${decimalString(contract.maxOrderSize)} ${contract.base} in one order on this market. Use a smaller size.`
      )
    }
    const asked = crossing
      ? params.px * (side === "BUY" ? 1 + APEX_THROUGH_PRICE : 1 - APEX_THROUGH_PRICE)
      : params.px
    // A cap never rounds past itself: a buy's cap rounds down, a sell's up.
    const px = apexSnapPrice(
      asked,
      contract.tickSize,
      crossing ? (side === "BUY" ? "down" : "up") : "nearest"
    )
    if (!(px > 0)) throw new Error("LIVE_PRICE")

    if (!crossing && !params.reduceOnly) {
      const open = await readOpenOrders(network, context.credential, "order")
      if (open.length >= APEX_OPEN_ORDER_CAP) {
        throw new Error(`LIVE_EXCHANGE:${apexRefusalSentence("APEX_TOO_MANY_ORDERS")}`)
      }
    }

    if (params.leverage != null && params.leverage > 0) {
      await applyApexLeverage(network, context, params.leverage)
    }

    const size = onStep(sz, contract.stepSize)
    const price = onStep(px, contract.tickSize)
    const clientOrderId = apexClientOrderId(params.clientOrderId)
    const expiration = apexExpiration()
    const body: Record<string, string | number | boolean | undefined> = {
      symbol: contract.symbol,
      side,
      type: "LIMIT",
      size,
      price,
      limitFee: apexLimitFee(price, size, context.takerFeeRate),
      expiration,
      timeInForce: crossing
        ? "IMMEDIATE_OR_CANCEL"
        : params.kind === "postOnly"
          ? "POST_ONLY"
          : "GOOD_TIL_CANCEL",
      reduceOnly: params.reduceOnly,
      // ApeX's docs name it clientOrderId and its Node connector sends
      // clientId; both carry the same id.
      clientOrderId,
      clientId: clientOrderId,
      signature: await signLeg(context, { side, size, price, clientOrderId }),
    }

    const guarded =
      !params.reduceOnly && (params.tpPx !== null || params.slPx !== null)
    if (guarded) {
      Object.assign(body, await openGuardLegs(context, params, side, size, expiration))
    }

    const answer = await send(network, context.credential, "/order", body, {
      // Named in dollars if ApeX says there is not enough cash: what is
      // free, and what this order holds at its leverage.
      context: {
        minUsd: contract.minOrderSize * px,
        freeUsd: context.freeUsd,
        needUsd:
          params.leverage != null && params.leverage > 0
            ? (sz * px) / params.leverage
            : sz * px * context.marginRate,
      },
    })
    const placed = orderSchema.safeParse(answer)
    if (!placed.success) {
      throw new Error(
        "LIVE_NO_ANSWER:ApeX Omni took the order but answered with nothing Trade could read, so whether it rests is unknown. Check Open orders before placing it again."
      )
    }
    const orderId = String(placed.data.id)
    const settled = await settledOrder(network, context.credential, orderId, crossing)
    const status = settled?.status ?? placed.data.status ?? "PENDING"
    const { avgPx, filledSz } = filledFigures(settled)

    if (crossing && settled === null) {
      throw new Error(
        `LIVE_NO_ANSWER:ApeX Omni took the order (${orderId}) but its result could not be read, so whether it filled is unknown. Check Positions and Open orders before placing it again.`
      )
    }
    if (crossing && !(filledSz !== null && filledSz > 0)) {
      throw new Error(
        `LIVE_EXCHANGE:ApeX Omni had nothing to fill within 3% of the price, so nothing was bought or sold. Try again, or place a limit order.`
      )
    }
    if (!crossing && (status === "CANCELED" || status === "EXPIRED")) {
      throw new Error(
        params.kind === "postOnly"
          ? "LIVE_EXCHANGE:ApeX Omni cancelled the order because it would have filled at once, and it was sent to rest only. Move the price further from the market."
          : "LIVE_EXCHANGE:ApeX Omni cancelled the order as soon as it arrived. Check Open orders and the account on ApeX before trying again."
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
 * The stop and target an entry carries with it, as ApeX's open-TPSL
 * fields. Each leg is its own signed order for the entry's size, closing on
 * the opposite side, with a worst price 3% through its trigger.
 */
async function openGuardLegs(
  context: OrderContext,
  params: PlaceOrderParams,
  entrySide: "BUY" | "SELL",
  size: string,
  expiration: number
): Promise<Record<string, string | number | boolean>> {
  const closing = entrySide === "BUY" ? "SELL" : "BUY"
  const fields: Record<string, string | number | boolean> = { isOpenTpslOrder: true }
  for (const [kind, trigger] of [
    ["sl", params.slPx],
    ["tp", params.tpPx],
  ] as const) {
    if (trigger === null) continue
    const { price, triggerPrice } = triggerPrices(context.contract, closing, trigger)
    const clientOrderId = apexClientOrderId(null)
    Object.assign(fields, {
      [kind === "sl" ? "isSetOpenSl" : "isSetOpenTp"]: true,
      [`${kind}Side`]: closing,
      [`${kind}Size`]: size,
      [`${kind}Price`]: price,
      [`${kind}TriggerPrice`]: triggerPrice,
      [`${kind}TriggerPriceType`]: "MARKET",
      [`${kind}LimitFee`]: apexLimitFee(price, size, context.takerFeeRate),
      [`${kind}ClientOrderId`]: clientOrderId,
      [`${kind}Expiration`]: expiration,
      [`${kind}Signature`]: await signLeg(context, { side: closing, size, price, clientOrderId }),
    })
  }
  return fields
}

/** A trigger on the tick, and the worst price 3% through it. */
function triggerPrices(
  contract: ApexContract,
  closing: "BUY" | "SELL",
  trigger: number
): { price: string; triggerPrice: string } {
  const worst = trigger * (closing === "SELL" ? 1 - APEX_THROUGH_PRICE : 1 + APEX_THROUGH_PRICE)
  return {
    triggerPrice: onStep(apexSnapPrice(trigger, contract.tickSize, "nearest"), contract.tickSize),
    price: onStep(
      apexSnapPrice(worst, contract.tickSize, closing === "SELL" ? "up" : "down"),
      contract.tickSize
    ),
  }
}

/** Cancels one order by ApeX's own id. */
export async function cancelApexOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  return saying(async () => {
    if (!/^\d+$/.test(params.orderId)) throw new Error("LIVE_ORDER_ID")
    const credential = parseApexCredential(auth.agentKey)
    await send(network, credential, "/delete-order", { id: params.orderId })
  })
}

/**
 * Moves a resting order: cancel, then place.
 *
 * ApeX has no amend. Cancelling first means the worst case is no order
 * rather than two; when the place fails after the cancel went through, the
 * refusal says exactly that.
 */
export async function modifyApexOrder(
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
  await cancelApexOrder(network, auth, params)
  try {
    await placeApexOrder(network, auth, {
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
      `LIVE_MOVE_HALF_DONE:The old order came off, but ApeX Omni refused the new one${said ? ` (${said.trim()})` : ""}. No order is resting there now. Place it again at the price you want.`
    )
  }
}

/** Closes the whole position with a reduce-only IOC at the 3% cap. */
export async function closeApexPosition(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; szi: number }
): Promise<{ avgPx: number | null; filledSz: number | null }> {
  return saying(async () => {
    if (!(params.szi !== 0)) throw new Error("LIVE_POSITION_GONE")
    const mark = (await fetchApexPrices(network, [params.marketId], { forOrder: true })).get(
      params.marketId
    )
    if (mark === undefined) {
      throw new Error("LIVE_EXCHANGE:ApeX Omni gave no price for this market, so the close was not sent.")
    }
    const outcome = await placeApexOrder(network, auth, {
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
 * Sets one market's leverage and reads it back.
 *
 * On ApeX leverage is a per-market setting, `set-initial-margin-rate`, and
 * an order simply uses whatever the market was last set to. So it is set
 * before the first order on a market, and read back from the account, never
 * assumed to have taken.
 */
async function applyApexLeverage(
  network: NetworkId,
  context: OrderContext,
  leverage: number
): Promise<void> {
  const maxLeverage = 1 / context.contract.initialMarginRate
  if (!(leverage >= 1) || leverage > maxLeverage + 1e-9) {
    throw new Error(
      `LIVE_LEVERAGE:ApeX Omni allows 1x to ${Math.round(maxLeverage * 100) / 100}x on ${context.contract.base}. Pick a leverage in that range.`
    )
  }
  const rate = apexMarginRateFor(leverage)
  await send(network, context.credential, "/set-initial-margin-rate", {
    symbol: context.contract.symbol,
    initialMarginRate: rate,
  })
  const { read } = await readApexAccount(network, context.credential, "order")
  const row = read.positions.find((one) => one.symbol === context.contract.symbol)
  // A market the account holds nothing on may not be listed; the rate was
  // accepted and there is nothing to read it back from.
  if (row && row.customMarginRate !== null && Math.abs(row.customMarginRate - Number(rate)) > 1e-9) {
    throw new Error(
      `LIVE_LEVERAGE:ApeX Omni answered the leverage change but still holds ${Math.round((1 / row.customMarginRate) * 100) / 100}x on ${context.contract.base}. Nothing else was sent.`
    )
  }
}

/** The margin rate ApeX takes for a leverage: its reciprocal, 5x is 0.2. */
export function apexMarginRateFor(leverage: number): string {
  return decimalString(Number((1 / leverage).toFixed(8)))
}

/** Changes the leverage on a market, open position or not. */
export async function setApexLeverage(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; leverage: number; szi: number }
): Promise<void> {
  return saying(async () => {
    const context = await orderContext(network, auth, params.marketId, false)
    await applyApexLeverage(network, context, params.leverage)
  })
}

/** The open orders, position stops and targets included. */
async function readOpenOrders(
  network: NetworkId,
  credential: ApexCredential,
  priority: "background" | "order" = "background"
): Promise<ApexOrderRow[]> {
  const answer = await apexPrivate(
    network,
    credential,
    "GET",
    "/open-orders",
    // Position stops and targets are left out unless asked for, per
    // ApeX's connector (`openAllOrders(showPositionOrders)`).
    { showPositionOrders: "true" },
    { priority }
  )
  const rows = Array.isArray(answer)
    ? answer
    : ((answer as { orders?: unknown[] } | null)?.orders ?? [])
  return rows.flatMap((raw) => {
    const parsed = orderSchema.safeParse(raw)
    return parsed.success ? [parsed.data] : []
  })
}

/** The position rows with their stops and targets read off the open orders. */
export function withApexProtection(
  positions: WalletPosition[],
  orders: ReadonlyArray<ApexOrderRow & { marketId: string }>
): WalletPosition[] {
  return positions.map((position) => {
    const guards = orders.filter(
      (order) =>
        order.marketId === position.marketId &&
        isApexTrigger(order.type) &&
        (isTrue(order.reduceOnly) || isTrue(order.isPositionTpsl))
    )
    const stop = guards.find((order) => order.type?.startsWith("STOP_"))
    const targets = guards
      .filter((order) => order.type?.startsWith("TAKE_PROFIT_"))
      .flatMap((order) => {
        const px = num(order.triggerPrice)
        if (px === null) return []
        const whole = isTrue(order.isPositionTpsl)
        return [{ px, sz: whole ? null : num(order.size), orderId: String(order.id) }]
      })
      .sort((left, right) => left.px - right.px)
    const slPx = num(stop?.triggerPrice)
    const stopWhole = stop ? isTrue(stop.isPositionTpsl) : true
    return {
      ...position,
      targets,
      tpPx: targets[0]?.px ?? null,
      tpSz: targets[0]?.sz ?? null,
      tpOrderId: targets[0]?.orderId ?? null,
      slPx,
      slOrderId: stop ? String(stop.id) : null,
      ...(stop && !stopWhole ? { slSz: num(stop.size) ?? undefined } : {}),
      protectionOrderIds: guards.map((order) => String(order.id)),
    }
  })
}

/** What a live wallet holds and has waiting, from ApeX itself. */
export async function fetchApexPortfolio(
  network: NetworkId,
  address: string,
  credential: () => string | null,
  priority: "background" | "order" = "background"
): Promise<WalletPortfolio> {
  const apex = apexCredentialFrom(credential)
  const { read, balance } = await readApexAccount(network, apex, priority, address)
  const positions = await toApexWalletPositions(network, read, balance.oracle)
  let rows: Array<ApexOrderRow & { marketId: string }>
  try {
    rows = []
    for (const order of await readOpenOrders(network, apex, priority)) {
      const marketId = order.symbol ? await apexMarketIdOf(network, order.symbol) : null
      if (marketId !== null) rows.push({ ...order, marketId })
    }
  } catch {
    // The positions still stand; an empty list here must not read as "no
    // orders", so the answer says the orders could not be read.
    return { positions, orders: [], ordersUnavailable: true }
  }
  const orders: WalletOpenOrder[] = rows.flatMap((order) => {
    const trigger = isApexTrigger(order.type)
    const px = num(trigger ? order.triggerPrice : order.price)
    const sz = num(order.remainingSize) ?? num(order.size)
    const side = order.side?.toUpperCase()
    if (px === null || sz === null || (side !== "BUY" && side !== "SELL")) return []
    return [
      {
        orderId: String(order.id),
        marketId: order.marketId,
        side: side === "BUY" ? ("buy" as const) : ("sell" as const),
        px,
        sz,
        reduceOnly: isTrue(order.reduceOnly) || isTrue(order.isPositionTpsl),
        trigger,
      },
    ]
  })
  return { positions: withApexProtection(positions, rows), orders }
}

/**
 * What one order was, asked after it is gone: a stop, a target or neither.
 * ApeX still answers an order by its id once it has filled or been
 * cancelled.
 */
export async function fetchApexOrderInfo(
  network: NetworkId,
  _address: string,
  orderId: string,
  _marketId: string,
  credential: () => string | null
): Promise<WalletOrderInfo> {
  if (!/^\d+$/.test(orderId)) return { kind: "none", triggerPx: null }
  const answer = await apexPrivate(network, apexCredentialFrom(credential), "GET", "/order", { id: orderId })
  const parsed = orderSchema.safeParse(answer)
  if (!parsed.success) return { kind: "none", triggerPx: null }
  const type = parsed.data.type ?? ""
  const triggerPx = num(parsed.data.triggerPrice)
  if (type.startsWith("STOP_")) return { kind: "stop", triggerPx: triggerPx && triggerPx > 0 ? triggerPx : null }
  if (type.startsWith("TAKE_PROFIT_")) return { kind: "target", triggerPx: triggerPx && triggerPx > 0 ? triggerPx : null }
  return { kind: "none", triggerPx: null }
}

/**
 * A refusal in words the trading screens show, wrapped around the whole
 * operation, the way Lighter's order path does it: the refusals that matter
 * most (a stock contract, a missing fee rate, a bad omni key) come before
 * anything is sent.
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

/**
 * Places one stop or target on a position as ApeX's own conditional order:
 * STOP_MARKET or TAKE_PROFIT_MARKET, reduce-only, triggered on ApeX's
 * market price, with a worst price 3% through the trigger. A stop for the
 * whole position is a position TPSL, which ApeX sizes to the position when it
 * fires; a fixed size (a grid's own stop) is an ordinary reduce-only one.
 *
 * Immediate-or-Cancel once triggered, the way ApeX's own position stop came
 * back in its docs' socket example.
 */
async function placeApexGuard(
  network: NetworkId,
  context: OrderContext,
  leg: {
    kind: "stop" | "target"
    closing: "BUY" | "SELL"
    triggerPx: number
    size: number
    wholePosition: boolean
  }
): Promise<string> {
  const size = onStep(apexSnapSize(leg.size, context.contract.stepSize), context.contract.stepSize)
  if (!(Number(size) > 0)) throw new Error("LIVE_SIZE")
  const { price, triggerPrice } = triggerPrices(context.contract, leg.closing, leg.triggerPx)
  const clientOrderId = apexClientOrderId(null)
  const answer = await send(network, context.credential, "/order", {
    symbol: context.contract.symbol,
    side: leg.closing,
    type: leg.kind === "stop" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET",
    size,
    price,
    triggerPrice,
    triggerPriceType: "MARKET",
    limitFee: apexLimitFee(price, size, context.takerFeeRate),
    expiration: apexExpiration(),
    timeInForce: "IMMEDIATE_OR_CANCEL",
    reduceOnly: true,
    isPositionTpsl: leg.wholePosition,
    clientOrderId,
    clientId: clientOrderId,
    signature: await signLeg(context, { side: leg.closing, size, price, clientOrderId }),
  })
  const placed = orderSchema.safeParse(answer)
  if (!placed.success) throw new Error("LIVE_NO_ANSWER:ApeX Omni answered the stop with nothing Trade could read.")
  return String(placed.data.id)
}

/** Refuses a stop or target on the side of the price it would fire on at once. */
export function apexWrongSide(
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
 * Replaces the stop and targets on a position, never leaving it uncovered.
 *
 * ApeX has no amend, so a moved stop is a new order. The order of work is
 * the whole point:
 *
 * 1. The new stop and targets are placed.
 * 2. They are read back from the open orders. One ApeX has not listed is
 *    not trusted, and nothing old is touched.
 * 3. Only then is every old guard on this market cancelled, the ones the
 *    caller named and any leftover the read found. One that will not cancel
 *    is named, so the screen can say which stop still stands.
 *
 * If a place fails, the old stop stands and the sentence says so.
 */
export async function setApexBrackets(
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

    if (params.slPx !== null || params.targets.length > 0) {
      const mark = (await fetchApexPrices(network, [params.marketId], { forOrder: true })).get(params.marketId)
      if (mark === undefined) {
        throw new Error("LIVE_EXCHANGE:ApeX Omni gave no price for this market, so the stop was not sent and the old one stands.")
      }
      const wrong = apexWrongSide(szi, mark, params.slPx, params.targets)
      if (wrong) throw new Error(`LIVE_EXCHANGE:${wrong}`)
    }

    const before = await readOpenOrders(network, context.credential, "order")
    const oldGuards = new Set(params.position.protectionOrderIds)
    for (const order of before) {
      if (order.symbol === context.contract.symbol && isApexTrigger(order.type) && (isTrue(order.reduceOnly) || isTrue(order.isPositionTpsl))) {
        oldGuards.add(String(order.id))
      }
    }

    const placed: string[] = []
    let slOrderId: string | null = null
    try {
      if (params.slPx !== null) {
        slOrderId = await placeApexGuard(network, context, {
          kind: "stop",
          closing,
          triggerPx: params.slPx,
          size: params.slSz ?? Math.abs(szi),
          wholePosition: params.slSz === null,
        })
        placed.push(slOrderId)
      }
      for (const target of params.targets) {
        placed.push(
          await placeApexGuard(network, context, {
            kind: "target",
            closing,
            triggerPx: target.px,
            size: target.sz ?? Math.abs(szi),
            wholePosition: target.sz === null,
          })
        )
      }
    } catch (error) {
      const said = /^[A-Z][A-Z0-9_]*:([^]+)$/.exec(error instanceof Error ? error.message : "")?.[1]
      throw new Error(
        `LIVE_BRACKET_REPLACE_PARTIAL:ApeX Omni refused the new stop or target${said ? ` (${said.trim()})` : ""}. ${oldGuards.size > 0 ? "The old stop and target still stand." : "The position has no stop."}${placed.length > 0 ? " Part of the new set went on, so check Open orders." : ""}`
      )
    }

    if (placed.length > 0) {
      const listed = await readOpenOrders(network, context.credential, "order").catch(() => null)
      if (listed === null) {
        throw new Error(
          "LIVE_BRACKET_REPLACE_PARTIAL:The new stop was sent, but ApeX Omni's order list could not be read to confirm it, so the old stop was left on as well. Check Open orders on ApeX and cancel whichever you do not want."
        )
      }
      const resting = new Set(listed.map((order) => String(order.id)))
      const missing = placed.filter((id) => !resting.has(id))
      if (missing.length > 0) {
        throw new Error(
          "LIVE_BRACKET_REPLACE_PARTIAL:ApeX Omni took the new stop but does not list it as waiting, so the old stop was left on. Check Open orders on ApeX before moving it again."
        )
      }
    }

    const stuck: string[] = []
    for (const orderId of oldGuards) {
      if (placed.includes(orderId)) continue
      try {
        await send(network, context.credential, "/delete-order", { id: orderId })
      } catch (error) {
        // An order that already fired or lapsed is gone, and that is fine.
        if (!/APEX_ORDER_GONE|not open any more/.test(error instanceof Error ? error.message : "")) {
          stuck.push(orderId)
        }
      }
    }
    if (stuck.length > 0) {
      throw new Error(
        `LIVE_BRACKET_REPLACE_DOUBLED:The new stop is on, but ApeX Omni would not cancel the old one (order ${stuck.join(", ")}), so both are waiting. Cancel the old one in Open orders; if both fire the position is sold twice over.`
      )
    }
    return { slOrderId }
  })
}
