/**
 * Every way Jupiter, the node or the chain can say no, turned into one
 * sentence that says what to do next.
 *
 * Jupiter's `error` and `code`, the node's JSON-RPC errors and the chain's
 * program logs are all written for developers. The rule here is Aster's
 * (`../aster/refusals.ts`): the known ones are named and get a fixed
 * sentence, and the text of an unknown one is thrown away and replaced with
 * a general next step, so outside text never reaches a screen or a log.
 *
 * Two things ride into the sentence when the app has them: the chain's
 * signature, so a swap that landed and failed can be looked up, and a
 * number Jupiter stated (how much SOL to top up). Nothing else outside
 * text survives.
 *
 * **The shared shape.** Every sentence leaves here inside the one error
 * shape the order form, the Journal and a paused watch already print:
 * `LIVE_ORDER_REFUSED:<sentence>` for a refusal that moved nothing, and
 * `EXCHANGE_BUSY:<sentence>` for a rate limit, which the engine holds off
 * from rather than pausing the order for. No screen learns a Solana code.
 */

const SOLSCAN = "solscan.io"

export type SolanaRefusal =
  | "SOLANA_BUSY"
  | "SOLANA_KEY"
  | "SOLANA_SLIPPAGE"
  | "SOLANA_NO_SOL"
  | "SOLANA_NO_USDC"
  | "SOLANA_NO_COIN"
  | "SOLANA_NOT_ENOUGH"
  | "SOLANA_EXPIRED"
  | "SOLANA_NO_ROUTE"
  | "SOLANA_CHAIN_FAILED"
  | "SOLANA_REFUSED"

export type RefusalDetail = {
  /** The chain's signature, when the swap was sent. */
  signature?: string | null
  /** Buy or sell, so "not enough" names the right coin. */
  side?: "buy" | "sell"
  /** How much SOL Jupiter said to top up, when it said a figure. */
  sol?: number | null
  /** Requests spent and allowed this minute, when the app's own budget said no. */
  spent?: { used: number; cap: number } | null
}

function lookUp(signature: string | null | undefined): string {
  return signature ? ` Signature ${signature} can be looked up on ${SOLSCAN}.` : ""
}

export function solanaRefusalSentence(
  code: SolanaRefusal,
  detail: RefusalDetail = {}
): string {
  switch (code) {
    case "SOLANA_BUSY":
      return detail.spent
        ? `Trade has spent ${detail.spent.used} of its ${detail.spent.cap} Jupiter calls this minute, and the free key allows 60 a minute. Wait for the minute to roll over, then try again.`
        : "Jupiter is rationing requests. Trade waited a second and asked once more, and Jupiter still said no; the free key allows 60 calls a minute. Wait for the minute to roll over, then try again."
    case "SOLANA_KEY":
      return "Jupiter did not accept the API key in TRADE_JUPITER_API_KEY, so nothing was sent. Get a free key at portal.jup.ag and put it in .env, or take the line out to use Jupiter's keyless host, then restart the app."
    case "SOLANA_SLIPPAGE":
      return `The price moved past the worst-fill cap while the swap was landing, so nothing was bought or sold and the wallet is as it was. Try again, or raise "Worst fill allowed %" in the order window.${lookUp(detail.signature)}`
    case "SOLANA_NO_SOL":
      return `The wallet has no SOL to pay the network fee, so the swap was not sent. Send ${detail.sol ? `at least ${detail.sol} SOL` : "a little SOL"} to the wallet address on the wallet card, then try again.`
    case "SOLANA_NO_USDC":
      return "The wallet does not hold enough USDC for this buy, so nothing was sent. Send USDC to the wallet address on the wallet card, or lower the size."
    case "SOLANA_NO_COIN":
      return 'The wallet does not hold enough of this coin for this sell, so nothing was sent. Tick "Sell only what I hold", or lower the size.'
    case "SOLANA_NOT_ENOUGH":
      return `The wallet could not cover the swap plus its fee, so nothing moved. Check the USDC and SOL on the wallet card, then try again.${lookUp(detail.signature)}`
    case "SOLANA_EXPIRED":
      return "The swap expired before it reached the chain, so nothing moved. Trade already asked Jupiter for a fresh swap once and that expired too. Try the order again."
    case "SOLANA_NO_ROUTE":
      return "Jupiter found no pool with enough money in it to swap this coin at this size, so nothing was sent. Try a smaller size, or a coin that trades more."
    case "SOLANA_CHAIN_FAILED":
      return `The chain confirmed the swap as failed, so nothing moved.${lookUp(detail.signature) || " Try it again in a moment."}`
    case "SOLANA_REFUSED":
      return `Solana refused the trade, and nothing moved. Try it again in a moment.${lookUp(detail.signature)}`
  }
}

/** The sentence inside the shared error shape the screens already print. */
export function solanaRefusalError(
  code: SolanaRefusal,
  detail: RefusalDetail = {}
): Error {
  const sentence = solanaRefusalSentence(code, detail)
  return new Error(
    code === "SOLANA_BUSY"
      ? `EXCHANGE_BUSY:${sentence}`
      : `LIVE_ORDER_REFUSED:${sentence}`
  )
}

// ---------------------------------------------------------------------------
// Jupiter's order answer

/**
 * Jupiter's `/order` answer when it could not build the swap.
 *
 * Its documented shape is an empty `transaction` beside an `errorCode` and
 * an `errorMessage`: 1 is not enough of the coin being handed over, 2 is
 * not enough SOL for the fee ("Top up 0.01 SOL for gas"), 3 is under the
 * minimum for a fee-free route. The free host also answers an empty
 * transaction with no code at all for a wallet that holds nothing
 * (measured 5 Sep 2026), which is read as not enough of what the swap
 * hands over. A route problem arrives as words, and only its shape is read.
 */
export function jupiterOrderRefusal(
  order: { errorCode: number | null; error: string | null; transaction: string | null },
  side: "buy" | "sell"
): { code: SolanaRefusal; detail: RefusalDetail } | null {
  const notEnough = side === "buy" ? "SOLANA_NO_USDC" : "SOLANA_NO_COIN"
  if (order.errorCode === 1) return { code: notEnough, detail: {} }
  if (order.errorCode === 2) {
    return { code: "SOLANA_NO_SOL", detail: { sol: statedSol(order.error) } }
  }
  // Jupiter documents that `errorMessage` "can still return despite having
  // a valid order", so once there is a swap to sign the words are ignored.
  // Only the two codes about the wallet itself refuse a built swap: sending
  // one the wallet cannot pay for costs a failed transaction on the chain.
  if (order.transaction !== null) return null
  if (order.errorCode === 3) return { code: "SOLANA_NO_ROUTE", detail: {} }
  const words = order.error ?? ""
  if (/top up .* sol/i.test(words)) {
    return { code: "SOLANA_NO_SOL", detail: { sol: statedSol(words) } }
  }
  if (/insufficient|not enough|sufficient swap amount/i.test(words)) {
    return { code: notEnough, detail: {} }
  }
  if (/route|quote|not tradable|liquidity/i.test(words)) {
    return { code: "SOLANA_NO_ROUTE", detail: {} }
  }
  if (words !== "") return { code: "SOLANA_REFUSED", detail: {} }
  return { code: notEnough, detail: {} }
}

/** The one figure worth keeping from "Top up 0.01 SOL for gas". */
function statedSol(words: string | null): number | null {
  const match = /(\d+(?:\.\d+)?)\s*SOL/i.exec(words ?? "")
  const sol = match ? Number(match[1]) : NaN
  return Number.isFinite(sol) && sol > 0 ? sol : null
}

// ---------------------------------------------------------------------------
// Jupiter's execute answer

/**
 * Jupiter's `/execute` answer when the swap did not go through.
 *
 * Jupiter documents two kinds. A negative code means the transaction never
 * reached the network: -1 "Order not found, it might have expired" and
 * -1005 "Transaction expired" are the order going stale, which is safe to
 * ask again for once. A positive code is the chain's own program error on a
 * transaction that landed and failed: 6001 is the price moving past the
 * cap, 6024 is the wallet not covering the swap and its fee. Either way a
 * failed transaction moves nothing; the chain does it all or none of it.
 */
export function jupiterExecuteRefusal(outcome: {
  code: number | null
  error: string | null
  signature: string | null
}): { code: SolanaRefusal; detail: RefusalDetail; expired: boolean } {
  const detail = { signature: outcome.signature }
  const words = outcome.error ?? ""
  if (
    outcome.code === -1 ||
    outcome.code === -1005 ||
    /expired/i.test(words)
  ) {
    return { code: "SOLANA_EXPIRED", detail: {}, expired: true }
  }
  if (outcome.code === 6001 || /slippage/i.test(words)) {
    return { code: "SOLANA_SLIPPAGE", detail, expired: false }
  }
  if (outcome.code === 6024 || /insufficient/i.test(words)) {
    return { code: "SOLANA_NOT_ENOUGH", detail, expired: false }
  }
  if (outcome.signature && outcome.code !== null && outcome.code > 0) {
    return { code: "SOLANA_CHAIN_FAILED", detail, expired: false }
  }
  return { code: "SOLANA_REFUSED", detail, expired: false }
}

// ---------------------------------------------------------------------------
// What the client throws

/**
 * Anything `client.ts` threw, as the shared shape.
 *
 * The client speaks in codes: `EXCHANGE_BUSY` after a 429 was waited out
 * once and came back, `EXCHANGE_BUSY:Jupiter — spent 40 of 40 this minute`
 * when the app's own budget said no before asking, `SOLANA_JUPITER_REFUSED:401`
 * for a status Jupiter answered, `SOLANA_NODE_REFUSED:…` for the node. A
 * 401 or 403 is the key; a 4xx on the order call is Jupiter finding no
 * swap to build; anything else is unknown and its text goes nowhere.
 */
export function explainSolanaError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (message.startsWith("EXCHANGE_BUSY")) {
    const spent = /spent (\d+) of (\d+)/.exec(message)
    return solanaRefusalError("SOLANA_BUSY", {
      spent: spent ? { used: Number(spent[1]), cap: Number(spent[2]) } : null,
    })
  }
  const jupiter = /^SOLANA_JUPITER_REFUSED:(\d{3})$/.exec(message)
  if (jupiter) {
    const status = Number(jupiter[1])
    if (status === 401 || status === 403) return solanaRefusalError("SOLANA_KEY")
    if (status === 429) return solanaRefusalError("SOLANA_BUSY")
    if (status >= 400 && status < 500) return solanaRefusalError("SOLANA_NO_ROUTE")
  }
  return solanaRefusalError("SOLANA_REFUSED")
}
