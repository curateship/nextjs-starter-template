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
  /** Public canvas colour. Empty keeps the standard muted canvas. */
  canvasColor: string
  /** Widest public header, main area, and footer content in pixels. */
  pageWidth: number
  /** Top and bottom padding around public page content in pixels. */
  mainSpacing: number
  /** Whether the public header draws its bottom divider. */
  headerBorder: boolean
  /** Whether the public footer draws its top divider. */
  footerBorder: boolean
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
export const MIN_PUBLIC_PAGE_WIDTH = 640
export const DEFAULT_PUBLIC_PAGE_WIDTH = 1152
export const MAX_PUBLIC_PAGE_WIDTH = 1600
export const DEFAULT_PUBLIC_MAIN_SPACING = 40
export const MAX_PUBLIC_MAIN_SPACING = 96
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
    canvasColor: "",
    pageWidth: DEFAULT_PUBLIC_PAGE_WIDTH,
    mainSpacing: DEFAULT_PUBLIC_MAIN_SPACING,
    headerBorder: true,
    footerBorder: true,
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

export function isPublicThemeInputValid(theme: PublicTheme) {
  return (
    isPublicBrandColor(theme.brandColor) &&
    isPublicBrandColor(theme.canvasColor) &&
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
 * fields here. Normalize each one before writing it into a public page.
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
    canvasColor: normalizePublicBrandColor(theme.canvasColor),
    pageWidth: normalizeWholeNumber(
      theme.pageWidth,
      fallback.pageWidth,
      MIN_PUBLIC_PAGE_WIDTH,
      MAX_PUBLIC_PAGE_WIDTH
    ),
    mainSpacing: normalizeWholeNumber(
      theme.mainSpacing,
      fallback.mainSpacing,
      0,
      MAX_PUBLIC_MAIN_SPACING
    ),
    headerBorder:
      typeof theme.headerBorder === "boolean"
        ? theme.headerBorder
        : fallback.headerBorder,
    footerBorder:
      typeof theme.footerBorder === "boolean"
        ? theme.footerBorder
        : fallback.footerBorder,
    font: PUBLIC_THEME_FONTS.includes(theme.font as PublicThemeFont)
      ? (theme.font as PublicThemeFont)
      : fallback.font,
    radius: normalizeWholeNumber(
      theme.radius,
      fallback.radius,
      0,
      MAX_PUBLIC_RADIUS
    ),
  }
}

function normalizeWholeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback
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
  return (
    publicThemeStyle(theme) !== undefined ||
    theme.canvasColor !== "" ||
    theme.pageWidth !== DEFAULT_PUBLIC_PAGE_WIDTH ||
    theme.mainSpacing !== DEFAULT_PUBLIC_MAIN_SPACING ||
    !theme.headerBorder ||
    !theme.footerBorder
  )
}
