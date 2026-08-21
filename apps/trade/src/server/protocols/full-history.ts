import type { CandleBar } from "@/lib/protocols/contracts"

/**
 * The mechanics behind `@/lib/trade/chart-history`: how a full history is
 * gathered, and how long it is kept once it has been.
 *
 * Which timeframes load in full, and how far back anything may ever reach,
 * are decided there rather than here — the browser has to make the same calls
 * when it asks, so both sides read one file.
 */

/**
 * How many pages of history are asked for at once.
 *
 * **Asking one at a time was the whole of the slowness.** KuCoin hands over
 * two hundred bars a page, so three years of four-hour bars is thirty-five
 * round trips end to end — six and a half seconds of a blank chart. Six at a
 * time turns the same thirty-five requests into six waits: measured at 1.5
 * seconds on KuCoin and 2.2 on Phemex, with no exchange asking us to slow
 * down at that rate.
 *
 * Six rather than everything at once on purpose. A hundred requests in one
 * breath is exactly what a rate limit is for, and being rationed costs the
 * whole exchange twenty seconds — far worse than the second it would save.
 */
export const PAGES_AT_ONCE = 6

/**
 * How many page reads are in flight across the WHOLE process, not per call.
 *
 * **Per call was not enough.** A backtest loads six coins at once, each
 * needing two stretches of history, and each of those fanning out six pages —
 * seventy-two requests in one breath. KuCoin rationed us within seconds, and
 * because a rationed read refuses instantly, every coin in the run failed at
 * once. A 426-coin run died three times over in four minutes on 20 Aug 2026.
 *
 * One gate for everything means a lone chart still gets all six slots, and a
 * bulk run shares the same six rather than multiplying them.
 */
let inFlight = 0
const waiting: (() => void)[] = []

async function takeSlot(): Promise<void> {
  if (inFlight < PAGES_AT_ONCE) {
    inFlight += 1
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
  inFlight += 1
}

function freeSlot(): void {
  inFlight -= 1
  const next = waiting.shift()
  if (next) next()
}

/** Runs the pages a few at a time, keeping the order they were asked in. */
export async function inBatches<T>(
  jobs: readonly (() => Promise<T>)[]
): Promise<T[]> {
  return await Promise.all(
    jobs.map(async (job) => {
      await takeSlot()
      try {
        return await job()
      } finally {
        freeSlot()
      }
    })
  )
}

/** How long a full history stands in for the next request for the same one. */
const HELD_MS = 60_000

const held = new Map<string, { at: number; load: Promise<CandleBar[]> }>()

/**
 * Holds a full history for a minute, because it is not free: the exchanges
 * that page hand it over in ten to thirty-five requests, four to seven
 * seconds. What it holds cannot go stale in any way that shows — a four-hour
 * bar is four hours old before it changes, and the live price paints on top
 * of the forming one either way.
 *
 * A failed load is dropped rather than remembered, so the next look tries the
 * exchange again instead of repeating the failure for a minute.
 */
export async function heldHistory(
  key: string,
  load: () => Promise<CandleBar[]>
): Promise<CandleBar[]> {
  const standing = held.get(key)
  if (standing && Date.now() - standing.at < HELD_MS) return standing.load

  const fresh = load()
  held.set(key, { at: Date.now(), load: fresh })
  fresh.catch(() => {
    if (held.get(key)?.load === fresh) held.delete(key)
  })

  // Swept rather than left to grow for the life of the process.
  if (held.size > 500) {
    const cutoff = Date.now() - HELD_MS
    for (const [old, entry] of held) {
      if (entry.at < cutoff) held.delete(old)
    }
  }
  return fresh
}

/** Tests drive their own time; a held history across them would leak. */
export function clearHeldHistory(): void {
  held.clear()
}
