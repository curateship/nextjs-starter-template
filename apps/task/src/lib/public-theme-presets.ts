import { normalizePublicTheme, type PublicTheme } from "@/lib/public-theme"
import { resolveBackground } from "@/lib/layout/styling-values"

/**
 * A named public look: every value the Public Styling tab holds, under a name.
 *
 * Every preset is one an admin saved, kept in the app-wide settings row.
 * Applying one copies its theme over the app's public theme.
 */
export type PublicThemePreset = {
  /** Unique within the saved list. */
  id: string
  name: string
  theme: PublicTheme
}

export const MAX_PUBLIC_THEME_PRESETS = 20
export const MAX_PUBLIC_THEME_PRESET_NAME_LENGTH = 60
export const MAX_PUBLIC_THEME_PRESET_ID_LENGTH = 64

function normalizePresetText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

/**
 * Why this name will not do, in the words the admin is shown, or null when it
 * is fine.
 *
 * Two presets under one name leave two rows and two delete buttons that a
 * screen reader reads out identically, with no way to tell which is which, so
 * a repeat is refused rather than allowed and lived with.
 */
export function publicThemePresetNameProblem(
  name: string,
  existing: readonly PublicThemePreset[] = []
): string | null {
  const wanted = name.trim()
  if (!wanted) return "Give the preset a name."
  if (wanted.length > MAX_PUBLIC_THEME_PRESET_NAME_LENGTH) {
    return `Keep the name under ${MAX_PUBLIC_THEME_PRESET_NAME_LENGTH} characters.`
  }
  if (
    existing.some(
      (preset) => preset.name.toLowerCase() === wanted.toLowerCase()
    )
  ) {
    return `You already have a preset called ${wanted}.`
  }
  return null
}

/**
 * Saved presets, read the way every other settings value is read: anything that
 * is not a usable preset is dropped rather than repaired, because a half-read
 * preset would apply a half-built look in one click.
 */
export function normalizePublicThemePresets(
  value: unknown
): PublicThemePreset[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const presets: PublicThemePreset[] = []

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue

    const candidate = entry as Partial<PublicThemePreset>
    const id = normalizePresetText(
      candidate.id,
      MAX_PUBLIC_THEME_PRESET_ID_LENGTH
    )
    const name = normalizePresetText(
      candidate.name,
      MAX_PUBLIC_THEME_PRESET_NAME_LENGTH
    )
    if (!id || !name || seen.has(id)) continue

    seen.add(id)
    presets.push({ id, name, theme: normalizePublicTheme(candidate.theme) })
    if (presets.length === MAX_PUBLIC_THEME_PRESETS) break
  }

  return presets
}

/**
 * The four colours drawn beside a preset's name. A value on "Theme default"
 * shows the token the theme would draw, so the strip never pretends a preset
 * fixes a colour it leaves alone.
 */
export function publicThemePresetSwatches(theme: PublicTheme): string[] {
  return [
    resolveBackground(theme.canvasColor) ?? "var(--muted)",
    resolveBackground(theme.chrome, { opaque: true }) ?? "var(--background)",
    theme.brandColor || "var(--primary)",
    resolveBackground(theme.cardBorderColor, {
      base: "--muted-foreground",
    }) ?? "var(--border)",
  ]
}
