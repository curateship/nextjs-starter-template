/**
 * Which plates go on each side of the bar, and the warm-up sets before a heavy
 * one. Nobody should be doing sums with a loaded bar in front of them.
 */

type PlateLoad = {
  /** Plates for one side, heaviest first. */
  perSide: number[]
  /** What the bar weighs once loaded with them. */
  loadedKg: number
  /** True when the plates on hand cannot make the asked weight exactly. */
  short: boolean
}

/**
 * The plates for one side of the bar. 100 kg on a 20 kg bar is 40 kg a side:
 * 25 + 15. With plates missing, it loads the nearest weight under the target
 * and says so.
 */
export function platesFor(
  targetKg: number,
  barKg: number,
  platesKg: readonly number[]
): PlateLoad {
  const sorted = [...platesKg].filter((plate) => plate > 0).sort((a, b) => b - a)
  let perSideLeft = (targetKg - barKg) / 2
  const perSide: number[] = []
  if (perSideLeft <= 0) {
    return { perSide, loadedKg: barKg, short: targetKg < barKg - 1e-9 }
  }
  for (const plate of sorted) {
    while (perSideLeft + 1e-9 >= plate) {
      perSide.push(plate)
      perSideLeft -= plate
    }
  }
  const loadedKg = barKg + perSide.reduce((sum, plate) => sum + plate, 0) * 2
  return { perSide, loadedKg, short: Math.abs(loadedKg - targetKg) > 1e-6 }
}

type WarmUpSet = { weightKg: number; reps: number }

/**
 * A simple ramp before the first working set: the empty bar for 10, then 40%,
 * 60% and 80% of the working weight for 5, 3 and 2. Each step is rounded down
 * to what the plates can load, and a step that lands on the one before it, or
 * on the working weight, is left out.
 */
export function warmUpSets(
  workingKg: number,
  barKg: number,
  platesKg: readonly number[]
): WarmUpSet[] {
  if (workingKg <= barKg) return []
  const ramp: WarmUpSet[] = [{ weightKg: barKg, reps: 10 }]
  for (const [share, reps] of [
    [0.4, 5],
    [0.6, 3],
    [0.8, 2],
  ] as const) {
    const { loadedKg } = platesFor(workingKg * share, barKg, platesKg)
    const last = ramp[ramp.length - 1]
    if (loadedKg > last.weightKg + 1e-6 && loadedKg < workingKg - 1e-6) {
      ramp.push({ weightKg: loadedKg, reps })
    }
  }
  return ramp
}
