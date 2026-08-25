import { scrubSecrets } from "@/server/protocols/scrub"

const SENTENCES = {
  PHEMEX_OPEN_INTEREST:
    "Phemex is full on this market. Its open interest is at the exchange's cap, so wait for space to clear or place an order that will CLOSE a position.",
  PHEMEX_POSITION_MODE:
    "Phemex says this account is in hedged position mode. Switch the market to one-way mode, then try the order again.",
  PHEMEX_LEVERAGE:
    "Phemex refused the leverage on this order. Use a leverage the market allows and keep both sides of the account on the same setting.",
  PHEMEX_MARGIN_BALANCE:
    "Phemex says there is not enough free cash for that change. Add less margin or use a higher leverage.",
  PHEMEX_MARGIN_POSITION_GONE:
    "Phemex says this position is no longer open. Refresh the account before changing its margin.",
  PHEMEX_MARGIN_CROSS:
    "Phemex does not let one position's margin change while that market uses cross margin. The account balance already stands behind it.",
  PHEMEX_MARGIN_TOO_MUCH:
    "Phemex says that would take too much margin out of the position. Take out less and leave enough cash to keep it open.",
  PHEMEX_TRIGGER_SIDE:
    "Phemex says this stop is already on the side that would fire. Move the stop past the current price, then try again.",
  PHEMEX_ORDER_GONE:
    "Phemex says this order is no longer open. Refresh the account before trying another change.",
  PHEMEX_AUTH:
    "Phemex did not accept this API wallet. Check the key, its permissions, and its allowed internet addresses.",
  PHEMEX_BUSY:
    "Phemex is asking Trade to slow down. Wait for the hold before trying again.",
  PHEMEX_UNAVAILABLE:
    "Phemex could not handle the request. Check Phemex's status before trying again.",
} as const

export type PhemexRefusal = keyof typeof SENTENCES

export function phemexRefusalCode(reason: string): PhemexRefusal | null {
  if (/\b11150\b|TE_OI_LIMIT_REDUCE_ONLY/i.test(reason))
    return "PHEMEX_OPEN_INTEREST"
  if (/\b20004\b|TE_ERR_INCONSISTENT_POS_MODE/i.test(reason))
    return "PHEMEX_POSITION_MODE"
  if (
    /(?:^|\D)(?:11004|39108)(?:\D|$)|invalid leverages|longLeverageRr/i.test(
      reason
    )
  )
    return "PHEMEX_LEVERAGE"
  if (
    /(?:^|\D)11005(?:\D|$)|TE_NO_ENOUGH_BALANCE_FOR_NEW_LEVERAGE/i.test(reason)
  )
    return "PHEMEX_MARGIN_BALANCE"
  if (
    /(?:^|\D)11006(?:\D|$)|TE_CANNOT_CHANGE_POSITION_MARGIN_WITHOUT_POSITION/i.test(
      reason
    )
  )
    return "PHEMEX_MARGIN_POSITION_GONE"
  if (
    /(?:^|\D)11007(?:\D|$)|TE_CANNOT_CHANGE_POSITION_MARGIN_FOR_CROSS_MARGIN/i.test(
      reason
    )
  )
    return "PHEMEX_MARGIN_CROSS"
  if (/(?:^|\D)1100[89](?:\D|$)|TE_CANNOT_REMOVE_POSITION_MARGIN/i.test(reason))
    return "PHEMEX_MARGIN_TOO_MUCH"
  if (/\b11043\b|TE_RISING_TRIGGER_DIRECTLY/i.test(reason))
    return "PHEMEX_TRIGGER_SIDE"
  if (/\b10002\b|OM_ORDER_NOT_FOUND/i.test(reason)) return "PHEMEX_ORDER_GONE"
  if (/PHEMEX_AUTH|PHEMEX_HTTP_40[13]/i.test(reason)) return "PHEMEX_AUTH"
  if (/EXCHANGE_BUSY|PHEMEX_HTTP_429/i.test(reason)) return "PHEMEX_BUSY"
  if (/PHEMEX_HTTP_5\d\d/i.test(reason)) return "PHEMEX_UNAVAILABLE"
  return null
}

export function phemexRefusalError(reason: string): Error {
  const safeReason = scrubSecrets(reason)
  const code = phemexRefusalCode(safeReason)
  if (code) return new Error(SENTENCES[code])
  return new Error(
    `Phemex refused the request for a reason Trade does not recognize: ${safeReason}. Check Phemex's status before trying again.`
  )
}

export function phemexRefusalSentence(code: PhemexRefusal): string {
  return SENTENCES[code]
}
