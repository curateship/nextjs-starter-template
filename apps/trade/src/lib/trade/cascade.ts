import { z } from "zod"

import type { CandleBar } from "@/lib/protocols/contracts"

/**
 * "The whole market just fell off a cliff" — and what a ladder does about it.
 *
 * **The problem this exists for.** A DCA ladder set to sell at the previous
 * rung does the wrong thing in a crash, and does it worst exactly where it has
 * the most money. The ladder doubles its size at every step, so the deepest
 * rung is the biggest bet of the whole trade — and "sell at the previous rung"
 * hands that biggest bet the *smallest* bounce. On 10 October 2025 the deepest
 * rungs across 137 coins cost $15,702 and sold for $21,843. Left alone for a
 * few hours the same coins were worth about $36,000.
 *
 * **Why it is safe to hold, and only here.** Ten unrelated coins cannot
 * genuinely become worth 70% less within the same few minutes — there is no
 * news that does that. A fall of that shape is forced selling into an order
 * book with nothing left in it, which is plumbing rather than an opinion about
 * what anything is worth, and plumbing refills. That is the whole argument,
 * and it only covers a fall that is BOTH very deep AND across many coins at
 * once. One coin at −50% is an ordinary bad day and must keep selling as it
 * always has.
 *
 * **Where the numbers came from.** Every USDT perpetual Binance has ever
 * listed, daily candles back to September 2019, gave 15 days on which eight or
 * more coins fell 35% or more. Only two of them were the shape described
 * above:
 *
 * - 10 Oct 2025 — 23 of 25 coins fell 50%+ within four hours
 * - 19 May 2021 — 19 of 25
 *
 * On the other thirteen days, across every coin checked, the count was **zero
 * or one**. So the defaults below are not fitted to anything: any threshold in
 * a very wide band separates the two from the thirteen identically.
 *
 * The four-hour window is measured rather than chosen. October's fall took
 * eight minutes, but May 2021's was slower — only 7 of 25 coins cleared 50%
 * within an hour, against 19 within four. An hour would have half-missed it.
 *
 * **What it is honestly worth.** Two events. The reason to believe it is the
 * mechanism, not the count, and the mechanism only covers the snap-back — it
 * says nothing about holding for a day and hoping. That is why `holdHours`
 * exists and is deliberately short: it buys enough time to read the news and
 * decide, rather than betting the market recovers.
 */

/** Off by default everywhere. A ladder that has not asked for this is unchanged. */
export const cascadeSchema = z.object({
  /**
   * How far a coin must fall, from any high to a later low, to be counted.
   *
   * 50 is a long way outside anything ordinary: on the thirteen non-cascade
   * days in six years, at most one coin ever reached it inside the window.
   */
  fallPct: z.number().min(20).max(95).default(50),
  /**
   * The stretch that fall has to happen inside.
   *
   * Four hours because 19 May 2021 needed it — see the note above. Shorter
   * catches October and half-misses May.
   */
  withinHours: z.number().min(0.25).max(24).default(4),
  /**
   * How many coins have to be doing it at once.
   *
   * This is the load-bearing half of the rule. Depth alone is one coin having
   * a catastrophe; depth across many coins at the same moment is the order
   * book emptying, and only the second one reliably comes back.
   */
  minCoins: z.number().int().min(2).max(500).default(10),
  /**
   * How long the ladder holds before going back to selling normally.
   *
   * Not "how long until it bounces". It is how long you have to look at the
   * news and decide, and the default is short on purpose: the argument for
   * holding is that the book emptied, and a book refills in minutes to hours.
   * Past that the ladder is no longer riding a mechanism, it is betting the
   * market recovers — which is a different trade with nothing underneath it,
   * and is exactly the case that loses if the crash turns out to be real.
   */
  holdHours: z.number().min(0.25).max(720).default(4),
})

export type CascadeSettings = z.infer<typeof cascadeSchema>

export function defaultCascade(): CascadeSettings {
  return { fallPct: 50, withinHours: 4, minCoins: 10, holdHours: 4 }
}

/**
 * The worst fall from a high to a LATER low anywhere inside these bars.
 *
 * Deliberately not "first open against lowest low": a coin that drifted down
 * for three hours and then fell 20% is not the same event as one that dropped
 * 50% in eight minutes, and measuring from the start of the window would score
 * them the same. High-to-a-later-low only ever describes an actual fall.
 */
export function worstFallIn(bars: readonly CandleBar[]): number {
  let worst = 0
  for (let j = 0; j < bars.length; j += 1) {
    const low = bars[j].low
    if (!(low > 0)) continue

    // The highest price this bar could have fallen FROM.
    //
    // Its own OPEN rather than its own high, and this is the whole subtlety: a
    // bar only tells you four numbers, never the order they happened in. Using
    // a bar's own high against its own low means a coin that DOUBLED inside one
    // candle reads as a 50% crash — and on a 4h replay, where a whole crash
    // fits inside one bar, that would have fired the rule on a market-wide
    // rally. The open is where price actually was when the bar began, so
    // open-to-low is a fall that definitely happened.
    //
    // Earlier bars are different: they finished, so their high is a real price
    // that really did come before this low.
    let from = bars[j].open
    for (let i = 0; i < j; i += 1) {
      if (bars[i].high > from) from = bars[i].high
    }
    if (!(from > 0)) continue

    const fall = 1 - low / from
    if (fall > worst) worst = fall
  }
  return worst
}

/**
 * The bars whose open falls in `[from, to]`, found by binary search.
 *
 * Bars are always oldest-first, which is what makes this safe. It exists for
 * speed alone — see the note where it is called.
 */
function barsBetween(
  bars: readonly CandleBar[],
  from: number,
  to: number
): readonly CandleBar[] {
  let low = 0
  let high = bars.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (bars[mid].openTime < from) low = mid + 1
    else high = mid
  }
  let end = low
  while (end < bars.length && bars[end].openTime <= to) end += 1
  return low === 0 && end === bars.length ? bars : bars.slice(low, end)
}

/**
 * Is the market falling off a cliff right now?
 *
 * Answers from candles alone so the replay and the live engine can ask the
 * same question of the same code — the whole reason this is not written twice.
 *
 * `now` is the moment being judged and the window looks BACKWARDS from it.
 * Bars stamped later than `now` are ignored rather than trusted, because a
 * replay holds every bar of the run in memory and reading one that has not
 * happened yet would let the rule see the future.
 */
export function marketIsCascading(input: {
  settings: CascadeSettings
  /** Every coin the run is watching, and its candles. */
  coins: ReadonlyMap<string, readonly CandleBar[]>
  now: number
}): boolean {
  const { settings, coins, now } = input
  const from = now - settings.withinHours * 3_600_000
  const need = settings.fallPct / 100
  let falling = 0

  for (const bars of coins.values()) {
    // Binary search rather than a filter over the whole feed. This is asked
    // once per bar for every coin, and a two-year run of 170 coins holds about
    // 4,400 bars each — filtering all of them every time is 3 billion
    // comparisons across a run, which is the difference between a backtest
    // that finishes and one that appears to hang.
    const window = barsBetween(bars, from, now)
    if (window.length === 0) continue
    if (worstFallIn(window) >= need) {
      falling += 1
      // Nothing below changes once the count is reached, and a run watching
      // 400 coins asks this on every bar.
      if (falling >= settings.minCoins) return true
    }
  }
  return false
}

/**
 * When the hold ends, given a cascade seen at `seenAt`.
 *
 * Its own function so the replay and the live engine cannot drift on the one
 * arithmetic that decides how long real money sits in an open position.
 */
export function holdUntil(settings: CascadeSettings, seenAt: number): number {
  return seenAt + settings.holdHours * 3_600_000
}
