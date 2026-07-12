import { z } from "zod"

/**
 * Trading-style categories for Automations. These are the suggested presets;
 * the stored value is the display string itself, so users can also type their
 * own custom category (the dashboard filter + selects fold in whatever values
 * are actually in use).
 */
export const AUTOMATION_TYPE_PRESETS = [
  "Day Trading",
  "Swing Trading",
  "Scalping",
  "Position Trading",
  "Uncategorized",
] as const

export const UNCATEGORIZED_TYPE = "Uncategorized"
export const MAX_AUTOMATION_TYPE_LENGTH = 40

/** Trim, cap length, and fall back to "Uncategorized" for empty input. */
export function normalizeAutomationType(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return UNCATEGORIZED_TYPE
  return trimmed.slice(0, MAX_AUTOMATION_TYPE_LENGTH)
}

/**
 * Ordered, de-duplicated choice list for a type `Select`: the presets first,
 * then any custom categories already in use (and the current value), sorted.
 */
export function automationTypeOptions(
  knownTypes: readonly string[] = [],
  current?: string
): string[] {
  const presets: readonly string[] = AUTOMATION_TYPE_PRESETS
  const extras = new Set<string>()
  for (const value of [...knownTypes, current ?? ""]) {
    const normalized = normalizeAutomationType(value)
    if (!presets.includes(normalized)) {
      extras.add(normalized)
    }
  }
  return [
    ...AUTOMATION_TYPE_PRESETS,
    ...[...extras].sort((a, b) => a.localeCompare(b)),
  ]
}

/** Zod schema for the API: always resolves to a valid non-empty label. */
export const automationTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_AUTOMATION_TYPE_LENGTH)
  .default(UNCATEGORIZED_TYPE)
  .catch(UNCATEGORIZED_TYPE)
