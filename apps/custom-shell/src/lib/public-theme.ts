import type { CSSProperties } from "react"

export const PUBLIC_THEME_FONTS = ["system", "inter", "serif", "mono"] as const
export type PublicThemeFont = (typeof PUBLIC_THEME_FONTS)[number]

export type PublicTheme = {
  font: PublicThemeFont
  radius: number
}

export const PUBLIC_THEME_FONT_LABELS: Record<PublicThemeFont, string> = {
  system: "App default",
  inter: "Inter",
  serif: "Serif",
  mono: "Mono",
}

export const PUBLIC_THEME_FONT_STACKS: Record<PublicThemeFont, string> = {
  system: "ui-sans-serif, system-ui, sans-serif",
  inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
}

export const DEFAULT_PUBLIC_RADIUS = 10
export const MAX_PUBLIC_RADIUS = 24

export function createDefaultPublicTheme(): PublicTheme {
  return {
    font: "system",
    radius: DEFAULT_PUBLIC_RADIUS,
  }
}

/**
 * Public theme values are stored in a JSON settings object that can predate
 * either field here. Normalize both on read before writing them into a page.
 */
export function normalizePublicTheme(value: unknown): PublicTheme {
  const fallback = createDefaultPublicTheme()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }

  const theme = value as Partial<PublicTheme>
  return {
    font: PUBLIC_THEME_FONTS.includes(theme.font as PublicThemeFont)
      ? (theme.font as PublicThemeFont)
      : fallback.font,
    radius:
      typeof theme.radius === "number" && Number.isFinite(theme.radius)
        ? Math.min(MAX_PUBLIC_RADIUS, Math.max(0, Math.round(theme.radius)))
        : fallback.radius,
  }
}

/**
 * Values placed on the document in the first server render so the chosen font
 * and corners are present before the browser paints.
 */
export function publicThemeStyle(
  theme: PublicTheme
): CSSProperties | undefined {
  const style: Record<string, string> = {}

  if (theme.radius !== DEFAULT_PUBLIC_RADIUS) {
    style["--radius"] = `${theme.radius / 16}rem`
    style["--radius-sm"] = "calc(var(--radius) * 0.6)"
    style["--radius-md"] = "calc(var(--radius) * 0.8)"
    style["--radius-lg"] = "var(--radius)"
    style["--radius-xl"] = "calc(var(--radius) * 1.4)"
    style["--radius-2xl"] = "calc(var(--radius) * 1.8)"
    style["--radius-3xl"] = "calc(var(--radius) * 2.2)"
    style["--radius-4xl"] = "calc(var(--radius) * 2.6)"
  }
  if (theme.font !== "system") {
    style["--app-font-sans"] = PUBLIC_THEME_FONT_STACKS[theme.font]
    style.fontFamily = "var(--app-font-sans)"
  }

  return Object.keys(style).length ? (style as CSSProperties) : undefined
}

export function hasCustomPublicTheme(theme: PublicTheme): boolean {
  return publicThemeStyle(theme) !== undefined
}
