import type { CandleBar } from "@/lib/protocols/contracts"

/**
 * Finding your place in a run of candles, without walking it.
 *
 * A live pass is handed the few candles since it last looked, so filtering them
 * costs nothing. A replay is handed **the whole history, on every bar**, and the
 * same filter then costs the length of the history — every bar, for every coin.
 * A ten-year test of 250 coins is 21,900 bars each, so one such filter is five
 * billion comparisons, and there are three of them. That is not a slow run; it
 * is the run never finishing, and the server running out of memory on the
 * rubbish it makes on the way.
 *
 * The bars are in time order, so the answer is a binary search. Everything here
 * is that search wearing a name, plus one thing worth remembering: whether the
 * array was in order in the first place.
 */

/**
 * The same bars, oldest first — and the SAME ARRAY when they already were.
 *
 * Returning the identical object matters as much as the sorting does: the
 * memory of what a run of candles means is kept against the array itself, so a
 * fresh copy each time would remember nothing.
 *
 * Checking costs one pass and is done once per array. Sorting was previously
 * done on every look, and the bars have come back in order from the database
 * and from every exchange this app talks to, so it was a copy of the whole
 * history to confirm nothing had changed.
 */
const ordered = new WeakMap<object, readonly CandleBar[]>()

export function ascending(
  bars: readonly CandleBar[]
): readonly CandleBar[] {
  const known = ordered.get(bars)
  if (known) return known

  let sorted = true
  for (let i = 1; i < bars.length; i += 1) {
    if (bars[i].openTime < bars[i - 1].openTime) {
      sorted = false
      break
    }
  }
  const answer = sorted
    ? bars
    : [...bars].sort((left, right) => left.openTime - right.openTime)
  ordered.set(bars, answer)
  // So a second call handed the sorted copy gets there in one step too.
  if (!sorted) ordered.set(answer, answer)
  return answer
}

/**
 * The newest bar that had already FINISHED by this moment, or -1 when none had.
 *
 * A bar still being filled in is left out everywhere in this app: it cannot
 * have confirmed anything, and reading it would let a replay see inside a
 * candle that has not happened yet.
 */
export function lastClosedIndex(
  bars: readonly CandleBar[],
  barMs: number,
  now: number
): number {
  let low = 0
  let high = bars.length - 1
  let answer = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (bars[mid].openTime + barMs <= now) {
      answer = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return answer
}

/**
 * The first bar that OPENED after this moment, or the length when none did.
 *
 * The pair to the one above: together they name the stretch a pass has not read
 * yet, so it walks that and nothing else.
 */
export function firstOpenAtOrAfter(
  bars: readonly CandleBar[],
  at: number
): number {
  return firstOpenAfter(bars, at - 1)
}

export function firstOpenAfter(
  bars: readonly CandleBar[],
  after: number
): number {
  let low = 0
  let high = bars.length - 1
  let answer = bars.length
  while (low <= high) {
    const mid = (low + high) >> 1
    if (bars[mid].openTime > after) {
      answer = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }
  return answer
}
