/**
 * Weights, units and the maths every strength screen shares.
 *
 * Every weight is stored in kilograms and never rounded in storage. A person
 * who lifts in pounds sees pounds everywhere, converted on the way in and on
 * the way out, so switching units changes every number on screen and none in
 * the database.
 */

export const WEIGHT_UNITS = ["kg", "lb"] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

const KG_PER_LB = 0.45359237

export function toKg(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value : value * KG_PER_LB
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? kg : kg / KG_PER_LB
}

/** "92.5 kg", "205 lb". Shows at most one decimal, and none when it is .0. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${formatWeightNumber(kg, unit)} ${unit}`
}

export function formatWeightNumber(kg: number, unit: WeightUnit): string {
  const value = Math.round(fromKg(kg, unit) * 10) / 10
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * The heaviest weight the lifter could likely lift once, from a set of
 * several reps: the Epley formula, weight x (1 + reps / 30). 80 kg for 5
 * reps gives about 93 kg. A single rep is its own answer.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0
  if (reps === 1) return weightKg
  return weightKg * (1 + reps / 30)
}

/** Rounds to the smallest jump the lifter's plates allow, such as 2.5 kg. */
export function roundToStep(kg: number, stepKg: number): number {
  if (stepKg <= 0) return kg
  return Math.round(kg / stepKg) * stepKg
}
