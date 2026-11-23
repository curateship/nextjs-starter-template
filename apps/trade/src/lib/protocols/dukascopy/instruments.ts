import type { CandleInterval } from "@/lib/protocols/contracts"
import {
  DUKASCOPY_INSTRUMENTS,
  type DukascopyInstrument,
} from "@/lib/protocols/dukascopy/instruments.generated"
import {
  COINS_THAT_SPELL_A_US_STOCK,
  DUKASCOPY_ALIASES,
  usStockInstrumentId,
} from "@/lib/protocols/dukascopy/naming"

/**
 * Which venue names land on which Dukascopy instrument, and when each
 * instrument's history starts.
 *
 * Read from the generated table rather than from the package at runtime: the
 * package's list is a build-time fact, and the fence keeps the package itself
 * inside `server/protocols/dukascopy/`.
 */

/** The instrument a venue's name for a stock, metal, index or pair means. */
export function dukascopyInstrumentFor(
  venueName: string,
  /** True when the venue said this is not a coin, so a coin's letters are not a worry. */
  knownNotACoin: boolean
): string | null {
  const alias = DUKASCOPY_ALIASES[venueName]
  if (alias) return alias
  if (!knownNotACoin && COINS_THAT_SPELL_A_US_STOCK.has(venueName)) return null
  if (!/^[A-Za-z0-9]+$/.test(venueName)) return null
  const stock = usStockInstrumentId(venueName)
  return stock in DUKASCOPY_INSTRUMENTS ? stock : null
}

/** Every instrument this app can map a venue market to, sorted by id. */
export function listDukascopyInstruments(): Array<
  { id: string } & DukascopyInstrument
> {
  return Object.entries(DUKASCOPY_INSTRUMENTS)
    .map(([id, instrument]) => ({ id, ...instrument }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * The first day Dukascopy has bars of this size for, in epoch milliseconds.
 *
 * Daily candles often reach much further back than the minutes: the S&P 500
 * has daily bars from 1980 and minutes from 2011. Null for an id the table
 * does not hold.
 */
export function dukascopyFirstBar(
  instrumentId: string,
  interval: CandleInterval
): number | null {
  const instrument = DUKASCOPY_INSTRUMENTS[instrumentId]
  if (!instrument) return null
  return interval === "1d" ? instrument.firstDailyBar : instrument.firstBar
}
