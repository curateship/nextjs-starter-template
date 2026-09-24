import { formatUsd } from "@/lib/trade/format"

/**
 * edgeX's refusals as sentences that say what to do next.
 *
 * edgeX answers a refusal with a word code (`INVALID_API_KEY`) and a `msg`,
 * on an HTTP 4xx or on an ordinary 200, so every answer's `code` is read and
 * anything but `SUCCESS` is a refusal. **The `msg` and `errorParam` never
 * leave this folder, and are never read.** Measured 24 Sep 2026: a made-up
 * key answered `"msg":"invalid apiKey : nope"` and
 * `"errorParam":{"apiKey":"nope"}`, both quoting the key back.
 *
 * Only the code is read. Three codes were seen in real answers:
 * `INVALID_API_KEY` (HTTP 401), `GATEWAY_HEADER_REQUIRED` and
 * `GATEWAY_PARAM_INVALID` (HTTP 400), plus `ACCOUNT_UPDATE_LEVERAGE_FAILED_ORDER`
 * from edgeX's own SDK tests. The rest are matched by the words edgeX's codes
 * are made of, because edgeX publishes no list; a code that matches nothing
 * becomes the general sentence and is itself thrown away.
 */

const SENTENCES = {
  EDGEX_KEY:
    "edgeX did not accept this API key. Copy the API key again from API Management → Perps V2 → SDK Signer on edgeX; a key that was deleted or never finished on edgeX is refused the same way.",
  EDGEX_REQUEST_SIGNATURE:
    "edgeX did not accept the request's signature. The API key was right, so check the secret and the passphrase: copy the secret again from the SDK Signer dialog, and type the passphrase you chose when you made the key.",
  EDGEX_PASSPHRASE:
    "edgeX did not accept the passphrase. Type the passphrase you chose when you made this API key on edgeX.",
  EDGEX_CLOCK:
    "edgeX refused the request's time. Trade re-read edgeX's clock and sent it once more, and edgeX refused that too. Check that this server's clock is set automatically.",
  EDGEX_L2_SIGNATURE:
    "edgeX refused the order's own signature. Trade signs every order afresh with the signer key, so this usually means the signer key does not belong to this account. Copy the signer key again from edgeX's SDK Signer dialog.",
  EDGEX_ORDER_GONE:
    "edgeX says this order is not open any more. It may have filled or been cancelled on edgeX itself. Refresh the account before changing anything else.",
  EDGEX_TRIGGER_SIDE:
    "edgeX refused the trigger price because it sits on the wrong side of the price, where it would fire at once. A long position's stop goes below the price and its target above; a short's the other way round.",
  EDGEX_REDUCE_ONLY:
    "edgeX says this reduce-only order would not reduce the position. Refresh the position and check its side and size.",
  EDGEX_LEVERAGE_HAS_ORDERS:
    "edgeX will not change the leverage on this market while it has open orders. Cancel the resting orders on this market first, then change the leverage.",
  EDGEX_LIQUIDATING:
    "edgeX is liquidating this account, and it takes no new orders until that finishes.",
  EDGEX_PERMISSION:
    "edgeX says this API key is not allowed to do that. Make a new key under API Management → Perps V2 → SDK Signer on edgeX and add it again.",
  EDGEX_ACCOUNT:
    "edgeX does not know this account id with this key. The account id is the number in the Account ID column of edgeX's API Management list, on the same row as the key.",
  EDGEX_PARAM:
    "edgeX refused a value in the request. Refresh the market list and the account, then try again; if it repeats, the market's rules may have changed on edgeX.",
  EDGEX_SERVER:
    "edgeX had a problem on its own side and did not finish the request. Check edgeX's status, then try again.",
} as const

export type EdgexRefusal = keyof typeof SENTENCES

/** Figures the caller knows, so a refusal can name them in dollars. */
export type EdgexRefusalContext = {
  /** What the account has free for new orders. */
  freeUsd?: number | null
  /** What this order needs held. */
  needUsd?: number | null
  /** The smallest order this market accepts, in dollars at today's price. */
  minUsd?: number | null
  /** The market's printed name, for the closed-market sentence. */
  market?: string | null
}

type Named = EdgexRefusal | "BALANCE" | "TOO_SMALL" | "CLOSED"

/**
 * edgeX's word codes, matched by the words in them. Order matters: an L2
 * signature refusal must not be read as the request's signature, and an
 * order-not-found must not be read as an account-not-found.
 */
const CODES: Array<[RegExp, Named]> = [
  [/^INVALID_API_KEY$|API_?KEY/, "EDGEX_KEY"],
  [/PASSPHRASE/, "EDGEX_PASSPHRASE"],
  [/TIMESTAMP|TIME_?STAMP|REQUEST_?EXPIRE/, "EDGEX_CLOCK"],
  [/L2|STARK|NONCE|ORDER_?SIGN|EXPIRE_?TIME/, "EDGEX_L2_SIGNATURE"],
  [/SIGN/, "EDGEX_REQUEST_SIGNATURE"],
  [/LEVERAGE_FAILED_ORDER/, "EDGEX_LEVERAGE_HAS_ORDERS"],
  [/TRIGGER/, "EDGEX_TRIGGER_SIDE"],
  [/REDUCE_?ONLY/, "EDGEX_REDUCE_ONLY"],
  [/ORDER.*(NOT_?FOUND|NOT_?EXIST)|(NOT_?FOUND|NOT_?EXIST).*ORDER|ORDER_?(FILLED|CANCELED|CANCELLED|FINISHED)/, "EDGEX_ORDER_GONE"],
  [/MARKET_?(CLOSED|NOT_?OPEN)|NOT_?TRADING|TRADING_?(CLOSED|HALT)|STOCK_?(MARKET_?)?CLOSED/, "CLOSED"],
  [/INSUFFICIENT|NOT_?ENOUGH|BALANCE|COLLATERAL|AVAILABLE|MARGIN_?(NOT|INSUFF|LACK)/, "BALANCE"],
  [/MIN(IMUM)?_?(ORDER_?)?(SIZE|VALUE|AMOUNT)|(SIZE|VALUE|AMOUNT)_?(TOO_?SMALL|LESS|BELOW)/, "TOO_SMALL"],
  [/LIQUIDAT/, "EDGEX_LIQUIDATING"],
  [/ACCOUNT.*(NOT_?FOUND|NOT_?EXIST|INVALID|MISMATCH)|INVALID_?ACCOUNT/, "EDGEX_ACCOUNT"],
  [/PERMISSION|FORBIDDEN|DENIED|NOT_?ALLOW/, "EDGEX_PERMISSION"],
  [/^GATEWAY_PARAM|PARAM_?INVALID|INVALID_?PARAM|PAGE_?SIZE/, "EDGEX_PARAM"],
]

/** Whether this answer is edgeX asking the app to slow down. */
export function edgexIsRationing(status: number): boolean {
  return status === 429
}

/** Whether this answer is edgeX refusing the request's timestamp. */
export function edgexIsClockRefusal(code: string): boolean {
  return /TIMESTAMP|TIME_?STAMP|REQUEST_?EXPIRE/.test(code)
}

function sentenceFor(
  status: number,
  code: string,
  context: EdgexRefusalContext
): string | null {
  for (const [pattern, named] of CODES) {
    if (!pattern.test(code)) continue
    if (named === "BALANCE") return balanceSentence(context)
    if (named === "TOO_SMALL") return tooSmallSentence(context)
    if (named === "CLOSED") return closedSentence(context)
    return SENTENCES[named]
  }
  // A 401 edgeX gave no word for is still the key or its signature.
  if (status === 401) return SENTENCES.EDGEX_REQUEST_SIGNATURE
  if (status === 403) return SENTENCES.EDGEX_PERMISSION
  if (status >= 500) return SENTENCES.EDGEX_SERVER
  return null
}

function balanceSentence(context: EdgexRefusalContext): string {
  const { freeUsd, needUsd } = context
  if (typeof freeUsd === "number" && typeof needUsd === "number") {
    return `edgeX says the account has ${formatUsd(freeUsd)} free and this order needs ${formatUsd(needUsd)}. Use a smaller size, a higher leverage, or free some cash first.`
  }
  return "edgeX says there is not enough free cash for this order. Money held by resting orders counts against it too. Use a smaller size or free some cash first."
}

function tooSmallSentence(context: EdgexRefusalContext): string {
  const { minUsd } = context
  if (typeof minUsd === "number") {
    return `edgeX's smallest order on this market is about ${formatUsd(minUsd)} at today's price. Use a bigger size.`
  }
  return "edgeX says this order is below the market's smallest size. Use a bigger size."
}

/**
 * A stock contract while its exchange is shut. edgeX's ticker says
 * `marketOpen: false` and its market-status read says `status: false`, and
 * neither says when it opens again (checked on Samsung on 24 Sep 2026), so
 * the sentence does not guess.
 */
export function closedSentence(context: EdgexRefusalContext = {}): string {
  const name = context.market ? `${context.market}'s market` : "This market"
  return `${name} on edgeX is closed right now, because the stock exchange it follows is shut. edgeX does not say when it reopens; try again during that exchange's trading hours.`
}

/**
 * One edgeX refusal as the error the rest of the app already knows:
 * `LIVE_ORDER_REFUSED:` and a sentence. The caller builds `EXCHANGE_BUSY:`
 * itself, because only it knows how long the hold is.
 *
 * An unknown code is thrown away with the message: "edgeX refused it" and
 * the general next step is all that is said.
 */
export function edgexRefusalError(
  input: { status: number; code: string },
  context: EdgexRefusalContext = {}
): Error {
  const sentence = sentenceFor(input.status, input.code, context)
  if (sentence) return new Error(`LIVE_ORDER_REFUSED:${sentence}`)
  return new Error(
    "LIVE_ORDER_REFUSED:edgeX refused it and said nothing Trade can put in words. Check the order and the account on edgeX's own site before trying again."
  )
}

export function edgexRefusalSentence(code: EdgexRefusal): string {
  return SENTENCES[code]
}
