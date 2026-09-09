import { formatUnits } from "viem"

export const BNB_FEE_RESERVE = 0.005
export type BnbRefusal =
  | "no-route"
  | "unknown-token"
  | "maximum"
  | "malformed"
  | "kyber-busy"
  | "node-busy"
  | "slippage"
  | "approval"
  | "gas"
  | "unsellable"
  | "pending"
  | "replaced"
  | "unknown"
export type BnbRefusalDetail = {
  hash?: string
  replacementHash?: string
  /** Only a confirmed receipt proves a fee was paid. */
  feeWei?: bigint
  approvalFeeWei?: bigint
  pending?: boolean
  approval?: boolean
}

// Only errors created here may carry prose through an outer catch. A provider
// cannot smuggle text through by starting its message with a shared prefix.
class BnbRefusalError extends Error {}
export function bnbRefused(sentence: string, busy = false): Error {
  return new BnbRefusalError(
    `${busy ? "EXCHANGE_BUSY" : "LIVE_ORDER_REFUSED"}:${sentence}`
  )
}
function lookup(hash?: string): string {
  return hash && /^0x[\da-f]{64}$/i.test(hash)
    ? ` Check transaction ${hash} on bscscan.com.`
    : ""
}
export function bnbRefusalSentence(
  code: BnbRefusal,
  detail: BnbRefusalDetail = {}
): string {
  const pending = detail.pending || code === "pending" || code === "replaced"
  if (pending && !["pending", "replaced", "node-busy"].includes(code))
    code = "pending"
  const fee =
    detail.feeWei !== undefined
      ? ` ${formatUnits(detail.feeWei, 18)} BNB was spent on network fees.`
      : pending
        ? " The transaction's fee is not confirmed yet."
        : " No new transaction fee was paid."
  const approvals =
    detail.approvalFeeWei && detail.approvalFeeWei > 0n
      ? ` Confirmed approvals spent ${formatUnits(detail.approvalFeeWei, 18)} BNB separately.`
      : ""
  const movement = pending ? "" : " No swap coins moved."
  let sentence: string
  switch (code) {
    case "no-route":
      sentence =
        "KyberSwap found no pool with enough money for this size. Try a smaller size or a coin that trades more."
      break
    case "unknown-token":
      sentence =
        "KyberSwap does not know this coin. Check its contract address or choose another coin."
      break
    case "maximum":
      sentence =
        "This size is above KyberSwap's maximum. Lower the size and ask for another quote."
      break
    case "malformed":
      sentence =
        "KyberSwap could not read the swap request. Check the coin and size, then request a fresh quote."
      break
    case "kyber-busy":
      sentence =
        "KyberSwap is limiting requests to 30 per 10 seconds. Wait ten seconds and try again."
      break
    case "node-busy":
      sentence =
        "BNB Chain's node is limiting requests. Wait a moment and check again."
      break
    case "slippage":
      sentence =
        'The price moved past "Worst fill allowed %". Request a fresh quote or adjust the allowance.'
      break
    case "approval":
      sentence =
        "The token approval did not take effect after one fresh approval. No swap was sent. Check the approval, then try again."
      break
    case "gas":
      sentence = `The wallet does not have enough BNB for network fees. Send BNB to the wallet address on the card and keep at least ${BNB_FEE_RESERVE} BNB available. Wrapped BNB cannot pay fees.`
      break
    case "unsellable":
      sentence =
        "This coin could not be sold, and GoPlus flags it as a coin that cannot be sold. Check the coin before trying again."
      break
    case "pending":
      sentence = `BNB Chain has not confirmed the ${detail.approval ? "approval" : "transaction"}. Wait and check its status before placing another trade.`
      break
    case "replaced":
      sentence =
        "The node reports a replacement transaction. Check both transactions before placing another trade."
      break
    case "unknown":
      sentence = "BNB Chain refused the trade, and no coins moved. Check the wallet and request a fresh quote."
      break
  }
  return (
    sentence +
    (code === "unknown" ? "" : movement) +
    fee +
    approvals +
    lookup(detail.hash) +
    lookup(detail.replacementHash)
  )
}
export function bnbRefusalError(
  code: BnbRefusal,
  detail: BnbRefusalDetail = {}
): Error {
  const busy =
    detail.pending ||
    ["kyber-busy", "node-busy", "pending", "replaced"].includes(code)
  return new BnbRefusalError(
    `${busy ? "EXCHANGE_BUSY" : "LIVE_ORDER_REFUSED"}:${bnbRefusalSentence(code, detail)}`
  )
}
export function kyberRefusalCode(body: unknown): BnbRefusal | null {
  const code =
    body && typeof body === "object" && "code" in body ? body.code : undefined
  switch (code) {
    case 0:
      return null
    case 4000:
    case 4001:
    case 4002:
      return "malformed"
    case 4008:
    case 4010:
    case 40011:
      return "no-route"
    case 4009:
      return "maximum"
    case 4011:
      return "unknown-token"
    default:
      return "unknown"
  }
}
/** Inspect bounded causes, never return or log upstream text, URLs or data. */
export function bnbNodeRefusalCode(error: unknown): BnbRefusal {
  const seen = new Set<unknown>()
  let current = error
  for (
    let i = 0;
    i < 8 && current && typeof current === "object" && !seen.has(current);
    i++
  ) {
    seen.add(current)
    const e = current as {
      message?: unknown
      shortMessage?: unknown
      status?: unknown
      cause?: unknown
    }
    const words = [e.message, e.shortMessage]
      .filter((s): s is string => typeof s === "string")
      .join(" ")
      .slice(0, 16000)
    if (e.status === 429 || /\b429\b|rate limit|too many requests/i.test(words))
      return "node-busy"
    if (
      /insufficient funds for gas|insufficient funds.*gas \* price/i.test(words)
    )
      return "gas"
    if (
      /return amount is not enough|insufficient[_ ]output[_ ]amount|too little received/i.test(
        words
      )
    )
      return "slippage"
    if (/TRANSFER_FROM_FAILED/.test(words)) return "approval"
    if (
      /transaction.*replaced|replacement transaction underpriced/i.test(words)
    )
      return "replaced"
    if (
      /transaction.*(?:stuck|pending)|receipt.*(?:timed out|timeout)/i.test(
        words
      )
    )
      return "pending"
    current = e.cause
  }
  return "unknown"
}
export function explainBnbError(
  error: unknown,
  detail: BnbRefusalDetail = {}
): Error {
  if (error instanceof BnbRefusalError) {
    if (
      detail.approvalFeeWei &&
      !error.message.includes("Confirmed approvals spent")
    )
      return new BnbRefusalError(
        `${error.message} Confirmed approvals spent ${formatUnits(detail.approvalFeeWei, 18)} BNB separately.`
      )
    return error
  }
  // Exact app-owned validation codes contain no provider text.
  if (
    error instanceof Error &&
    /^(REAL_MONEY_OFF|LIVE_SIZE|LIVE_MARKET|LIVE_WALLET_NOT_FOUND|LIVE_WALLET_ADDRESS|BNB_NETWORK_UNSUPPORTED)$/.test(
      error.message
    )
  )
    return new Error(error.message)
  return bnbRefusalError(bnbNodeRefusalCode(error), detail)
}
