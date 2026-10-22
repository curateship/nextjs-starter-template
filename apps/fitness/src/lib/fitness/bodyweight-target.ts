import { addDays, daysBetween, type Day } from "@/lib/fitness/dates"

/**
 * Which way the seven-day average is heading against the person's target
 * bodyweight, and how long it would take at that pace. The pace is read over
 * the last four weeks of weigh-ins: the average on the latest weigh-in
 * against the average on the earliest one in those four weeks.
 *
 * Averages of 82 kg four weeks ago and 80.4 kg now are losing 0.4 kg a week;
 * with a target of 77 kg that's 3.4 kg to go, about 9 weeks.
 */

/** Within this many kilograms of the target counts as there. */
export const ON_TARGET_KG = 0.5

/** Under this many kilograms a week either way counts as holding steady. */
const STEADY_KG_PER_WEEK = 0.05

export type BodyweightPace =
  | { kind: "onTarget" }
  | { kind: "tooSoon" }
  | { kind: "toward"; kgPerWeek: number; weeks: number }
  | { kind: "away"; kgPerWeek: number }
  | { kind: "steady" }

export function bodyweightPace(
  trend: readonly { day: Day; averageKg: number }[],
  targetKg: number
): BodyweightPace | null {
  const latest = trend[trend.length - 1]
  if (!latest) return null
  if (Math.abs(latest.averageKg - targetKg) <= ON_TARGET_KG) return { kind: "onTarget" }
  const from = addDays(latest.day, -27)
  const first = trend.find((entry) => entry.day >= from)
  const span = first ? daysBetween(first.day, latest.day) : 0
  if (!first || span < 14) return { kind: "tooSoon" }
  const kgPerWeek = ((latest.averageKg - first.averageKg) / span) * 7
  if (Math.abs(kgPerWeek) < STEADY_KG_PER_WEEK) return { kind: "steady" }
  const toGo = targetKg - latest.averageKg
  if (Math.sign(toGo) !== Math.sign(kgPerWeek)) return { kind: "away", kgPerWeek }
  return { kind: "toward", kgPerWeek, weeks: Math.ceil(Math.abs(toGo / kgPerWeek)) }
}
