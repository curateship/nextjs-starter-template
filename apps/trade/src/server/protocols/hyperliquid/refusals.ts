import { scrubSecrets } from "@/server/protocols/scrub"

const SENTENCES = {
  HYPERLIQUID_ORDER_TOO_SMALL:
    "Hyperliquid says this order is below its $10 minimum. Increase the order to at least $10.",
  HYPERLIQUID_MARGIN:
    "Hyperliquid says there is not enough free cash for this order. Reduce the order or free cash held by other positions and orders.",
  HYPERLIQUID_POST_ONLY:
    "Hyperliquid says this post-only order would trade straight away. Move it behind the current best price and try again.",
  HYPERLIQUID_REDUCE_ONLY:
    "Hyperliquid says this reduce-only order would add to the position. Check the side and size, then try again.",
  HYPERLIQUID_ORDER_GONE:
    "Hyperliquid says this order is no longer open. Refresh the account before trying another change.",
  HYPERLIQUID_BUSY:
    "Hyperliquid is asking Trade to slow down. Wait for the hold shown by the exchange before trying again.",
} as const

export type HyperliquidRefusal = keyof typeof SENTENCES

const MATCHES: Array<{ code: HyperliquidRefusal; match: RegExp }> = [
  { code: "HYPERLIQUID_ORDER_TOO_SMALL", match: /minimum value of \$10/i },
  { code: "HYPERLIQUID_MARGIN", match: /insufficient margin/i },
  {
    code: "HYPERLIQUID_POST_ONLY",
    match: /post only order would have immediately matched/i,
  },
  {
    code: "HYPERLIQUID_REDUCE_ONLY",
    match: /reduce only order would (?:increase|add to)/i,
  },
  {
    code: "HYPERLIQUID_ORDER_GONE",
    match: /order was never placed, already canceled, or filled/i,
  },
  { code: "HYPERLIQUID_BUSY", match: /429|too many requests/i },
]

export function hyperliquidRefusalCode(
  reason: string
): HyperliquidRefusal | null {
  return MATCHES.find((one) => one.match.test(reason))?.code ?? null
}

export function hyperliquidRefusalError(reason: string): Error {
  const safeReason = scrubSecrets(reason)
  const code = hyperliquidRefusalCode(safeReason)
  if (code) return new Error(SENTENCES[code])
  return new Error(
    `Hyperliquid refused the request for a reason Trade does not recognize: ${safeReason}. Check Hyperliquid's status before trying again.`
  )
}

export function hyperliquidRefusalSentence(code: HyperliquidRefusal): string {
  return SENTENCES[code]
}
