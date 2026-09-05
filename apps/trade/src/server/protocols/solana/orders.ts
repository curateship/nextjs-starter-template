import { VersionedTransaction } from "@solana/web3.js"
import { z } from "zod"

import type {
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  SwapQuote,
  WalletOrderFill,
  WalletOrderInfo,
} from "@/lib/protocols/contracts"
import {
  assertPlaceOrderValues,
  orderCredential,
} from "@/server/protocols/connector-helpers"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import {
  fetchSolanaPortfolio,
  SOL_MINT,
} from "@/server/protocols/solana/account"
import {
  jupiterGet,
  jupiterPost,
  solanaRpc,
} from "@/server/protocols/solana/client"
import {
  lastKnownSolanaDecimals,
  lastKnownSolanaPrices,
  USDC_MINT,
} from "@/server/protocols/solana/markets"
import {
  explainSolanaError,
  jupiterExecuteRefusal,
  jupiterOrderRefusal,
  solanaRefusalError,
  solanaRefusalSentence,
} from "@/server/protocols/solana/refusals"
import { parseSolanaCredential } from "@/server/protocols/solana/wallet"

/**
 * Buying and selling on Solana through Jupiter — the one file in this
 * folder that moves money.
 *
 * **There is no order book, so every order is a swap.** Jupiter finds the
 * best route across the pools and hands back an unsigned transaction; the
 * app signs it with the wallet's own key and Jupiter sends it. It fills at
 * that instant's price, capped by a slippage limit, or it does not fill at
 * all. Nothing rests, so cancel, modify and brackets are refused in plain
 * words rather than pretending.
 *
 * The rules it keeps, in the order they bite:
 *
 * - **Only a market order.** The app's smart orders already send nothing
 *   until the price is reached; on Solana what is sent at that moment is
 *   the swap. A resting shape is refused, and the order window never
 *   offers one on a swap venue.
 * - **Refused before signing** when Jupiter cannot build the swap, when
 *   the price impact is over the cap, or when the quoted price is worse
 *   than the order's price by more than the cap. A refusal here costs one
 *   request and moves nothing.
 * - **The real-money gate sits between the quote and the signature**, so
 *   with the master switch off the whole path short of the send can be
 *   walked for free. Solana has no practice network Jupiter can swap on,
 *   so this gate is the only thing between a click and money.
 * - **A sell is capped at what the wallet holds.** "Sell only what I hold"
 *   shrinks it to the holding; without that, a sell of more than the wallet
 *   has is refused before Jupiter is asked.
 * - **The fill is read back from the chain**, never taken from the quote.
 *   The confirmed transaction says exactly what left the wallet and what
 *   arrived, and that is the price and size the Journal gets.
 * - **Nothing retries.** A swap sent twice could be a swap made twice. The
 *   one exception is an order Jupiter says expired before it was sent,
 *   which is asked for fresh once.
 * - **Every no is said in the app's words.** `refusals.ts` turns Jupiter's
 *   codes, the node's errors and the chain's program errors into one
 *   sentence with a next step, and the outside text goes nowhere.
 */

const USDC_DECIMALS = 6
const SOL_DECIMALS = 9

/** Jupiter's own default, and the order window's. */
export const DEFAULT_SLIPPAGE = 0.005

/**
 * How long the confirmed transaction is waited for after Jupiter reports
 * success. Jupiter's execute answers once the transaction is confirmed, so
 * the node usually has it on the first ask; a public node lagging a few
 * seconds is the case the rest of the tries cover.
 */
export const CONFIRM_TRIES = 15
const CONFIRM_GAP_MS = 1_000

const NOTHING_RESTS =
  "Nothing rests on Solana. A swap fills the moment it is sent, so a level is watched here and swapped when the price reaches it."

// ---------------------------------------------------------------------------
// Amounts

/**
 * A coin amount as the integer string the chain speaks: USDC has six
 * decimals, so $10 is "10000000". Cut, never rounded up, so an order never
 * sends more than was asked for, and built from text rather than
 * multiplied so a nine-decimal coin cannot lose its last digits to a float.
 */
export function toSmallestUnit(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("LIVE_SIZE")
  const [whole, fraction = ""] = amount.toFixed(decimals + 3).split(".")
  const digits = `${whole}${fraction.slice(0, decimals)}`.replace(
    /^0+(?=\d)/,
    ""
  )
  return BigInt(digits).toString()
}

/** The chain's integer string back as a coin amount. */
export function fromSmallestUnit(raw: string, decimals: number): number {
  return Number(raw) / 10 ** decimals
}

const decimalsByMint = new Map<string, number>([
  [USDC_MINT, USDC_DECIMALS],
  [SOL_MINT, SOL_DECIMALS],
])

const supplySchema = z.object({ value: z.object({ decimals: z.number() }) })

/**
 * How many decimals a coin is written in. The market list already knows it
 * for every listed coin; a coin found by search or sent in is asked of the
 * chain once, and the answer is kept, because a mint's decimals never change.
 */
async function mintDecimals(network: NetworkId, mint: string): Promise<number> {
  const known = decimalsByMint.get(mint) ?? lastKnownSolanaDecimals().get(mint)
  if (known !== undefined) return known
  const answer = supplySchema.safeParse(
    await solanaRpc(network, "getTokenSupply", [mint])
  )
  if (!answer.success) throw new Error("LIVE_UNLISTED")
  decimalsByMint.set(mint, answer.data.value.decimals)
  return answer.data.value.decimals
}

// ---------------------------------------------------------------------------
// The quote

/**
 * Jupiter's answer to "what would this swap do". The two shapes seen on
 * 4 Sep 2026: a full order with a transaction, and a bare `{error}` for a
 * taker the chain has never seen. An order that cannot be built carries
 * `errorMessage` beside empty transaction text, so both are read.
 */
const orderAnswerSchema = z.object({
  inAmount: z.string().optional(),
  outAmount: z.string().optional(),
  priceImpactPct: z.union([z.string(), z.number()]).optional(),
  routePlan: z
    .array(
      z.object({
        swapInfo: z.object({ label: z.string().optional() }).optional(),
      })
    )
    .optional(),
  transaction: z.string().nullable().optional(),
  requestId: z.string().optional(),
  errorCode: z.number().optional(),
  errorMessage: z.string().optional(),
  error: z.string().optional(),
})

export type SwapOrder = {
  /** Coins the swap hands over (a buy) or takes (a sell). */
  coins: number
  /** Dollars the swap takes (a buy) or hands over (a sell). */
  usd: number
  price: number
  /** As a fraction: 0.0002 is two hundredths of a percent. */
  priceImpact: number
  route: string
  /** The unsigned swap, base64, when Jupiter could build one. */
  transaction: string | null
  requestId: string | null
  /**
   * Jupiter's own words when it could not build the swap, and its number
   * for them. Read by `refusals.ts` and never shown: the sentence on the
   * screen is the app's.
   */
  error: string | null
  errorCode: number | null
}

/** Jupiter's order answer as the figures the app reasons about. */
export function readSwapOrder(
  answer: unknown,
  input: { side: "buy" | "sell"; coinDecimals: number }
): SwapOrder {
  const parsed = orderAnswerSchema.safeParse(answer)
  if (!parsed.success) throw new Error("SOLANA_SWAP_UNREADABLE")
  const order = parsed.data
  const error = order.errorMessage ?? order.error ?? null
  const inAmount = order.inAmount ?? "0"
  const outAmount = order.outAmount ?? "0"
  const coins =
    input.side === "buy"
      ? fromSmallestUnit(outAmount, input.coinDecimals)
      : fromSmallestUnit(inAmount, input.coinDecimals)
  const usd =
    input.side === "buy"
      ? fromSmallestUnit(inAmount, USDC_DECIMALS)
      : fromSmallestUnit(outAmount, USDC_DECIMALS)
  const labels = (order.routePlan ?? []).flatMap((hop) =>
    hop.swapInfo?.label ? [hop.swapInfo.label] : []
  )
  const impact = Number(order.priceImpactPct ?? 0)
  return {
    coins,
    usd,
    price: coins > 0 ? usd / coins : 0,
    priceImpact: Number.isFinite(impact) ? Math.abs(impact) : 0,
    route: labels.length > 0 ? labels.join(" → ") : "Jupiter",
    transaction: order.transaction ? order.transaction : null,
    requestId: order.requestId ?? null,
    error,
    errorCode: order.errorCode ?? null,
  }
}

function pct(fraction: number): string {
  return `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
}

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 6 : 2,
  })
}

/**
 * Why this quote must not be signed, or null when it may be.
 *
 * Three refusals, each before anything is signed: Jupiter could not build
 * the swap (not enough USDC, no SOL for the fee, no pool with enough money,
 * said in the app's words by `refusals.ts`); the swap would move the price
 * more than the cap allows (a thin coin); or the quoted price is worse than
 * the order's price by more than the cap. `px` null skips the last, for a
 * close that takes today's price.
 */
export function swapRefusal(
  order: SwapOrder,
  input: { side: "buy" | "sell"; px: number | null; slippage: number }
): string | null {
  const notBuilt = jupiterOrderRefusal(order, input.side)
  if (notBuilt) return solanaRefusalSentence(notBuilt.code, notBuilt.detail)
  if (order.transaction === null || order.requestId === null) {
    return solanaRefusalSentence("SOLANA_REFUSED")
  }
  if (!(order.coins > 0) || !(order.usd > 0)) {
    return "Jupiter quoted nothing for this size."
  }
  if (order.priceImpact > input.slippage) {
    return `This swap would move the price by ${pct(order.priceImpact)}, more than the ${pct(input.slippage)} cap allows. Use a smaller size, or raise the cap in the order window.`
  }
  if (input.px !== null) {
    if (input.side === "buy") {
      const worst = input.px * (1 + input.slippage)
      if (order.price > worst) {
        return `Jupiter quotes ${money(order.price)} a coin and the order allows up to ${money(worst)}, which is ${money(input.px)} plus the ${pct(input.slippage)} cap.`
      }
    } else {
      const worst = input.px * (1 - input.slippage)
      if (order.price < worst) {
        return `Jupiter quotes ${money(order.price)} a coin and the order allows no less than ${money(worst)}, which is ${money(input.px)} less the ${pct(input.slippage)} cap.`
      }
    }
  }
  return null
}

function assertMainnet(network: NetworkId): void {
  // Jupiter routes the real network only; there is nothing to swap on
  // devnet, which is why the registry lists mainnet alone.
  if (network !== "mainnet") throw new Error("SOLANA_NETWORK_UNSUPPORTED")
}

/** One `/ultra/v1/order` ask, sized in the coin's smallest unit. */
async function askJupiter(input: {
  network: NetworkId
  address: string
  marketId: string
  side: "buy" | "sell"
  sz: number
  px: number | null
  slippage: number
  priority: "read" | "order"
}): Promise<{ order: SwapOrder; coinDecimals: number }> {
  assertMainnet(input.network)
  const coinDecimals = await mintDecimals(input.network, input.marketId)
  // A buy spends dollars: the size in coins times the price the order was
  // agreed at, so a buy with no price is refused rather than sized off a
  // guess. A sell hands over the coins themselves.
  if (input.side === "buy" && input.px === null) throw new Error("LIVE_PRICE")
  const amount =
    input.side === "buy"
      ? toSmallestUnit(input.sz * input.px!, USDC_DECIMALS)
      : toSmallestUnit(input.sz, coinDecimals)
  if (amount === "0") throw new Error("LIVE_SIZE")
  let answer: unknown
  try {
    answer = await jupiterGet(
      "/ultra/v1/order",
      {
        inputMint: input.side === "buy" ? USDC_MINT : input.marketId,
        outputMint: input.side === "buy" ? input.marketId : USDC_MINT,
        amount,
        taker: input.address,
        slippageBps: Math.round(input.slippage * 10_000),
      },
      { priority: input.priority }
    )
  } catch (error) {
    throw explainSolanaError(error)
  }
  return {
    order: readSwapOrder(answer, { side: input.side, coinDecimals }),
    coinDecimals,
  }
}

/**
 * The order window's preview: what Jupiter would do with this order right
 * now, and whether the app would let it go out. A read, not an order, so
 * it draws on the reads' share of the minute and never on the room kept
 * for swaps.
 */
export async function quoteSolanaSwap(
  network: NetworkId,
  address: string,
  params: {
    marketId: string
    side: "buy" | "sell"
    sz: number
    px: number
    slippage: number
  }
): Promise<SwapQuote> {
  const { order } = await askJupiter({
    network,
    address,
    marketId: params.marketId,
    side: params.side,
    sz: params.sz,
    px: params.px,
    slippage: params.slippage,
    priority: "read",
  })
  return {
    sz: order.coins,
    usd: order.usd,
    price: order.price,
    priceImpact: order.priceImpact,
    route: order.route,
    refusal: swapRefusal(order, {
      side: params.side,
      px: params.px,
      slippage: params.slippage,
    }),
  }
}

// ---------------------------------------------------------------------------
// The swap

const executeSchema = z.object({
  status: z.string().optional(),
  signature: z.string().optional(),
  error: z.string().optional(),
  code: z.number().optional(),
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * How many times a swap is asked for when the one before went stale.
 *
 * "Nothing retries" holds for a swap that may have been sent. Jupiter's
 * -1 and -1005 are the exception it documents: the order expired before
 * it reached the network, so nothing was sent and a fresh order is a first
 * try, not a second. One fresh order, then the expiry is reported.
 */
const FRESH_ORDERS_AFTER_EXPIRY = 1

/**
 * The one path every swap takes: quote, refuse or not, gate, sign, send,
 * read back. `px` null is a close, which takes today's price.
 */
async function swap(input: {
  network: NetworkId
  auth: OrderAuth
  marketId: string
  side: "buy" | "sell"
  sz: number
  px: number | null
  slippage: number
}): Promise<{
  signature: string
  avgPx: number | null
  filledSz: number | null
}> {
  const address = input.auth.accountAddress ?? ""
  if (!address) throw new Error("LIVE_WALLET_KEY")
  for (let fresh = 0; ; fresh += 1) {
    const { order } = await askJupiter({
      ...input,
      address,
      priority: "order",
    })
    const refusal = swapRefusal(order, {
      side: input.side,
      px: input.px,
      slippage: input.slippage,
    })
    if (refusal !== null) throw new Error(`LIVE_ORDER_REFUSED:${refusal}`)

    // Between the quote and the signature on purpose: everything above is
    // free to walk with the switch off, and nothing below may run without it.
    await assertRealMoneyAllowed(input.network)

    const sent = await signAndSend(input.auth, order)
    if ("signature" in sent) {
      const fill = await confirmedSwapFill(
        input.network,
        sent.signature,
        address
      )
      if (fill === null) {
        console.warn(
          `[solana] swap ${sent.signature} sent but not readable from the node after ${CONFIRM_TRIES} tries; the fills sweep will record it`
        )
        return { signature: sent.signature, avgPx: null, filledSz: null }
      }
      return { signature: sent.signature, avgPx: fill.px, filledSz: fill.sz }
    }
    if (sent.expired && fresh < FRESH_ORDERS_AFTER_EXPIRY) continue
    throw solanaRefusalError(sent.code, sent.detail)
  }
}

/**
 * Signs Jupiter's transaction with the wallet's key and hands it back to
 * Jupiter to send. The answer is the chain's signature, or why not, in the
 * app's words, with whether the order merely went stale (never sent, safe
 * to ask for again).
 */
async function signAndSend(
  auth: OrderAuth,
  order: SwapOrder
): Promise<
  | { signature: string }
  | ReturnType<typeof jupiterExecuteRefusal>
> {
  const keypair = orderCredential(auth, parseSolanaCredential)
  let transaction: VersionedTransaction
  try {
    transaction = VersionedTransaction.deserialize(
      Buffer.from(order.transaction!, "base64")
    )
  } catch {
    throw new Error(
      "LIVE_EXCHANGE:Jupiter handed back a swap this app could not read, so nothing was signed."
    )
  }
  transaction.sign([keypair])
  const signed = Buffer.from(transaction.serialize()).toString("base64")

  let sent: { status: number; body: unknown }
  try {
    sent = await jupiterPost("/ultra/v1/execute", {
      signedTransaction: signed,
      requestId: order.requestId!,
    })
  } catch (error) {
    throw explainSolanaError(error)
  }
  const result = executeSchema.safeParse(sent.body)
  const outcome = result.success ? result.data : {}
  if (
    sent.status < 400 &&
    outcome.status === "Success" &&
    outcome.signature
  ) {
    return { signature: outcome.signature }
  }
  // A swap that failed on the chain moved no coins: the whole transaction
  // is one step and it either happens or it does not. Jupiter's words for
  // why are read here and go no further.
  return jupiterExecuteRefusal({
    code: outcome.code ?? null,
    error: outcome.error ?? null,
    signature: outcome.signature || null,
  })
}

/**
 * The confirmed transaction, read back from the node until it is there.
 * Null after the last try: the swap was sent, and the fills sweep finds it
 * on the chain later, so the caller says "sent, fill not read yet" rather
 * than guessing a price.
 */
async function confirmedSwapFill(
  network: NetworkId,
  signature: string,
  address: string
): Promise<WalletOrderFill | null> {
  for (let attempt = 0; attempt < CONFIRM_TRIES; attempt += 1) {
    if (attempt > 0) await sleep(CONFIRM_GAP_MS)
    let answer: unknown
    try {
      answer = await readTransaction(network, signature)
    } catch {
      // The node's own words go nowhere: the line says which read failed.
      console.warn(`[solana] could not read ${signature} from the node yet`)
      continue
    }
    if (answer === null) continue
    const fill = swapFillFromTransaction(answer, address)
    if (fill !== null) {
      rememberFill(signature, fill)
      return fill
    }
    // The transaction is there and is not a swap this wallet made: nothing
    // more will change, so stop asking.
    rememberFill(signature, null)
    return null
  }
  return null
}

function readTransaction(network: NetworkId, signature: string) {
  return solanaRpc(network, "getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    },
  ])
}

export async function placeSolanaOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  assertPlaceOrderValues(params)
  if (params.kind !== "market")
    throw new Error(`LIVE_ORDER_REFUSED:${NOTHING_RESTS}`)
  if (params.side === "buy" && params.reduceOnly) {
    throw new Error(
      'LIVE_ORDER_REFUSED:"Sell only what I hold" is for a sell. A buy on Solana buys the coin outright, so untick it and place the buy.'
    )
  }
  let sz = params.sz
  if (params.side === "sell") {
    // Sized against the chain's own number, read now, because a sell of
    // more than the wallet holds fails on the chain after the request was
    // spent, and "sell only what I hold" has to mean exactly that.
    const portfolio = await fetchSolanaPortfolio(
      network,
      auth.accountAddress ?? ""
    )
    const held =
      portfolio.positions.find((one) => one.marketId === params.marketId)
        ?.szi ?? 0
    if (held <= 0) {
      throw new Error(
        "LIVE_ORDER_REFUSED:This wallet holds none of this coin, so there is nothing to sell."
      )
    }
    if (sz > held * (1 + 1e-9)) {
      if (!params.reduceOnly) {
        throw new Error(
          `LIVE_ORDER_REFUSED:This wallet holds ${held.toLocaleString("en-US", { maximumFractionDigits: 6 })} and the order sells ${sz.toLocaleString("en-US", { maximumFractionDigits: 6 })}. Tick "Sell only what I hold" to sell the ${held.toLocaleString("en-US", { maximumFractionDigits: 6 })}, or lower the size.`
        )
      }
      sz = held
    }
  }
  const slippage = params.slippage ?? DEFAULT_SLIPPAGE
  const done = await swap({
    network,
    auth,
    marketId: params.marketId,
    side: params.side,
    sz,
    px: params.px,
    slippage,
  })
  const wantedProtection = params.tpPx !== null || params.slPx !== null
  return {
    status: "filled",
    // The chain's signature is the only id a swap has. The fill the sweep
    // records carries the same one, so the two meet in the Journal.
    orderId: done.signature,
    avgPx: done.avgPx,
    filledSz: done.filledSz,
    protection: wantedProtection ? "partial" : null,
    protectionNote: wantedProtection
      ? "The swap went through. Solana holds no stop or target on the chain, so none was placed: put a sell smart order at that price instead."
      : null,
  }
}

/** Sells the whole holding at today's price, within the default cap. */
export async function closeSolanaPosition(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; szi: number }
): Promise<{ avgPx: number | null; filledSz: number | null }> {
  if (params.szi <= 0) {
    throw new Error(
      "LIVE_ORDER_REFUSED:This wallet holds none of this coin, so there is nothing to sell."
    )
  }
  const done = await swap({
    network,
    auth,
    marketId: params.marketId,
    side: "sell",
    sz: params.szi,
    px: null,
    slippage: DEFAULT_SLIPPAGE,
  })
  return { avgPx: done.avgPx, filledSz: done.filledSz }
}

export async function cancelSolanaOrder(): Promise<void> {
  throw new Error(
    `LIVE_ORDER_REFUSED:${NOTHING_RESTS} There is no order to cancel.`
  )
}

export async function modifySolanaOrder(): Promise<void> {
  throw new Error(
    `LIVE_ORDER_REFUSED:${NOTHING_RESTS} There is no order to move.`
  )
}

export async function setSolanaBrackets(): Promise<{
  slOrderId: string | null
}> {
  throw new Error(
    "LIVE_ORDER_REFUSED:Solana holds no stop or target on the chain. Put a sell smart order at that price instead; it is watched here and swapped when the price reaches it."
  )
}

/** A swap has no order behind it, so no fill was ever a stop firing. */
export async function fetchSolanaOrderInfo(): Promise<WalletOrderInfo> {
  return { kind: "none", triggerPx: null }
}

// ---------------------------------------------------------------------------
// Fills, read off the chain

const balanceRowSchema = z.object({
  accountIndex: z.number(),
  mint: z.string(),
  owner: z.string().optional(),
  uiTokenAmount: z.object({ amount: z.string(), decimals: z.number() }),
})

const transactionSchema = z.object({
  slot: z.number().optional(),
  blockTime: z.number().nullable().optional(),
  meta: z.object({
    err: z.unknown().nullable(),
    fee: z.number(),
    preBalances: z.array(z.number()),
    postBalances: z.array(z.number()),
    preTokenBalances: z.array(balanceRowSchema).nullable().optional(),
    postTokenBalances: z.array(balanceRowSchema).nullable().optional(),
  }),
  transaction: z.object({
    signatures: z.array(z.string()),
    message: z.object({
      accountKeys: z.array(z.object({ pubkey: z.string() })),
    }),
  }),
})

/**
 * One confirmed transaction as a fill, or null when it is not a swap this
 * wallet made against USDC.
 *
 * The chain does not say "this was a swap"; it says what every account held
 * before and after. So a fill is read as: this wallet's USDC moved one way,
 * and exactly one other coin moved the other way. A deposit moves one coin
 * and no USDC; a swap of SOL for some other coin moves two coins and no
 * USDC; neither is a fill here, because neither is a buy or sell the app
 * prices in dollars. The saved fixture holds one of each.
 *
 * SOL is the one coin the chain counts outside the token accounts. Jupiter
 * wraps and unwraps it inside the swap, so the wallet's own lamports are
 * what moved, with the fee it paid added back — and only when no token
 * moved, because a buy of any other coin also costs a little SOL in fees
 * and the rent of a fresh token account.
 */
export function swapFillFromTransaction(
  answer: unknown,
  wallet: string
): WalletOrderFill | null {
  const parsed = transactionSchema.safeParse(answer)
  if (!parsed.success) return null
  const tx = parsed.data
  if (tx.meta.err !== null && tx.meta.err !== undefined) return null
  // The node dates a confirmed transaction; one it cannot date is not yet a
  // record the Journal can place.
  if (!tx.blockTime) return null

  const before = new Map<string, { amount: bigint; decimals: number }>()
  const after = new Map<string, { amount: bigint; decimals: number }>()
  const add = (
    into: Map<string, { amount: bigint; decimals: number }>,
    rows: z.infer<typeof balanceRowSchema>[] | null | undefined
  ) => {
    for (const row of rows ?? []) {
      if (row.owner !== wallet) continue
      const held = into.get(row.mint) ?? {
        amount: 0n,
        decimals: row.uiTokenAmount.decimals,
      }
      held.amount += BigInt(row.uiTokenAmount.amount)
      into.set(row.mint, held)
    }
  }
  add(before, tx.meta.preTokenBalances)
  add(after, tx.meta.postTokenBalances)

  const moved = new Map<string, { delta: bigint; decimals: number }>()
  for (const mint of new Set([...before.keys(), ...after.keys()])) {
    const pre = before.get(mint)
    const post = after.get(mint)
    const delta = (post?.amount ?? 0n) - (pre?.amount ?? 0n)
    if (delta === 0n) continue
    moved.set(mint, { delta, decimals: (post ?? pre)!.decimals })
  }
  const usdc = moved.get(USDC_MINT)
  if (!usdc) return null
  moved.delete(USDC_MINT)

  // Wrapped SOL the wallet keeps counts as SOL; the wallet's own lamports
  // count only when no token moved at all.
  const keys = tx.transaction.message.accountKeys.map((key) => key.pubkey)
  const at = keys.indexOf(wallet)
  const paidFee = at === 0 ? tx.meta.fee : 0
  if (moved.size === 0 && at >= 0) {
    const lamports =
      BigInt(tx.meta.postBalances[at] ?? 0) -
      BigInt(tx.meta.preBalances[at] ?? 0) +
      BigInt(paidFee)
    if (lamports !== 0n)
      moved.set(SOL_MINT, { delta: lamports, decimals: SOL_DECIMALS })
  }
  if (moved.size !== 1) return null
  const [mint, coin] = [...moved.entries()][0]
  const bought = usdc.delta < 0n
  if (bought ? coin.delta <= 0n : coin.delta >= 0n) return null

  const sz =
    Number(coin.delta < 0n ? -coin.delta : coin.delta) / 10 ** coin.decimals
  const usd =
    Number(usdc.delta < 0n ? -usdc.delta : usdc.delta) / 10 ** usdc.decimals
  if (!(sz > 0) || !(usd > 0)) return null
  const signature = tx.transaction.signatures[0] ?? ""
  const solPrice = lastKnownSolanaPrices().get(SOL_MINT) ?? 0
  return {
    fillId: signature,
    orderId: signature,
    marketId: mint,
    side: bought ? "buy" : "sell",
    px: usd / sz,
    sz,
    at: tx.blockTime * 1_000,
    // Nothing on the chain states what a sale made; `profitPerSale` is
    // false on the registry entry, so this zero reads as "not stated".
    closedPnl: 0,
    fee: (paidFee / 10 ** SOL_DECIMALS) * solPrice,
    // The Journal pairs an opening buy with the sell that closes it by
    // these words, the way every other venue's fills are read.
    dir: bought ? "Open Long" : "Close Long",
    liquidation: false,
  }
}

const signaturesSchema = z.array(
  z.object({
    signature: z.string(),
    blockTime: z.number().nullable().optional(),
    err: z.unknown().nullable().optional(),
  })
)

/**
 * A transaction, once read, never changes, so what each one turned out to
 * be is kept: a fill, or null for one that was not a swap. Capped so a
 * wallet that never stops trading cannot grow it forever.
 */
const REMEMBERED_FILLS = 2_000
const fillBySignature = new Map<string, WalletOrderFill | null>()

function rememberFill(signature: string, fill: WalletOrderFill | null): void {
  if (fillBySignature.size >= REMEMBERED_FILLS) {
    const oldest = fillBySignature.keys().next().value
    if (oldest !== undefined) fillBySignature.delete(oldest)
  }
  fillBySignature.set(signature, fill)
}

/**
 * How many transactions one sweep will read that it has not seen. Each is
 * a node request, and the public node rations by address, so a wallet with
 * a long history is read a few transactions a sweep rather than all at once.
 */
const READS_PER_SWEEP = 10
const SIGNATURES_PER_SWEEP = 50

/**
 * The wallet's swaps since `since`, read off the chain.
 *
 * Solana has no fills endpoint: the record is the chain itself. One request
 * lists the wallet's latest transactions with the time of each; those newer
 * than `since` and not yet read are fetched and read as fills. The app is
 * the one making these swaps, so a busy sweep is a handful of reads, and
 * an idle one is the single listing call.
 */
export async function fetchSolanaOrderFills(
  network: NetworkId,
  address: string,
  since: number
): Promise<WalletOrderFill[]> {
  assertMainnet(network)
  const listed = signaturesSchema.safeParse(
    await solanaRpc(network, "getSignaturesForAddress", [
      address,
      { limit: SIGNATURES_PER_SWEEP, commitment: "confirmed" },
    ])
  )
  if (!listed.success) throw new Error("SOLANA_ACCOUNT_UNREADABLE")
  const fresh = listed.data.filter(
    (row) =>
      (row.err === null || row.err === undefined) &&
      (row.blockTime ?? 0) * 1_000 >= since
  )
  const fills: WalletOrderFill[] = []
  let reads = 0
  for (const row of fresh) {
    if (!fillBySignature.has(row.signature)) {
      if (reads >= READS_PER_SWEEP) continue
      reads += 1
      const answer = await readTransaction(network, row.signature)
      // Not there yet on this node: asked again on the next sweep.
      if (answer === null) continue
      rememberFill(row.signature, swapFillFromTransaction(answer, address))
    }
    const fill = fillBySignature.get(row.signature)
    if (fill) fills.push(fill)
  }
  return fills.sort((a, b) => a.at - b.at)
}

/** Tests must not read another case's remembered transactions. */
export function clearSolanaOrderState(): void {
  fillBySignature.clear()
  decimalsByMint.clear()
  decimalsByMint.set(USDC_MINT, USDC_DECIMALS)
  decimalsByMint.set(SOL_MINT, SOL_DECIMALS)
}
