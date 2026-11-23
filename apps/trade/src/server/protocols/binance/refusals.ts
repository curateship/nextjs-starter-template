/**
 * Binance's refusal codes, as sentences a person can act on.
 *
 * The codes and their meanings come from Binance's USDⓈ-M futures error-code
 * page, read 24 Sep 2026. Each sentence says what Binance refused and what to
 * do next. A code missing from this list is shown with its number, so a new
 * one is never dressed up as a known one.
 *
 * Every refusal leaves as `LIVE_ORDER_REFUSED:` and a sentence, the prefix the
 * order rails already read as "the exchange looked and took nothing". The
 * code rides along on the error so this folder can still tell an order that
 * is already gone from any other refusal.
 */

const SENTENCES = {
  "-1021":
    "Binance refused the request's time. Trade measured Binance's clock again and sent it once more, and Binance refused that too. Check that this server's clock is set automatically.",
  "-1022":
    "Binance did not accept the signature. Check that the API secret was copied whole from Binance's API Management page.",
  // The spot host's answer to a key Binance never issued, measured
  // 24 Sep 2026 on the key-permission read.
  "-2008":
    "Binance did not recognise this API key. Copy the key again from Binance's API Management page.",
  "-2014":
    "Binance did not recognise this API key. Copy the key again from Binance's API Management page.",
  "-2015":
    "Binance refused this API key. Check that the key has futures trading switched on, and that this server's internet address is on the key's list if the key is restricted to certain addresses.",
  "-1109":
    "Binance says this account is not valid for futures. Open a USDⓈ-M futures account on Binance's own site first.",
  "-2010":
    "Binance rejected the order without saying why. Check the order on Binance's own site before trying again.",
  "-2011": "Binance says this order is no longer open. It may have filled or been cancelled on Binance itself.",
  "-2013": "Binance says this order does not exist. It may have filled or been cancelled on Binance itself.",
  "-2018":
    "Binance says the futures wallet does not hold enough USDT for this. Move USDT into the futures wallet or use a smaller size.",
  "-2019":
    "Binance says there is not enough free margin for this order. Margin held by open positions and resting orders counts against it. Use a smaller size or free some cash first.",
  "-2021":
    "Binance says this stop or target would fire the moment it went on, because the price is already past it. Move it further from the current price.",
  "-2022":
    "Binance refused a reduce-only order because other reduce-only orders already cover the position. Cancel one of them first.",
  "-2024":
    "Binance says the position is smaller than this order would close. Refresh the position and check its size.",
  "-2027":
    "Binance says this would make the position bigger than it allows at this leverage. Use a smaller size or a lower leverage.",
  "-2028":
    "Binance says the account does not hold enough margin for that leverage. Use a lower leverage or add cash first.",
  "-4003": "Binance says the size must be above zero.",
  "-4005": "Binance says the size is bigger than one order may be on this market. Split it into smaller orders.",
  "-1111":
    "Binance says the price or size has more decimal places than this market allows. Refresh the market list and try again.",
  "-4014": "Binance says the price is between its legal steps. Move the price onto the market's tick.",
  "-4016":
    "Binance will not take a buy this far above the mark price. Move the price closer to the market.",
  "-4024":
    "Binance will not take a sell this far below the mark price. Move the price closer to the market.",
  "-4131":
    "Binance says the best price on the other side is outside its allowed band, so the order could not go through safely. Try again in a moment.",
  "-4028": "Binance says that leverage is not allowed on this market. Pick a lower number.",
  "-4046": "Binance is already using that margin mode.",
  "-4047":
    "Binance will not change this market's margin mode while it has resting orders. Cancel them first.",
  "-4048":
    "Binance will not change this market's margin mode while a position is open. Close it first.",
  "-4050":
    "Binance says there is not enough free cross-margin cash for that. Add less, or free cash held elsewhere.",
  "-4051":
    "Binance says the position's isolated margin cannot give back that much. Take out less.",
  "-4061":
    "Binance says the account holds longs and shorts separately (Hedge Mode). Trade works with one direction at a time. Switch Position Mode to One-way on Binance, then try again.",
  "-4087":
    "Binance only lets this account close positions, not open new ones. Binance puts accounts into this mode in countries where it does not offer futures, such as Canada.",
  "-4088": "Binance is not letting this account place orders right now. Check the account on Binance's own site.",
  "-4400":
    "Binance's trading rules have limited this account to closing positions for now. Binance lifts this on its own after a while.",
  "-4401":
    "Binance's risk rules have limited this account to closing positions, because of the size it already holds.",
  "-4402":
    "Binance says futures are not available in this account's region. Trade cannot change that; only an account verified in a country where Binance offers futures can trade here.",
  "-4403": "Binance caps leverage lower in this account's region. Pick a lower number.",
  "-4164":
    "Binance says this order is below the smallest order it takes on this market. Use a bigger size.",
  "-5021": "Binance could not fill the whole order at once, so it rejected it.",
  "-5022":
    "Binance rejected the post-only order because it would have traded straight away. Move the price so it rests on the book.",
  "-4120":
    "Binance says this kind of order must go through its separate stop-order service. That is a fault in Trade rather than in the order, so nothing was placed.",
} as const

type BinanceRefusalCode = keyof typeof SENTENCES

/** The error every Binance refusal is thrown as. */
export class BinanceRefusal extends Error {
  readonly binanceCode: string
  constructor(code: string, sentence: string) {
    super(`LIVE_ORDER_REFUSED:${sentence}`)
    this.binanceCode = code
  }
}

/** True when Binance says the order is already gone: filled or cancelled. */
export function isOrderGone(error: unknown): boolean {
  return (
    error instanceof BinanceRefusal &&
    (error.binanceCode === "-2011" || error.binanceCode === "-2013")
  )
}

/** True when Binance refused the key itself rather than the request. */
export function isKeyRefusal(error: unknown): boolean {
  return (
    error instanceof BinanceRefusal &&
    ["-1022", "-2008", "-2014", "-2015"].includes(error.binanceCode)
  )
}

/** True when Binance refused the request's timestamp before reading it. */
export function isClockRefusal(error: unknown): boolean {
  return error instanceof BinanceRefusal && error.binanceCode === "-1021"
}

export function binanceRefusal(code: string, status: number): BinanceRefusal {
  const known = SENTENCES[code as BinanceRefusalCode]
  if (known) return new BinanceRefusal(code, known)
  if (status === 401) return new BinanceRefusal(code, SENTENCES["-2015"])
  const safeCode = /^-?\d{1,10}$/.test(code) ? code : "unknown"
  return new BinanceRefusal(
    safeCode,
    `Binance refused it (code ${safeCode}). Nothing else is known about why. Check Binance's own site before trying again.`
  )
}
