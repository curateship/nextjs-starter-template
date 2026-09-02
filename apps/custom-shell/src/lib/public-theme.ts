import type { CSSProperties } from "react"

import {
  derivePublicBrandColors,
  type PublicBrandColorOverrides,
} from "@/lib/public-theme-colors"

export const PUBLIC_THEME_FONTS = ["system", "inter", "serif", "mono"] as const
export type PublicThemeFont = (typeof PUBLIC_THEME_FONTS)[number]

export type PublicTheme = {
  /** Buttons, links, and focus rings. Empty keeps the app's normal colour. */
  brandColor: string
  /** Optional fixed values. A missing key keeps that value automatic. */
  brandOverrides: PublicBrandColorOverrides
  font: PublicThemeFont
  radius: number
}

export type PublicBrandTheme = Pick<
  PublicTheme,
  "brandColor" | "brandOverrides"
>

export type PublicBrandOverrideKey = keyof PublicBrandColorOverrides

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
export const PUBLIC_BRAND_OVERRIDE_KEYS = [
  "hoverColor",
  "softColor",
  "foregroundColor",
  "darkColor",
] as const satisfies readonly PublicBrandOverrideKey[]

export function createDefaultPublicTheme(): PublicTheme {
  return {
    brandColor: "",
    brandOverrides: {},
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

export function normalizePublicBrandOverrides(
  value: unknown
): PublicBrandColorOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const overrides = value as Record<string, unknown>
  return Object.fromEntries(
    PUBLIC_BRAND_OVERRIDE_KEYS.flatMap((key) => {
      const color = normalizePublicBrandColor(overrides[key])
      return color ? [[key, color]] : []
    })
  )
}

export function isPublicBrandThemeInputValid(theme: PublicBrandTheme) {
  return (
    isPublicBrandColor(theme.brandColor) &&
    PUBLIC_BRAND_OVERRIDE_KEYS.every((key) => {
      if (!Object.prototype.hasOwnProperty.call(theme.brandOverrides, key)) {
        return true
      }
      const value = theme.brandOverrides[key]
      return typeof value === "string" && PUBLIC_BRAND_COLOR_PATTERN.test(value)
    })
  )
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
    return {
      brandColor: Object.prototype.hasOwnProperty.call(theme, "brandColor")
        ? normalizePublicBrandColor(theme.brandColor)
        : normalizePublicBrandColor(fallbackBrandColor),
      brandOverrides: normalizePublicBrandOverrides(theme.brandOverrides),
    }
  }

  return {
    brandColor: normalizePublicBrandColor(fallbackBrandColor),
    brandOverrides: {},
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
  const brandTheme = normalizePublicBrandTheme(theme)
  return {
    ...brandTheme,
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
    ...normalizePublicBrandTheme(currentValue),
  }
}

/**
 * Values placed on the document in the first server render so the chosen
 * colour, font, and corners are present before the browser paints.
 */
export function publicThemeStyle(
  theme: PublicTheme
): CSSProperties | undefined {
  const style: Record<string, string> = {}
  const colors = derivePublicBrandColors(
    normalizePublicBrandColor(theme.brandColor),
    normalizePublicBrandOverrides(theme.brandOverrides)
  )

  if (colors) {
    style["--shell-public-primary-light"] = colors.light.brand
    style["--shell-public-primary-dark"] = colors.dark.brand
    style["--shell-public-primary-hover-light"] = colors.light.hover
    style["--shell-public-primary-hover-dark"] = colors.dark.hover
    style["--shell-public-primary-soft-light"] = colors.light.soft
    style["--shell-public-primary-soft-dark"] = colors.dark.soft
    style["--shell-public-primary-foreground-light"] =
      colors.light.foreground
    style["--shell-public-primary-foreground-dark"] = colors.dark.foreground
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
