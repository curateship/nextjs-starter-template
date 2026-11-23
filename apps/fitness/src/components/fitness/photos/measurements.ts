import type { PhotoSession, PhotoSlot } from "@/lib/api/fitness/photos"
import { formatWeight, fromKg, type WeightUnit } from "@/lib/fitness/weights"

export const SLOT_LABELS: Record<PhotoSlot, string> = { front: "Front", side: "Side", back: "Back" }

/** The tape measurements a photo day can carry, in the order they are shown. */
export const PHOTO_MEASUREMENTS = [
  { key: "chestCm", label: "Chest" },
  { key: "waistCm", label: "Waist" },
  { key: "hipsCm", label: "Hips" },
  { key: "armCm", label: "Arm" },
  { key: "thighCm", label: "Thigh" },
] as const

export type PhotoMeasurementKey = (typeof PHOTO_MEASUREMENTS)[number]["key"]

/** "84" or "84.5", rounded to a tenth. */
export function roundTenth(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/**
 * The change from the earlier day to the later one, in words: "Waist 84 cm,
 * down 3 cm". A figure missing on either day is left out rather than guessed.
 */
export function describeChanges(earlier: PhotoSession, later: PhotoSession, unit: WeightUnit): string[] {
  const lines: string[] = []
  if (earlier.bodyweightKg !== null && later.bodyweightKg !== null) {
    const change = fromKg(later.bodyweightKg - earlier.bodyweightKg, unit)
    lines.push(`Bodyweight ${formatWeight(later.bodyweightKg, unit)}, ${changeWords(change, unit)}`)
  }
  for (const { key, label } of PHOTO_MEASUREMENTS) {
    const before = earlier[key]
    const after = later[key]
    if (before === null || after === null) continue
    lines.push(`${label} ${roundTenth(after)} cm, ${changeWords(after - before, "cm")}`)
  }
  return lines
}

/** "down 3 cm", "up 0.5 kg" or "no change". */
export function changeWords(change: number, unit: string) {
  if (Math.abs(change) < 0.05) return "no change"
  return `${change > 0 ? "up" : "down"} ${roundTenth(Math.abs(change))} ${unit}`
}
