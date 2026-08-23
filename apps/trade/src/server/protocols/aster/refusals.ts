const SENTENCES = {
  ASTER_AUTH:
    "Aster did not accept this API wallet. Make a new Pro API wallet on Aster's key page and check that it can read this account.",
  ASTER_CLOCK:
    "Aster says the request time is outside its allowed window. Trade will measure Aster's clock again before the next request.",
  EXCHANGE_BUSY:
    "Aster is asking Trade to slow down. Trade has paused Aster requests and will try again after the hold.",
  ASTER_IP_BANNED:
    "Aster has blocked this internet address. Trade has stopped asking and will not retry until the app restarts.",
  ASTER_ORDER_TOO_SMALL:
    "Aster says this order is too small. Increase its dollar value to the minimum shown for this market.",
  ASTER_PRICE_STEP:
    "Aster says this price is between its legal steps. Move the price to the market's stated tick.",
  ASTER_LEVERAGE_OPEN_POSITION:
    "Aster will not lower isolated leverage while this position is open. Close the position or keep its current leverage.",
  ASTER_ISOLATED_MULTI_ASSET:
    "Aster cannot use isolated margin while the futures account is in Multi-Assets Mode. Change the Aster futures account to Single-Asset Mode, then this order will try again.",
  ASTER_ORDER_GONE:
    "Aster says this order is no longer open. Refresh the account before trying another change.",
  ASTER_MARGIN_UNCHANGED: "Aster is already using that margin mode.",
  ASTER_MARGIN_OPEN:
    "Aster will not change this market's margin mode while it has an open position or order. Close or cancel it first.",
} as const

export type AsterRefusal = keyof typeof SENTENCES

export function asterRefusalCode(
  status: number,
  code: string
): AsterRefusal | null {
  if (status === 418) return "ASTER_IP_BANNED"
  if (status === 429 || code === "-1003" || code === "-1015")
    return "EXCHANGE_BUSY"
  if (status === 401 || ["-1022", "-2014", "-2015"].includes(code))
    return "ASTER_AUTH"
  if (code === "-1021") return "ASTER_CLOCK"
  if (code === "-4164") return "ASTER_ORDER_TOO_SMALL"
  if (code === "-1111" || code === "-4014") return "ASTER_PRICE_STEP"
  if (code === "-4161") return "ASTER_LEVERAGE_OPEN_POSITION"
  if (code === "-4168") return "ASTER_ISOLATED_MULTI_ASSET"
  if (code === "-2013") return "ASTER_ORDER_GONE"
  if (code === "-4046") return "ASTER_MARGIN_UNCHANGED"
  if (code === "-4047" || code === "-4048") return "ASTER_MARGIN_OPEN"
  return null
}

export function asterRefusalError(input: {
  status: number
  code: string
  message?: unknown
}): Error {
  const named = asterRefusalCode(input.status, input.code)
  if (named) return new Error(`${named}:${SENTENCES[named]}`)
  const safeCode = /^-?\d{1,10}$/.test(input.code) ? input.code : "unknown"
  return new Error(
    `ASTER_REFUSED:Aster refused the request for a reason Trade does not recognize (code ${safeCode}). Check Aster's status before trying again.`
  )
}

export function asterRefusalSentence(code: AsterRefusal): string {
  return SENTENCES[code]
}
