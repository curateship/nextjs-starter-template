import { scrubSecrets } from "@/server/protocols/scrub"

const SENTENCES = {
  KUCOIN_ORDER_TOO_SMALL:
    "KuCoin says this order is below the market's minimum size. Increase it to at least the minimum shown for this market.",
  KUCOIN_SIZE_STEP:
    "KuCoin says this size is between its legal contract steps. Change it to a whole contract amount for this market.",
  KUCOIN_PRICE_STEP:
    "KuCoin says this price is between its legal steps. Move the price to the market's stated tick.",
  KUCOIN_MARGIN:
    "KuCoin says there is not enough free cash for this order. Reduce the order or free cash held by other positions and orders.",
  KUCOIN_BUSY:
    "KuCoin is asking Trade to slow down. Wait for the hold shown by KuCoin before trying again.",
  KUCOIN_POSITION_GONE:
    "KuCoin says there is no open position to close. Refresh the account before trying again.",
  KUCOIN_MARGIN_MODE:
    "KuCoin says this order uses the wrong margin mode. Switch the wallet to the mode KuCoin asks for, then try again.",
  KUCOIN_PRICE_RANGE:
    "KuCoin says this price is outside the range allowed for the market. Move it inside the current allowed range and try again.",
  KUCOIN_RISK_LIMIT:
    "KuCoin says this order would exceed the market's risk limit. Reduce the size or leverage, then try again.",
  KUCOIN_ISOLATED_LEVERAGE:
    "KuCoin only changes leverage on a market using cross margin. This position is isolated, so keep its current leverage or close it and open it again with the leverage you want.",
  KUCOIN_MARGIN_CROSS:
    "KuCoin only lets Trade add margin to an isolated position. This position uses cross margin, where the account balance already stands behind it.",
} as const

export type KucoinRefusal = keyof typeof SENTENCES

function kucoinCode(reason: string): string {
  return reason.match(/^KUCOIN_([^:]+)/i)?.[1] ?? ""
}

export function kucoinRefusalCode(reason: string): KucoinRefusal | null {
  if (reason.startsWith("KUCOIN_ISOLATED_LEVERAGE"))
    return "KUCOIN_ISOLATED_LEVERAGE"
  if (reason.startsWith("KUCOIN_MARGIN_CROSS")) return "KUCOIN_MARGIN_CROSS"
  const code = kucoinCode(reason)
  if (["106164", "106166"].includes(code)) return "KUCOIN_ORDER_TOO_SMALL"
  if (
    code === "106169" ||
    (/price/i.test(reason) && /step|tick|increment/i.test(reason))
  )
    return "KUCOIN_PRICE_STEP"
  if (
    code === "106168" ||
    (/size|quantity|lot/i.test(reason) && /step|invalid/i.test(reason))
  )
    return "KUCOIN_SIZE_STEP"
  if (["200005", "300003", "106150", "301130"].includes(code))
    return "KUCOIN_MARGIN"
  if (["1015", "200002", "429000", "429001", "429002"].includes(code))
    return "KUCOIN_BUSY"
  if (code === "300009") return "KUCOIN_POSITION_GONE"
  if (["330005", "401110"].includes(code)) return "KUCOIN_MARGIN_MODE"
  if (["300011", "300012", "106170", "106171"].includes(code))
    return "KUCOIN_PRICE_RANGE"
  if (["300005", "106174"].includes(code)) return "KUCOIN_RISK_LIMIT"
  return null
}

export function kucoinRefusalError(reason: string): Error {
  const safeReason = scrubSecrets(reason)
  const code = kucoinRefusalCode(safeReason)
  if (code) return new Error(SENTENCES[code])
  const exchangeCode = kucoinCode(safeReason) || "unknown"
  return new Error(
    `KuCoin refused the request for a reason Trade does not recognize (code ${exchangeCode}): ${safeReason}. Check KuCoin's status before trying again.`
  )
}

export function kucoinRefusalSentence(code: KucoinRefusal): string {
  return SENTENCES[code]
}
