import type { CSSProperties } from "react"

export const PUBLIC_THEME_FONTS = ["system", "inter", "serif", "mono"] as const
export type PublicThemeFont = (typeof PUBLIC_THEME_FONTS)[number]

export type PublicTheme = {
  /** Buttons, links, and focus rings. Empty keeps the app's normal colour. */
  brandColor: string
  font: PublicThemeFont
  radius: number
}

export type PublicBrandTheme = Pick<PublicTheme, "brandColor">

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
export const PUBLIC_BRAND_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function createDefaultPublicTheme(): PublicTheme {
  return {
    brandColor: "",
    font: "system",
    radius: DEFAULT_PUBLIC_RADIUS,
  }
}

export function normalizePublicBrandColor(value: unknown): string {
  if (typeof value !== "string") return ""
  const color = value.trim().toLowerCase()
  return PUBLIC_BRAND_COLOR_PATTERN.test(color) ? color : ""
}

export function isPublicBrandColor(value: string): boolean {
  return value === "" || PUBLIC_BRAND_COLOR_PATTERN.test(value)
}

/**
 * A site's part of Public Look. The optional fallback carries CMS's old
 * top-level accent colour until its next shell merge removes that field.
 * An explicit new value, including an empty one, always wins.
 */
export function normalizePublicBrandTheme(
  value: unknown,
  fallbackBrandColor?: unknown
): PublicBrandTheme {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const theme = value as Partial<PublicBrandTheme>
    if (Object.prototype.hasOwnProperty.call(theme, "brandColor")) {
      return { brandColor: normalizePublicBrandColor(theme.brandColor) }
    }
  }

  return { brandColor: normalizePublicBrandColor(fallbackBrandColor) }
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
    brandColor: normalizePublicBrandColor(theme.brandColor),
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
 * Multi-site apps save brand colour on the workspace and keep the deployment's
 * own colour. Single-site apps save the same field app-wide because no public
 * domain resolves to a workspace.
 */
export function publicThemeForAppWideSave(
  nextValue: unknown,
  currentValue: unknown,
  brandColorIsPerSite: boolean
): PublicTheme {
  const next = normalizePublicTheme(nextValue)
  if (!brandColorIsPerSite) return next

  return {
    ...next,
    brandColor: normalizePublicTheme(currentValue).brandColor,
  }
}

function readablePublicBrandForeground(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150
    ? "#18181b"
    : "#fafafa"
}

/**
 * Values placed on the document in the first server render so the chosen
 * colour, font, and corners are present before the browser paints.
 */
export function publicThemeStyle(
  theme: PublicTheme
): CSSProperties | undefined {
  const style: Record<string, string> = {}
  const brandColor = normalizePublicBrandColor(theme.brandColor)

  if (brandColor) {
    style["--shell-primary"] = brandColor
    style["--shell-primary-foreground"] =
      readablePublicBrandForeground(brandColor)
    style["--shell-ring"] = brandColor
  }

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
