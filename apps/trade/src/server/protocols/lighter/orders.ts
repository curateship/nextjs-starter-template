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
  unscaleLighterNumber,
} from "@/lib/protocols/lighter/translate"
import { lighterPrivate, lighterSendTx } from "@/server/protocols/lighter/client"
import { lighterAccountFacts } from "@/server/protocols/lighter/agent"
import { fetchLighterPortfolio } from "@/server/protocols/lighter/account"
import {
  lighterMarketByIndex,
  lighterMarketFacts,
} from "@/server/protocols/lighter/markets"
import {
  forgetLighterNonce,
  nextLighterNonce,
} from "@/server/protocols/lighter/nonces"
import {
  LIGHTER_ORDER_TYPE,
  LIGHTER_TIME_IN_FORCE,
  LIGHTER_TX_TYPE,
  lighterAuthToken,
  signLighterCancel,
  signLighterOrder,
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
      "LIGHTER_ORDER_SHAPE:Lighter did not say how many decimal places this market allows, so an order cannot be sized for it."
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
  try {
    await lighterSendTx(network, { txType, txInfo })
  } catch (error) {
    forgetLighterNonce(network, where.accountIndex, where.apiKeyIndex)
    throw error
  }
}

export async function placeLighterOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  const where = await orderContext(network, auth, params.marketId)
  const price = scaleLighterPrice(params.px, where.priceDecimals)
  const size = scaleLighterSize(params.sz, where.sizeDecimals)
  if (price === null || size === null || size <= 0) {
    throw new Error(
      "LIGHTER_ORDER_SHAPE:That price or size cannot be said in the whole numbers Lighter takes for this market. Move the price to the market's own step and try again."
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

  return {
    // Post-only never fills on arrival: it rests or it is refused.
    status: "resting",
    orderId: String(clientOrderIndex),
    avgPx: null,
    filledSz: null,
    // Lighter has no way to attach a stop or target to the order itself, so
    // none was asked for here. `setBrackets` places them separately once the
    // position exists, and saying "ok" for legs nobody sent would be a lie.
    protection: params.tpPx === null && params.slPx === null ? null : "partial",
    protectionNote:
      params.tpPx === null && params.slPx === null
        ? null
        : "Lighter takes a stop or target as its own order, so it is placed after the position opens rather than with it.",
  }
}

export async function cancelLighterOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
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
  const portfolio = await fetchLighterPortfolio(network, address, credential)
  const facts = await lighterAccountFacts(network, address, credential)
  const orders = await fetchLighterOpenOrders(network, facts)
  return { positions: portfolio.positions as WalletPosition[], orders }
}

/**
 * The orders resting on Lighter right now. Needs the account's own
 * signature, so it costs one auth token.
 */
async function fetchLighterOpenOrders(
  network: NetworkId,
  facts: { accountIndex: number; apiKeyIndex: number }
) {
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
  const rows: WalletOpenOrder[] = []
  for (const raw of parsed.data.orders) {
    const row = orderRowSchema.safeParse(raw)
    if (!row.success) continue
    const id = row.data.order_index ?? row.data.client_order_index
    if (id === undefined || row.data.market_index === undefined) continue
    /**
     * **Lighter answers in its own whole numbers.** A price of 785841 is
     * $78,584.10 and a size of 60 is 0.0006 BTC, so a row copied across
     * unscaled would show a price ten times over and a size a hundred
     * thousand times over, on a screen about real money.
     */
    const market = await lighterMarketByIndex(network, row.data.market_index)
    if (
      !market ||
      market.facts.priceDecimals === null ||
      market.facts.sizeDecimals === null
    ) {
      continue
    }
    const px = unscaleLighterNumber(
      num(row.data.price) ?? 0,
      market.facts.priceDecimals
    )
    const sz = unscaleLighterNumber(
      num(row.data.remaining_base_amount) ?? 0,
      market.facts.sizeDecimals
    )
    const triggerPx = num(row.data.trigger_price)
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
      trigger: triggerPx !== null && triggerPx !== 0,
    })
  }
  return rows
}
