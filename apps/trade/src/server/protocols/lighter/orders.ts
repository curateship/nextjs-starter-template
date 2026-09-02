import { z } from "zod"

import type {
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  WalletOpenOrder,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import {
  num,
  scaleLighterPrice,
  scaleLighterSize,
} from "@/lib/protocols/lighter/translate"
import {
  assertBracketValues,
  assertOrderValue,
  assertPlaceOrderValues,
} from "@/server/protocols/connector-helpers"
import {
  lighterPrivate,
  lighterSendTx,
} from "@/server/protocols/lighter/client"
import { lighterAccountFacts } from "@/server/protocols/lighter/agent"
import { fetchLighterPortfolio } from "@/server/protocols/lighter/account"
import {
  forgetLighterHeldReads,
  heldLighterRead,
  lighterOrdersFromFeed,
  openLighterPrivateFeed,
} from "@/server/protocols/lighter/private-feed"
import {
  fetchLighterPrices,
  lighterMarketByIndex,
  lighterMarketFacts,
} from "@/server/protocols/lighter/markets"
import {
  forgetLighterNonce,
  nextLighterNonce,
} from "@/server/protocols/lighter/nonces"
import {
  LIGHTER_MARGIN_DIRECTION,
  LIGHTER_MARGIN_MODE,
  LIGHTER_ORDER_TYPE,
  LIGHTER_TIME_IN_FORCE,
  LIGHTER_TX_TYPE,
  lighterAuthToken,
  lighterMarginFraction,
  signLighterCancel,
  signLighterOrder,
  signLighterUpdateLeverage,
  signLighterUpdateMargin,
} from "@/server/protocols/lighter/signer"

/**
 * Real Lighter orders.
 *
 * **Every order this app sends Lighter is post-only.** Lighter refuses a
 * post-only order that would take the market rather than filling it, which is
 * exactly the behaviour `trading-rules.md` asks for: this app never sends a
 * market order, on any venue. Lighter's market order type exists and is never
 * used.
 *
 * Two shapes have to be right or money goes to the wrong place, and both are
 * checked before anything is signed. Sizes and prices are whole numbers
 * scaled by the market's own decimals, and the market itself is named by a
 * small integer rather than its symbol.
 */

/** Lighter's docs put the unlisted reads at weight 300. */
const UNLISTED_WEIGHT = 300

const numeric = z.union([z.string(), z.number()])

const orderRowSchema = z.object({
  order_index: numeric.optional(),
  client_order_index: numeric.optional(),
  market_index: z.number().optional(),
  is_ask: z.union([z.boolean(), z.number()]).optional(),
  price: numeric.optional(),
  remaining_base_amount: numeric.optional(),
  initial_base_amount: numeric.optional(),
  filled_base_amount: numeric.optional(),
  reduce_only: z.union([z.boolean(), z.number()]).optional(),
  type: z.union([z.string(), z.number()]).optional(),
  trigger_price: numeric.optional(),
  status: z.string().optional(),
  timestamp: numeric.optional(),
})

const ordersAnswerSchema = z.object({
  orders: z.array(z.unknown()).default([]),
})

function isTrue(value: unknown): boolean {
  return value === true || value === 1 || value === "1"
}

/**
 * Everything Lighter needs to be told before it will take an order for this
 * wallet and market: which account, which key slot, and which market number.
 */
async function orderContext(
  network: NetworkId,
  auth: OrderAuth,
  marketId: string
) {
  const address = auth.accountAddress ?? ""
  const facts = await lighterAccountFacts(network, address, () => auth.agentKey)
  const market = await lighterMarketFacts(network, marketId)
  if (market.priceDecimals === null || market.sizeDecimals === null) {
    throw new Error(
      "LIVE_EXCHANGE:Lighter did not say how many decimal places this market allows, so an order cannot be sized for it."
    )
  }
  return {
    ...facts,
    marketIndex: market.id,
    address,
    priceDecimals: market.priceDecimals,
    sizeDecimals: market.sizeDecimals,
  }
}

/**
 * Sends one signed transaction, and throws the nonce count away if Lighter
 * refuses it.
 *
 * **The reset is the point.** A refused transaction may or may not have spent
 * its number, and guessing wrong leaves the wallet unable to send anything at
 * all until somebody notices — a far worse outcome than one extra request.
 */
async function send(
  network: NetworkId,
  where: { accountIndex: number; apiKeyIndex: number },
  txType: number,
  txInfo: string
): Promise<void> {
  /**
   * **Whatever is held is about to stop being true.** Anything sent here
   * changes what the account holds, so the brief REST hold is dropped before
   * the send rather than after: a failure that half-applied must not leave a
   * stale answer standing either. The same rule Hyperliquid's order path
   * keeps. Without it, an order could be cancelled and still be listed for
   * ten seconds — and `setBrackets` cancels the list it is given, so a stale
   * one is a stop taken off the wrong position.
   */
  forgetLighterHeldReads(network, where.accountIndex)
  try {
    await lighterSendTx(network, { txType, txInfo })
  } catch (error) {
    forgetLighterNonce(network, where.accountIndex, where.apiKeyIndex)
    throw asLiveRefusal(error)
  }
}

/**
 * A Lighter refusal in words the trading screens will actually show.
 *
 * **Only a handful of codes carry their sentence to a screen**, and a code
 * this app invented is not one of them: every Lighter refusal on the order
 * path arrived as "That did not go through. Try it again." — including the
 * country block, which no amount of trying again will fix, and a missing
 * signer, which is a server problem nobody could guess at.
 *
 * It wraps the WHOLE operation, not just the sending. The refusals that
 * matter most happen before anything is sent — a missing signer, a key that
 * cannot be matched, a price that will not fit — and badging only the send
 * left exactly those arriving as "try again", which is the complaint that
 * found this.
 */
async function saying<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw asLiveRefusal(error)
  }
}

function asLiveRefusal(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  // Already a code the screens know how to read.
  if (/^LIVE_[A-Z_]+/.test(message)) return new Error(message)
  const said = /^[A-Z][A-Z0-9_]*:([^]+)$/.exec(message)
  return new Error(
    said ? `LIVE_EXCHANGE:${said[1].trim()}` : `LIVE_EXCHANGE:${message}`
  )
}

/**
 * Tells Lighter the leverage and margin mode for one market.
 *
 * Its own transaction, sent on its own, because Lighter carries neither on
 * the order — an order simply uses whatever the market was last told. So the
 * leverage on the screen has to be sent BEFORE the first order on a market,
 * or the position opens at whatever was set last time and the screen quietly
 * lies about real money.
 */
async function applyLighterLeverage(
  network: NetworkId,
  where: Awaited<ReturnType<typeof orderContext>>,
  leverage: number,
  marginMode: "cross" | "isolated" | null | undefined
): Promise<void> {
  /**
   * Said in words here rather than left as a code. `lighterMarginFraction`
   * refuses a leverage Lighter's own field cannot carry, and a bare code
   * reaches the screen as "That did not go through. Try it again." — which
   * says nothing and invites a retry that would fail the same way.
   */
  let marginFraction: number
  try {
    marginFraction = lighterMarginFraction(leverage)
  } catch {
    throw new Error(
      `LIVE_EXCHANGE:Lighter cannot carry ${leverage}x on this market. Pick a leverage it can state exactly.`
    )
  }
  const nonce = await nextLighterNonce(
    network,
    where.accountIndex,
    where.apiKeyIndex
  )
  const signed = await signLighterUpdateLeverage({
    accountIndex: where.accountIndex,
    marketIndex: where.marketIndex,
    marginFraction,
    marginMode:
      marginMode === "isolated"
        ? LIGHTER_MARGIN_MODE.isolated
        : LIGHTER_MARGIN_MODE.cross,
    nonce,
  })
  await send(network, where, LIGHTER_TX_TYPE.updateLeverage, signed.txInfo)
}

/**
 * Reads a just-sent order back off the exchange, because Lighter's `sendTx`
 * answer proves nothing about the order.
 *
 * **Lighter accepts the transaction and then cancels the order without a
 * word.** Measured 31 Aug 2026: a watched LINK sell triggered, the engine
 * placed and chased it, every send was answered `200`, and the app journaled
 * "Resting on the exchange" four times — while Lighter's own order history
 * says `canceled-post-only` and the book held nothing. The silent cancel left
 * the watch's money-was-sent flag raised with no order behind it, so the
 * watch died instead of re-resting, which is the exact freeze
 * `watched-orders.md` describes on Hyperliquid — except Hyperliquid says the
 * refusal out loud and Lighter does not.
 *
 * So the refusal is fetched. The order is looked up by the app's own number:
 * on the active list it is resting; on the inactive list its status says
 * plainly whether it filled or why it was cancelled; on neither, the
 * transaction itself died and the nonce count is thrown away. A cancelled or
 * missing order becomes `LIVE_ORDER_REFUSED`, the one prefix `nothingStood`
 * trusts to mean the exchange kept nothing — which frees the chase to try
 * again on its next pass instead of waiting forever.
 *
 * **When the check itself cannot be made, the order is called resting.** A
 * refusal invented on a failed read would send the chase back in while the
 * real order still rests, and the same thing would be bought twice. An
 * unverified "resting" is exactly what every placement answered before this
 * existed, so it is the safe wrong answer.
 */
const CONFIRM_DELAYS_MS = [400, 1200]
let confirmDelays: readonly number[] = CONFIRM_DELAYS_MS

/** Tests only: shrinks the confirm's waits so a case is not seconds long. */
export function setLighterConfirmDelaysForTests(
  delays: readonly number[] | null
): void {
  confirmDelays = delays ?? CONFIRM_DELAYS_MS
}

/** How much of the inactive list is searched for the order just sent. */
const CONFIRM_ROWS = 20

const confirmOrderSchema = z.object({
  client_order_index: z.number(),
  status: z.string().optional(),
  filled_base_amount: z.union([z.string(), z.number()]).optional(),
  filled_quote_amount: z.union([z.string(), z.number()]).optional(),
})

const confirmAnswerSchema = z.object({
  orders: z.array(z.unknown()).default([]),
})

function confirmRowFor(
  answer: unknown,
  clientOrderIndex: number
): z.infer<typeof confirmOrderSchema> | null {
  const parsed = confirmAnswerSchema.safeParse(answer)
  if (!parsed.success) return null
  for (const raw of parsed.data.orders) {
    const row = confirmOrderSchema.safeParse(raw)
    if (row.success && row.data.client_order_index === clientOrderIndex) {
      return row.data
    }
  }
  return null
}

type ConfirmedOrder =
  | { stood: "resting" }
  | { stood: "filled"; avgPx: number | null; filledSz: number | null }

async function confirmLighterOrder(
  network: NetworkId,
  where: { accountIndex: number; apiKeyIndex: number; marketIndex: number },
  clientOrderIndex: number
): Promise<ConfirmedOrder> {
  let inactive: z.infer<typeof confirmOrderSchema> | null = null
  let bothListsAnswered = false
  try {
    for (const delay of confirmDelays) {
      // The cancel that matters lands within the same second as the send,
      // but "not there yet" and "never there" look identical, so a missing
      // order gets a second, later look before it is called dead.
      await new Promise((resolve) => setTimeout(resolve, delay))
      const token = await lighterAuthToken(where)
      const active = await lighterPrivate(
        network,
        "/api/v1/accountActiveOrders",
        UNLISTED_WEIGHT,
        token.token,
        { account_index: where.accountIndex, market_id: where.marketIndex },
        "order"
      )
      if (!confirmAnswerSchema.safeParse(active).success) {
        return { stood: "resting" }
      }
      if (confirmRowFor(active, clientOrderIndex)) return { stood: "resting" }
      const done = await lighterPrivate(
        network,
        "/api/v1/accountInactiveOrders",
        UNLISTED_WEIGHT,
        token.token,
        {
          account_index: where.accountIndex,
          market_id: where.marketIndex,
          limit: CONFIRM_ROWS,
        },
        "order"
      )
      if (!confirmAnswerSchema.safeParse(done).success) {
        return { stood: "resting" }
      }
      bothListsAnswered = true
      inactive = confirmRowFor(done, clientOrderIndex)
      if (inactive) break
    }
  } catch {
    return { stood: "resting" }
  }

  if (inactive) {
    // Lighter's inactive rows state amounts in ordinary units, so the fill
    // price is their plain quotient rather than anything rescaled.
    const filledSz = num(inactive.filled_base_amount)
    const filledQuote = num(inactive.filled_quote_amount)
    if (filledSz !== null && filledSz > 0) {
      return {
        stood: "filled",
        avgPx:
          filledQuote !== null && filledQuote > 0
            ? filledQuote / filledSz
            : null,
        filledSz,
      }
    }
    if (inactive.status === "canceled-post-only") {
      throw new Error(
        "LIVE_ORDER_REFUSED:Lighter cancelled the order rather than let it take the market — post-only may only rest. Nothing was kept."
      )
    }
    throw new Error(
      `LIVE_ORDER_REFUSED:Lighter cancelled the order without filling it (${inactive.status ?? "no reason given"}). Nothing was kept.`
    )
  }

  if (!bothListsAnswered) return { stood: "resting" }
  // On neither list after two looks: the transaction itself never made an
  // order. The likeliest cause is a spent sequence number, so the count is
  // thrown away and the next order asks Lighter where the sequence really is.
  forgetLighterNonce(network, where.accountIndex, where.apiKeyIndex)
  throw new Error(
    "LIVE_ORDER_REFUSED:Lighter never kept the order — the transaction was accepted and produced nothing. Nothing was kept."
  )
}

export async function placeLighterOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  return saying(async () => {
    assertPlaceOrderValues(params)
    const where = await orderContext(network, auth, params.marketId)
    const price = scaleLighterPrice(params.px, where.priceDecimals)
    const size = scaleLighterSize(params.sz, where.sizeDecimals)
    if (price === null || size === null || size <= 0) {
      throw new Error(
        "LIVE_EXCHANGE:That price or size cannot be said in the whole numbers Lighter takes for this market. Move the price to the market's own step and try again."
      )
    }

    /**
     * Only when opening. The caller sends a leverage on the first order of a
     * market and null once a position is held, because changing the leverage
     * under an open position is a different act with its own window and its own
     * refusals — see `changeLiveLeverage`.
     *
     * **After the price and size are known to be sendable**, because this is a
     * real transaction with a lasting effect: setting it first would leave the
     * market's leverage changed by an order that was then refused for a reason
     * having nothing to do with leverage.
     */
    if (params.leverage != null && params.leverage > 0) {
      await applyLighterLeverage(
        network,
        where,
        params.leverage,
        params.marginMode
      )
    }

    /**
     * The app's own order number, carried through so a fill can be traced back
     * to the order that made it. Lighter wants a plain integer, and this app's
     * ids are already numbers on the venues that number their orders.
     */
    const clientOrderIndex = await auth.allocateNonce(
      `lighter:${where.accountIndex}`
    )
    const nonce = await nextLighterNonce(
      network,
      where.accountIndex,
      where.apiKeyIndex
    )

    const signed = await signLighterOrder({
      accountIndex: where.accountIndex,
      marketIndex: where.marketIndex,
      clientOrderIndex,
      baseAmount: size,
      price,
      side: params.side,
      orderType: LIGHTER_ORDER_TYPE.limit,
      // Never `market`. A post-only order that would take the market is
      // refused by Lighter instead of filling, which is the rule.
      timeInForce: LIGHTER_TIME_IN_FORCE.postOnly,
      reduceOnly: params.reduceOnly,
      nonce,
    })
    await send(network, where, LIGHTER_TX_TYPE.createOrder, signed.txInfo)

    /**
     * The send proves nothing — Lighter cancels a crossing post-only order
     * without telling the sender, so the order is read back and a cancelled or
     * missing one becomes a refusal instead of a journal line about an order
     * that does not exist. See `confirmLighterOrder`.
     */
    const confirmed = await confirmLighterOrder(
      network,
      where,
      clientOrderIndex
    )

    return {
      // Resting when the book holds it; filled when Lighter's history says a
      // fast market took it before the read-back.
      status: confirmed.stood,
      orderId: String(clientOrderIndex),
      avgPx: confirmed.stood === "filled" ? confirmed.avgPx : null,
      filledSz: confirmed.stood === "filled" ? confirmed.filledSz : null,
      /**
       * Lighter cannot carry a stop or target on the entry itself — each one is
       * its own order, placed by `setBrackets` once the position exists. So an
       * entry that was asked for protection reports "partial" and says so
       * rather than claiming legs that were never sent with it.
       */
      protection:
        params.tpPx === null && params.slPx === null ? null : "partial",
      protectionNote:
        params.tpPx === null && params.slPx === null
          ? null
          : "Lighter takes a stop or target as its own order, so it goes on just after the position opens rather than with it.",
    }
  })
}

export async function cancelLighterOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  return saying(async () => {
    const where = await orderContext(network, auth, params.marketId)
    const nonce = await nextLighterNonce(
      network,
      where.accountIndex,
      where.apiKeyIndex
    )
    const signed = await signLighterCancel({
      accountIndex: where.accountIndex,
      marketIndex: where.marketIndex,
      orderIndex: params.orderId,
      nonce,
    })
    await send(network, where, LIGHTER_TX_TYPE.cancelOrder, signed.txInfo)
  })
}

/**
 * Changes the leverage on a market that already holds a position.
 *
 * The caller has already refused a leverage above what the market allows and
 * has already checked the position is there, so this only has to send it.
 * Cross is kept as the mode: Lighter's own default, and the mode every
 * position on this account was in when checked on 26 Aug 2026. Changing the
 * mode under an open position is a separate act this app does not offer.
 */
export async function setLighterLeverage(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; leverage: number; szi: number }
): Promise<void> {
  return saying(async () => {
    const where = await orderContext(network, auth, params.marketId)
    await applyLighterLeverage(network, where, params.leverage, "cross")
  })
}

/**
 * Adds cash to an isolated position or takes some back.
 *
 * `dollars` is signed — negative takes margin out — and Lighter carries the
 * direction in its own field, so the amount itself is always positive. Whole
 * millionths, the same six decimals every Lighter quote uses.
 */
export async function adjustLighterMargin(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; szi: number; dollars: number }
): Promise<void> {
  return saying(async () => {
    const where = await orderContext(network, auth, params.marketId)
    const millionths = Math.round(Math.abs(params.dollars) * 1e6)
    if (millionths <= 0) {
      throw new Error(
        "LIVE_EXCHANGE:That is too small an amount for Lighter to move."
      )
    }
    const nonce = await nextLighterNonce(
      network,
      where.accountIndex,
      where.apiKeyIndex
    )
    const signed = await signLighterUpdateMargin({
      accountIndex: where.accountIndex,
      marketIndex: where.marketIndex,
      usdcAmount: millionths,
      direction:
        params.dollars < 0
          ? LIGHTER_MARGIN_DIRECTION.remove
          : LIGHTER_MARGIN_DIRECTION.add,
      nonce,
    })
    await send(network, where, LIGHTER_TX_TYPE.updateMargin, signed.txInfo)
  })
}

/**
 * Moves a resting order by cancelling it and placing a fresh one.
 *
 * Lighter has a modify transaction, and it is deliberately not used yet: an
 * amend that half-applies leaves an order at a price nobody chose, and there
 * is no way to rehearse that from here. Cancel-then-place fails safe — the
 * worst case is no order rather than a wrong one, and the caller sees the
 * refusal.
 */
export async function modifyLighterOrder(
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
  await cancelLighterOrder(network, auth, {
    marketId: params.marketId,
    orderId: params.orderId,
  })
  await placeLighterOrder(network, auth, {
    marketId: params.marketId,
    side: params.side,
    kind: "postOnly",
    px: params.px,
    sz: params.sz,
    reduceOnly: params.reduceOnly,
    leverage: null,
    tpPx: null,
    slPx: null,
  })
}

/** What the wallet holds, read publicly — see `account.ts`. */
export async function fetchLighterOrderPortfolio(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<WalletPortfolio> {
  // Positions first, and on their own: Lighter answers them publicly, so they
  // must never be lost to a failure on the orders half below.
  const portfolio = await fetchLighterPortfolio(network, address, credential)
  /**
   * **The resting orders are the only part that needs signing**, and losing
   * them must not lose the positions with them. A server without the signing
   * files, or a key that has been re-registered, would otherwise blank a
   * position that plainly exists — which is exactly what happened on
   * 26 Aug 2026, with a real PUMP position on the exchange and nothing on the
   * screen. An empty order list beside a real position is a smaller lie than
   * no position at all, and the wallet card still shows the money.
   */
  let orders: WalletOpenOrder[] = []
  try {
    const facts = await lighterAccountFacts(network, address, credential)
    orders = await fetchLighterOpenOrders(network, facts)
  } catch (error) {
    console.error("Lighter resting orders could not be read", error)
  }

  /**
   * **Every protective leg standing on a market is pinned to its position.**
   *
   * `setBrackets` cancels this list before placing a new stop, so a position
   * that never carries one can never have its old stop taken off: replacing a
   * stop would leave the old one resting, and the position would be sold
   * twice over. Reading them back off the exchange is the only way the list
   * is ever true — Lighter keeps each leg as its own ordinary order.
   *
   * A reduce-only order waiting on a trigger is a stop or a target and
   * nothing else: an entry is never reduce-only, and a plain resting order
   * has no trigger.
   *
   * The legs also fill in the position's OWN stop and target, the way every
   * other venue's read does. While only the ids were pinned, `slPx` and the
   * targets stayed null forever, so the chart's draggable stop and target
   * lines vanished on the first real read after a placement — with both legs
   * standing on the exchange the whole time (seen live, 1 Sep 2026). Which
   * side a leg is comes from its price against the entry, the same rule the
   * chart uses: an exit that wins is a target, one that loses is a stop.
   */
  const pinned = new Set<string>()
  const positions = portfolio.positions.map((position) => {
    const legs = orders
      .filter(
        (one) =>
          one.marketId === position.marketId && one.reduceOnly && one.trigger
      )
      // By id, so a position carrying two stops names the same one on every
      // read instead of flipping between them.
      .sort((left, right) => Number(left.orderId) - Number(right.orderId))
    const long = position.szi > 0
    const winning = (leg: WalletOpenOrder) =>
      long ? leg.px > position.entryPx : leg.px < position.entryPx
    const stop = legs.find((leg) => !winning(leg)) ?? null
    // A leg for everything held is the whole-position kind, and it is
    // reported as such (null size) so a later replace keeps sending the kind
    // that grows with the position instead of freezing it at today's size.
    const wholeSz = (sz: number) =>
      sz >= Math.abs(position.szi) * (1 - 1e-6) ? null : sz
    const targets = legs
      .filter(winning)
      .map((leg) => ({ px: leg.px, sz: wholeSz(leg.sz), orderId: leg.orderId }))
      .sort((left, right) => left.px - right.px)
    for (const target of targets) pinned.add(target.orderId)
    if (stop) pinned.add(stop.orderId)
    return {
      ...position,
      targets,
      tpPx: targets[0]?.px ?? null,
      tpSz: targets[0]?.sz ?? null,
      tpOrderId: targets[0]?.orderId ?? null,
      slPx: stop?.px ?? null,
      slOrderId: stop?.orderId ?? null,
      // Every leg, not only the pinned ones, because `setBrackets` has to
      // cancel all of them or a spare stop sells the position a second time.
      protectionOrderIds: legs.map((leg) => leg.orderId),
    }
  })
  /**
   * A pinned leg leaves the plain order list — it is drawn from the position
   * now, and listed twice it would draw twice. A trigger leg on a market with
   * no position stays, so it is still seen rather than quietly held.
   */
  return {
    positions,
    orders: orders.filter((one) => !pinned.has(one.orderId)),
  }
}

/**
 * The orders resting on Lighter right now. Needs the account's own
 * signature, so it costs one auth token.
 */
async function fetchLighterOpenOrders(
  network: NetworkId,
  facts: { accountIndex: number; apiKeyIndex: number }
) {
  /**
   * The socket first. `account_all_orders` is the one private channel that
   * needs the auth token, and the feed carries the token in its subscribe
   * frame — so the orders arrive pushed and this costs nothing per poll.
   *
   * **A partly readable answer falls back rather than being shown.** If the
   * feed names rows and any one of them cannot be read, the REST read runs
   * instead: showing three resting orders as two is a lie about real money,
   * where spending one request is only a cost.
   */
  openLighterPrivateFeed(network, facts.accountIndex, async () => {
    try {
      return (await lighterAuthToken(facts)).token
    } catch {
      return null
    }
  })
  const pushed = lighterOrdersFromFeed(network, facts.accountIndex)
  if (pushed) {
    const converted = await toLighterOpenOrders(network, pushed)
    if (converted.length === pushed.length) return converted
  }

  // Same reasoning as the account read: while the socket is down, one REST
  // answer stands for the polls in the next few seconds, so the fallback
  // cannot spend the very allowance that is keeping the socket down.
  return heldLighterRead("orders", network, facts.accountIndex, () =>
    readLighterOpenOrders(network, facts)
  )
}

async function readLighterOpenOrders(
  network: NetworkId,
  facts: { accountIndex: number; apiKeyIndex: number }
): Promise<WalletOpenOrder[]> {
  const token = await lighterAuthToken(facts)
  const answer = await lighterPrivate(
    network,
    "/api/v1/accountActiveOrders",
    UNLISTED_WEIGHT,
    token.token,
    { account_index: facts.accountIndex }
  )
  const parsed = ordersAnswerSchema.safeParse(answer)
  if (!parsed.success) return []
  return toLighterOpenOrders(network, parsed.data.orders)
}

/** Lighter's own order rows as this app's, from either the socket or REST. */
async function toLighterOpenOrders(
  network: NetworkId,
  raw: readonly unknown[]
) {
  const rows: WalletOpenOrder[] = []
  for (const one of raw) {
    const row = orderRowSchema.safeParse(one)
    if (!row.success) continue
    const id = row.data.order_index ?? row.data.client_order_index
    if (id === undefined || row.data.market_index === undefined) continue
    /**
     * **`price` and `remaining_base_amount` arrive in ordinary units.**
     * Measured on a live account on 1 Sep 2026, from both the REST list and
     * the socket: a stop leg on a $101 coin came as `price: "108.626"` and
     * `remaining_base_amount: "4.949"`, with Lighter's scaled whole numbers
     * in separate `base_price`/`base_size` fields. These fields used to be
     * unscaled as if they were the whole-number kind, which put every
     * Lighter resting order at a thousandth of its real price — off the
     * bottom of the chart, on a screen about real money.
     */
    const market = await lighterMarketByIndex(network, row.data.market_index)
    if (!market) continue
    const triggerPx = num(row.data.trigger_price)
    const trigger = triggerPx !== null && triggerPx !== 0
    /**
     * A trigger leg is drawn and judged at the price that sets it off, not
     * at the limit it fires at — the limit sits three percent through the
     * trigger so the order actually fills, and shown raw it reads as a stop
     * three percent from where the stop is.
     */
    const px = trigger ? triggerPx : num(row.data.price)
    const sz = num(row.data.remaining_base_amount)
    if (px === null || sz === null) continue
    rows.push({
      orderId: String(id),
      // The symbol, not Lighter's number, so this row lines up with the
      // position beside it and with every saved market.
      marketId: market.symbol,
      side: isTrue(row.data.is_ask) ? "sell" : "buy",
      px,
      sz,
      reduceOnly: isTrue(row.data.reduce_only),
      trigger,
    })
  }
  return rows
}

/**
 * How far through the mark a closing order may reach.
 *
 * **Closing cannot be post-only.** A post-only order is refused rather than
 * filled when it would cross the spread, which is exactly what closing has to
 * do. So a close is the one order here sent Immediate-or-Cancel — still a
 * limit with a price on it, never a market order. Three percent is the same
 * cap Aster's close uses: wide enough to fill, tight enough that a broken
 * price feed cannot sell into nothing.
 */
const CLOSE_THROUGH_MARK = 0.03

/**
 * Closes a position with a reduce-only order priced through the mark.
 *
 * Reduce-only matters as much as the price: it can shrink a position and can
 * never open one the other way, so a size that is stale by the time Lighter
 * sees it leaves nothing behind.
 */
export async function closeLighterPosition(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; szi: number }
): Promise<{ avgPx: number | null; filledSz: number | null }> {
  if (params.szi === 0) return { avgPx: null, filledSz: null }
  return saying(async () => {
    const where = await orderContext(network, auth, params.marketId)
    const marks = await fetchLighterPrices(network, [params.marketId])
    const mark = marks.get(params.marketId)
    if (mark === undefined || !(mark > 0)) throw new Error("LIVE_NO_PRICE")

    // Selling a long reaches DOWN through the mark, buying back a short reaches
    // up: the cap has to be on the side the order will actually cross to.
    const selling = params.szi > 0
    const capped = selling
      ? mark * (1 - CLOSE_THROUGH_MARK)
      : mark * (1 + CLOSE_THROUGH_MARK)

    const price = scaleLighterPrice(capped, where.priceDecimals)
    const size = scaleLighterSize(Math.abs(params.szi), where.sizeDecimals)
    if (price === null || size === null || size <= 0) {
      throw new Error(
        "LIVE_EXCHANGE:That position's size cannot be said in the whole numbers Lighter takes for this market."
      )
    }

    const clientOrderIndex = await auth.allocateNonce(
      `lighter:${where.accountIndex}`
    )
    const nonce = await nextLighterNonce(
      network,
      where.accountIndex,
      where.apiKeyIndex
    )
    const signed = await signLighterOrder({
      accountIndex: where.accountIndex,
      marketIndex: where.marketIndex,
      clientOrderIndex,
      baseAmount: size,
      price,
      side: selling ? "sell" : "buy",
      orderType: LIGHTER_ORDER_TYPE.limit,
      timeInForce: LIGHTER_TIME_IN_FORCE.immediateOrCancel,
      reduceOnly: true,
      /**
       * **Zero, and it has to be.** An order that lives only for this instant
       * cannot also carry an expiry weeks away, and Lighter's own signer
       * refuses the transaction outright with "OrderExpiry is invalid" — so a
       * close never even reached the exchange. The default of -1 means
       * "Lighter's usual 28 days", which is right for a resting order and
       * nonsense for this one.
       */
      orderExpiry: 0,
      nonce,
    })
    await send(network, where, LIGHTER_TX_TYPE.createOrder, signed.txInfo)
    // Lighter answers the send, not the fill. What actually filled arrives on
    // the trade history, so claiming a price here would be inventing one.
    return { avgPx: null, filledSz: null }
  })
}

/**
 * How far past its trigger a protective order's limit price is set.
 *
 * **A stop cannot be a market order here**, because this app sends none
 * anywhere. So each protective order is a limit that only appears when the
 * trigger is hit, priced this far through the trigger so it actually fills
 * rather than resting where the market has already gone. Three percent is
 * the same reach a close uses.
 */
const TRIGGER_LIMIT_REACH = 0.03

/**
 * Replaces the stop and targets riding on a Lighter position.
 *
 * **Every leg is a fixed size, and that is why they are replaced rather than
 * adjusted.** Lighter has no "whatever the position holds" flag, so a leg
 * names a number of coins; when the position grows or shrinks, the old legs
 * are cancelled and fresh ones placed at the new size. Cancelling first is
 * what stops a position ending up with two stops selling it twice over.
 */
export async function setLighterBrackets(
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
    assertBracketValues(params)
    const where = await orderContext(network, auth, params.marketId)
    const held = Math.abs(params.position.szi)
    if (held === 0) throw new Error("LIVE_POSITION_GONE")
    // A long is protected by selling and a short by buying back.
    const closingSide = params.position.szi > 0 ? "sell" : "buy"

    // **Off before on.** A leg left behind sells the position a second time.
    for (const orderId of params.position.protectionOrderIds) {
      await cancelLighterOrder(network, auth, {
        marketId: params.marketId,
        orderId,
      })
    }

    let slOrderId: string | null = null
    if (params.slPx !== null) {
      slOrderId = await placeTriggerOrder(network, auth, where, {
        side: closingSide,
        triggerPx: params.slPx,
        sz: params.slSz ?? held,
        kind: "stop",
      })
    }
    for (const target of params.targets) {
      await placeTriggerOrder(network, auth, where, {
        side: closingSide,
        triggerPx: target.px,
        sz: target.sz ?? held,
        kind: "target",
      })
    }
    return { slOrderId }
  })
}

/** One reduce-only leg that only exists once its trigger is reached. */
async function placeTriggerOrder(
  network: NetworkId,
  auth: OrderAuth,
  where: Awaited<ReturnType<typeof orderContext>>,
  leg: {
    side: "buy" | "sell"
    triggerPx: number
    sz: number
    kind: "stop" | "target"
  }
): Promise<string> {
  /**
   * The limit sits through the trigger on the side the order will cross to,
   * so a stop that fires actually gets out instead of resting above a market
   * that has already fallen past it.
   */
  const limitPx =
    leg.side === "sell"
      ? leg.triggerPx * (1 - TRIGGER_LIMIT_REACH)
      : leg.triggerPx * (1 + TRIGGER_LIMIT_REACH)

  const trigger = scaleLighterPrice(leg.triggerPx, where.priceDecimals)
  const price = scaleLighterPrice(limitPx, where.priceDecimals)
  const size = scaleLighterSize(leg.sz, where.sizeDecimals)
  if (trigger === null || price === null || size === null || size <= 0) {
    throw new Error(
      "LIVE_EXCHANGE:That stop or target price cannot be said in the whole numbers Lighter takes for this market."
    )
  }

  const clientOrderIndex = await auth.allocateNonce(
    `lighter:${where.accountIndex}`
  )
  const nonce = await nextLighterNonce(
    network,
    where.accountIndex,
    where.apiKeyIndex
  )
  const signed = await signLighterOrder({
    accountIndex: where.accountIndex,
    marketIndex: where.marketIndex,
    clientOrderIndex,
    baseAmount: size,
    price,
    side: leg.side,
    // The LIMIT kinds, never the plain stop-loss or take-profit, because
    // those fill at whatever the market is and this app sends no market
    // orders.
    orderType:
      leg.kind === "stop"
        ? LIGHTER_ORDER_TYPE.stopLossLimit
        : LIGHTER_ORDER_TYPE.takeProfitLimit,
    // Good till time: a protective order has to wait for its trigger, and a
    // post-only one would be refused for crossing when it fires.
    timeInForce: LIGHTER_TIME_IN_FORCE.goodTillTime,
    // Reduce-only, so a stop can only ever shrink the position it guards and
    // never open one the other way.
    reduceOnly: true,
    triggerPrice: trigger,
    nonce,
  })
  await send(network, where, LIGHTER_TX_TYPE.createOrder, signed.txInfo)
  /**
   * The send proves nothing here either. Lighter answers 200 and can still
   * cancel the order in silence — the same behaviour that killed a real
   * watched LINK sell on 31 Aug 2026 — and a silently cancelled stop is a
   * position running unprotected while the screen says otherwise. A pending
   * trigger leg sits on the same active list an ordinary resting order does
   * (measured 1 Sep 2026), so the same read-back covers it.
   */
  await confirmLighterOrder(network, where, clientOrderIndex)
  return String(clientOrderIndex)
}
