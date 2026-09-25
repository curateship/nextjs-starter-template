import { formatUsd } from "@/lib/trade/format"

/**
 * ApeX Omni's refusals as sentences that say what to do next.
 *
 * ApeX answers most refusals on an ordinary HTTP 200, with a numeric `code`
 * and a `msg` inside. **The `msg` never leaves this folder.** Measured
 * 24 Sep 2026: a bad API key answered code 10002 with a message that quoted
 * the key back, `"Api credential is invalid [apiKey=…]!"`. So a refusal is
 * one of the sentences below, or the general one with only the numeric code
 * kept. The message is read here only to find ApeX's own error key, such as
 * `ORDER_NOT_FOUND`, which its docs list and which carries no account data.
 */

const SENTENCES = {
  APEX_CLOCK:
    "ApeX Omni refused the request's time. Trade re-read ApeX's clock and sent it once more, and ApeX refused that too. Check that this server's clock is set automatically.",
  APEX_AUTH:
    "ApeX Omni did not accept these API values. Copy the API key, secret and passphrase again from ApeX's API management page; a wrong secret or passphrase is refused the same way as a wrong key.",
  APEX_L2_SIGNATURE:
    "ApeX Omni refused the order's signature. Trade signs every order afresh, so this usually means the omni key does not belong to this account. Copy the omni key again from ApeX's API management page.",
  APEX_ORDER_GONE:
    "ApeX Omni says this order is not open any more. It may have filled or been cancelled on ApeX itself. Refresh the account before changing anything else.",
  APEX_TOO_MANY_ORDERS:
    "ApeX Omni allows 200 open orders per account, and this account has reached that. Cancel some resting orders first.",
  APEX_REDUCE_ONLY:
    "ApeX Omni says this reduce-only order would not reduce the position at that price. Refresh the position and check its side and size.",
  APEX_MARKET_CLOSED:
    "ApeX Omni is not taking new orders on this market right now. Try again when ApeX opens it again.",
  APEX_OPEN_CLOSED:
    "ApeX Omni is only letting positions on this market be closed right now, not opened.",
  APEX_FEE_CAP:
    "ApeX Omni says the fee this order was allowed to pay is too low. Trade reads the account's fee rate for every order, so try again once; if it repeats, check the account's fee tier on ApeX.",
  APEX_LIQUIDATING:
    "ApeX Omni is liquidating this account, and it takes no new orders until that finishes.",
  APEX_POSITION_CAP:
    "If this order filled, the position would be bigger than ApeX Omni allows on this market. Use a smaller size.",
  APEX_STOCK_ACCOUNT:
    "ApeX Omni trades stocks, indices and commodities from a separate RWA account with its own keys, which Trade does not set up. Trade this market on ApeX's own site for now.",
  APEX_PERMISSION:
    "ApeX Omni says this API key is not allowed to do that. Check the key's permissions on ApeX's API management page, or make a new key with trading allowed.",
  APEX_NOT_FOUND:
    "ApeX Omni does not know that market or record. Refresh the market list before trying again.",
  APEX_SERVER:
    "ApeX Omni had a problem on its own side and did not finish the request. Check ApeX's status, then try again.",
} as const

export type ApexRefusal = keyof typeof SENTENCES

/** Figures the caller knows, so a refusal can name them in dollars. */
export type ApexRefusalContext = {
  /** What the account has free for new orders. */
  freeUsd?: number | null
  /** What this order needs held. */
  needUsd?: number | null
  /** The smallest order this market accepts, in dollars at today's price. */
  minUsd?: number | null
}

/**
 * ApeX's documented error keys, found in its answer's `msg`. Only the word
 * itself is matched, never shown.
 */
const KEYS: Array<[RegExp, ApexRefusal | "BALANCE" | "TOO_SMALL"]> = [
  [/\bINVALID_L2_SIGNATURE\b/, "APEX_L2_SIGNATURE"],
  [/\bORDER_NOT_FOUND\b|\bORDER_NOT_CANCEL_(?:FILLED|INVALID_STATUS)\b/, "APEX_ORDER_GONE"],
  [/\bORDER_OPEN_ORDER_COUNT_LIMIT_EXCEED\b/, "APEX_TOO_MANY_ORDERS"],
  [/\bORDER_WITH_THIS_PRICE_CANNOT_REDUCE_POSITION_ONLY\b|\bORDER_IS_REDUCE_ONLY_CANNOT_OPEN_POSITION\b/, "APEX_REDUCE_ONLY"],
  [/\bORDER_SYMBOL_DISABLE_TRADE\b/, "APEX_MARKET_CLOSED"],
  [/\bORDER_SYMBOL_DISABLE_OPEN_POSITION\b/, "APEX_OPEN_CLOSED"],
  [/\bORDER_LIMIT_FEE_NOT_ENOUGH\b/, "APEX_FEE_CAP"],
  [/\bORDER_LIQUIDATING_ACCOUNT_CANNOT_CREATE_ORDER\b/, "APEX_LIQUIDATING"],
  [/\bORDER_POSSIBLE_GREATER_THAN_SYMBOL_MAX_POSITION\b|\bORDER_SIZE_GREATER_THAN_SYMBOL_MAX_ORDER_SIZE\b/, "APEX_POSITION_CAP"],
  [/\bORDER_THERE_IS_NOT_ENOUGH_MARGIN_TO_OPEN_POSITION\b|\bORDER_POSSIBLE_LEAD_TO_ACCOUNT_LIQUIDATED(?:_TV_TR_RATE_NOT_IMPROVED)?\b/, "BALANCE"],
  [/\bORDER_SIZE_SMALLER_THAN_SYMBOL_MIN_ORDER_SIZE\b/, "TOO_SMALL"],
  // Trade refuses stock contracts before sending (they need ApeX's separate
  // RWA account), so a PermissionDenied that reaches here is about the key.
  [/\bPermissionDenied\b/, "APEX_PERMISSION"],
]

/** Whether this answer is ApeX asking the app to slow down. */
export function apexIsRationing(status: number, code: string): boolean {
  // 403 is ApeX's "this address is banned", 429 the ordinary rate answer,
  // and 10003 its own "Too Many Requests" code inside a 200.
  return status === 429 || status === 403 || code === "10003"
}

/** Whether this answer is ApeX refusing the request's timestamp. */
export function apexIsClockRefusal(code: string): boolean {
  return code === "20002"
}

function sentenceFor(
  status: number,
  code: string,
  msg: string,
  context: ApexRefusalContext
): string | null {
  for (const [pattern, named] of KEYS) {
    if (!pattern.test(msg)) continue
    if (named === "BALANCE") return balanceSentence(context)
    if (named === "TOO_SMALL") return tooSmallSentence(context)
    return SENTENCES[named]
  }
  if (apexIsClockRefusal(code)) return SENTENCES.APEX_CLOCK
  // 10002 is "Requires Login : Your API key is wrong" in ApeX's docs. A wrong
  // secret signs a signature ApeX cannot match and a wrong passphrase fails
  // the same check, and ApeX answers all three with this one code.
  if (code === "10002") return SENTENCES.APEX_AUTH
  // Code 3 answered "invalid symbol" on 24 Sep 2026 for a market spelled
  // without its dash on the funding read.
  if (code === "3" || status === 404) return SENTENCES.APEX_NOT_FOUND
  if (status === 500 || status === 503 || code === "10004") return SENTENCES.APEX_SERVER
  return null
}

function balanceSentence(context: ApexRefusalContext): string {
  const { freeUsd, needUsd } = context
  if (typeof freeUsd === "number" && typeof needUsd === "number") {
    return `ApeX Omni says the account has ${formatUsd(freeUsd)} free and this order needs ${formatUsd(needUsd)}. Use a smaller size or free some cash first.`
  }
  return "ApeX Omni says there is not enough free cash for this order. Margin held by resting orders counts against it too. Use a smaller size or free some cash first."
}

function tooSmallSentence(context: ApexRefusalContext): string {
  const { minUsd } = context
  if (typeof minUsd === "number") {
    return `ApeX Omni's smallest order on this market is about ${formatUsd(minUsd)} at today's price. Use a bigger size.`
  }
  return "ApeX Omni says this order is below the market's smallest size. Use a bigger size."
}

/**
 * One ApeX refusal as the error the rest of the app already knows:
 * `LIVE_ORDER_REFUSED:` and a sentence. The caller builds `EXCHANGE_BUSY:`
 * itself, because only it knows how long the hold is.
 */
export function apexRefusalError(
  input: { status: number; code: string; msg?: unknown },
  context: ApexRefusalContext = {}
): Error {
  const msg = typeof input.msg === "string" ? input.msg : ""
  const sentence = sentenceFor(input.status, input.code, msg, context)
  if (sentence) return new Error(`LIVE_ORDER_REFUSED:${sentence}`)
  const safeCode = /^-?\d{1,10}$/.test(input.code) ? input.code : "unknown"
  return new Error(
    `LIVE_ORDER_REFUSED:ApeX Omni refused it (code ${safeCode}). Nothing else is known about why. Check the order on ApeX's own site before trying again.`
  )
}

export function apexRefusalSentence(code: ApexRefusal): string {
  return SENTENCES[code]
}
