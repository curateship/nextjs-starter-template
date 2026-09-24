import { formatUnits } from "viem"

export type EvmRefusal =
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
  | "history"
  | "unknown"
export type EvmRefusalDetail = {
  hash?: string
  replacementHash?: string
  /** Only a confirmed receipt proves a fee was paid. */
  feeWei?: bigint
  approvalFeeWei?: bigint
  pending?: boolean
  approval?: boolean
  /** The router a no-route or bad-request refusal came from. KyberSwap unless named. */
  router?: string
  /**
   * This was a history read, not a transaction.
   *
   * It is about every swap the wallet has ever made, so it cannot say what
   * one transaction moved or paid. Saying "the fee is not confirmed yet" here
   * sent the reader looking for a stuck swap that was never there.
   */
  history?: boolean
}

/** What a chain's refusals name. Everything else in a sentence is shared. */
type EvmChainWords = {
  /** The chain's printed name, as in "<chain> refused the trade". */
  chain: string
  /** The coin that pays network fees, 18 decimals on every chain here. */
  feeCoin: string
  /** Fee coin a wallet should keep, in whole coins. */
  feeReserve: number
  /** The block explorer a transaction hash can be checked on. */
  explorer: string
  /** What to do when the chain's node will not answer a history read. */
  historyHelp: string
  /** The chain's own code for a practice network it does not serve. */
  unsupportedNetwork: string
}

// Only errors created here may carry prose through an outer catch. A provider
// cannot smuggle text through by starting its message with a shared prefix.
class EvmRefusalError extends Error {
  /** Which refusal this is, where one was named. */
  readonly code?: EvmRefusal
  constructor(message: string, code?: EvmRefusal) {
    super(message)
    this.code = code
  }
}

export function evmRefused(sentence: string, busy = false): Error {
  return new EvmRefusalError(
    `${busy ? "EXCHANGE_BUSY" : "LIVE_ORDER_REFUSED"}:${sentence}`
  )
}

/** The words a node uses when a log request is past what it will serve. */
export function logsBeyondNode(error: unknown): boolean {
  const words = [
    (error as { message?: unknown })?.message,
    (error as { shortMessage?: unknown })?.shortMessage,
    (error as { details?: unknown })?.details,
  ]
    .filter((one): one is string => typeof one === "string")
    .join(" ")
    .slice(0, 16_000)
  return /limit exceeded|exceed maximum block range|block range|query returned more than|not supported|requires a personal token|archive/i.test(
    words
  )
}

export function kyberRefusalCode(body: unknown): EvmRefusal | null {
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
export function nodeRefusalCode(error: unknown): EvmRefusal {
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

/** One chain's refusals, in sentences that name its coin and explorer. */
export function evmRefusals(words: EvmChainWords) {
  const { chain, feeCoin, feeReserve, explorer } = words

  function lookup(hash?: string): string {
    return hash && /^0x[\da-f]{64}$/i.test(hash)
      ? ` Check transaction ${hash} on ${explorer}.`
      : ""
  }

  function sentence(code: EvmRefusal, detail: EvmRefusalDetail = {}): string {
    const pending = detail.pending || code === "pending" || code === "replaced"
    if (pending && !["pending", "replaced", "node-busy"].includes(code))
      code = "pending"
    const reading = detail.history === true || code === "history"
    const fee = reading
      ? ""
      : detail.feeWei !== undefined
        ? ` ${formatUnits(detail.feeWei, 18)} ${feeCoin} was spent on network fees.`
        : pending
          ? " The transaction's fee is not confirmed yet."
          : " No new transaction fee was paid."
    const approvals =
      detail.approvalFeeWei && detail.approvalFeeWei > 0n
        ? ` Confirmed approvals spent ${formatUnits(detail.approvalFeeWei, 18)} ${feeCoin} separately.`
        : ""
    const movement = pending || reading ? "" : " No swap coins moved."
    let said: string
    switch (code) {
      case "no-route":
        said =
          `${detail.router ?? "KyberSwap"} found no pool with enough money for this size. Try a smaller size or a coin that trades more.`
        break
      case "unknown-token":
        said =
          `${detail.router ?? "KyberSwap"} does not know this coin. Check its contract address or choose another coin.`
        break
      case "maximum":
        said =
          `This size is above ${detail.router ?? "KyberSwap"}'s maximum. Lower the size and ask for another quote.`
        break
      case "malformed":
        said =
          `${detail.router ?? "KyberSwap"} could not read the swap request. Check the coin and size, then request a fresh quote.`
        break
      case "kyber-busy":
        said =
          "KyberSwap is limiting requests to 30 per 10 seconds. Wait ten seconds and try again."
        break
      case "node-busy":
        said = `${chain}'s node is limiting requests. Wait a moment and check again.`
        break
      case "slippage":
        said =
          'The price moved past "Worst fill allowed %". Request a fresh quote or adjust the allowance.'
        break
      case "approval":
        said =
          "The token approval did not take effect after one fresh approval. No swap was sent. Check the approval, then try again."
        break
      case "gas":
        said = `The wallet does not have enough ${feeCoin} for network fees. Send ${feeCoin} to the wallet address on the card and keep at least ${feeReserve} ${feeCoin} available. Wrapped ${feeCoin} cannot pay fees.`
        break
      case "unsellable":
        said =
          "This coin could not be sold, and GoPlus flags it as a coin that cannot be sold. Check the coin before trying again."
        break
      case "pending":
        said = `${chain} has not confirmed the ${detail.approval ? "approval" : "transaction"}. Wait and check its status before placing another trade.`
        break
      case "replaced":
        said =
          "The node reports a replacement transaction. Check both transactions before placing another trade."
        break
      case "history":
        said = `This ${chain} node will not answer a trade history request, so new swaps cannot reach the Journal. ${words.historyHelp}`
        break
      case "unknown":
        said = reading
          ? `${chain}'s node did not answer a trade history request. The Journal catches up on the next read.`
          : `${chain} refused the trade, and no coins moved. Check the wallet and request a fresh quote.`
        break
    }
    return (
      said +
      (code === "unknown" ? "" : movement) +
      fee +
      approvals +
      lookup(detail.hash) +
      lookup(detail.replacementHash)
    )
  }

  function error(code: EvmRefusal, detail: EvmRefusalDetail = {}): Error {
    // A history read can never refuse an order, so nothing it says is allowed
    // to reach the app wearing a refused order's prefix.
    const busy =
      detail.pending ||
      detail.history === true ||
      ["kyber-busy", "node-busy", "pending", "replaced", "history"].includes(
        code
      )
    return new EvmRefusalError(
      `${busy ? "EXCHANGE_BUSY" : "LIVE_ORDER_REFUSED"}:${sentence(code, detail)}`,
      code
    )
  }

  /**
   * What went wrong reading a wallet's history, in words about the READ.
   *
   * A node that will not answer has not lost a transaction, and the sweep runs
   * every couple of minutes whether or not a swap was ever sent. Reporting it
   * as "<chain> has not confirmed the transaction" sent the reader hunting for
   * a stuck swap on 20 Sep 2026. The node simply did not serve logs.
   */
  function historyError(cause: unknown): Error {
    if (cause instanceof EvmRefusalError && cause.code === "history")
      return cause
    if (logsBeyondNode(cause)) return error("history")
    // A refusal raised before a swap was signed says "no coins moved", which
    // is a sentence about one transaction. A history read is about every swap
    // the wallet ever made, so its prose is never reused here.
    const code =
      cause instanceof EvmRefusalError ? "unknown" : nodeRefusalCode(cause)
    return error(code, { history: true })
  }

  // Exact app-owned validation codes contain no provider text.
  const appCodes = new RegExp(
    `^(LIVE_MAINNET_OFF|LIVE_SIZE|LIVE_MARKET|LIVE_WALLET_NOT_FOUND|LIVE_WALLET_ADDRESS|${words.unsupportedNetwork})$`
  )

  function explain(cause: unknown, detail: EvmRefusalDetail = {}): Error {
    if (cause instanceof EvmRefusalError) {
      if (
        detail.approvalFeeWei &&
        !cause.message.includes("Confirmed approvals spent")
      )
        return new EvmRefusalError(
          `${cause.message} Confirmed approvals spent ${formatUnits(detail.approvalFeeWei, 18)} ${feeCoin} separately.`
        )
      return cause
    }
    if (cause instanceof Error && appCodes.test(cause.message))
      return new Error(cause.message)
    return error(nodeRefusalCode(cause), detail)
  }

  return { sentence, error, historyError, explain }
}

export type EvmRefusals = ReturnType<typeof evmRefusals>
