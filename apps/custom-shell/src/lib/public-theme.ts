import type { CSSProperties } from "react"

import {
  MAX_CARD_BORDER_WIDTH,
  MAX_CONTENT_GUTTER,
  MAX_MODAL_PADDING,
  MIN_CONTENT_GUTTER,
  SHELL_BACKGROUND_MODES,
  type ShellBackground,
  type ShellBackgroundMode,
  type ShellModalStyling,
  type ShellStyling,
} from "@/lib/layout/styling-values"
import {
  derivePublicBrandColors,
  type PublicBrandColorOverrides,
} from "@/lib/public-theme-colors"

export const PUBLIC_THEME_FONTS = ["system", "inter", "serif", "mono"] as const
export type PublicThemeFont = (typeof PUBLIC_THEME_FONTS)[number]

export const PUBLIC_THEME_HEADING_FONTS = [
  "match",
  "baskerville",
  "inter",
  "serif",
  "mono",
] as const
export type PublicThemeHeadingFont =
  (typeof PUBLIC_THEME_HEADING_FONTS)[number]

export const PUBLIC_COLOR_SCHEMES = ["system", "light", "dark"] as const
export type PublicColorScheme = (typeof PUBLIC_COLOR_SCHEMES)[number]

export const PUBLIC_CONTENT_ALIGNMENTS = ["left", "center", "right"] as const
export type PublicContentAlignment =
  (typeof PUBLIC_CONTENT_ALIGNMENTS)[number]

export const PUBLIC_BACKGROUND_PATTERNS = ["none", "dots", "grid"] as const
export type PublicBackgroundPattern =
  (typeof PUBLIC_BACKGROUND_PATTERNS)[number]

export const PUBLIC_BACKGROUND_PATTERN_SIZES = [
  "small",
  "medium",
  "large",
] as const
export type PublicBackgroundPatternSize =
  (typeof PUBLIC_BACKGROUND_PATTERN_SIZES)[number]

export const PUBLIC_BUTTON_STYLES = ["solid", "outline"] as const
export type PublicButtonStyle = (typeof PUBLIC_BUTTON_STYLES)[number]

export const PUBLIC_BUTTON_CASINGS = ["as-written", "uppercase"] as const
export type PublicButtonCasing = (typeof PUBLIC_BUTTON_CASINGS)[number]

export type PublicTheme = {
  /** Buttons, links, and focus rings. Empty keeps the app's normal colour. */
  brandColor: string
  /** Optional fixed values. A missing key keeps that value automatic. */
  brandOverrides: PublicBrandColorOverrides
  /** Public canvas behind the header, page content, and footer. */
  canvasColor: ShellBackground
  /** Public header and footer background. The signed-in twin is `chrome`. */
  chrome: ShellBackground
  /**
   * Space around the public content column and between its blocks, in pixels.
   * 0 is flat mode: no card borders, no rounded corners, no gaps. Top and
   * bottom spacing stays with `mainSpacing`.
   */
  gutter: number
  /** Card and table border width on public pages, in pixels (0 = off). */
  cardBorderWidth: number
  /** Card and table border colour on public pages. */
  cardBorderColor: ShellBackground
  /** The thin lines inside public cards and tables, and the header rule. */
  dividerColor: ShellBackground
  /** Dialog styling for public pages. */
  modal: ShellModalStyling
  /** Widest public header, main area, and footer content in pixels. */
  pageWidth: number
  /** Top and bottom padding around public page content in pixels. */
  mainSpacing: number
  /** Horizontal alignment for the main content on every public page. */
  contentAlignment: PublicContentAlignment
  /** Optional texture drawn over the public canvas. */
  backgroundPattern: PublicBackgroundPattern
  /** Distance between the pattern's dots or grid lines. */
  backgroundPatternSize: PublicBackgroundPatternSize
  /** Pattern strength as a percentage, capped for readability. */
  backgroundPatternOpacity: number
  /** Default primary-button treatment on public pages. */
  buttonStyle: PublicButtonStyle
  /** Label casing for buttons on public pages. */
  buttonCasing: PublicButtonCasing
  /** Whether the public header draws its bottom divider. */
  headerBorder: boolean
  /** Whether the public footer draws its top divider. */
  footerBorder: boolean
  /** Whether visitors choose light or dark, or the public site pins one. */
  colorScheme: PublicColorScheme
  /** Uses the uploaded app-wide font while keeping `font` as its fallback. */
  useCustomFont: boolean
  font: PublicThemeFont
  /** The face headings use. `match` leaves them on the body font. */
  headingFont: PublicThemeHeadingFont
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

export const PUBLIC_THEME_HEADING_FONT_LABELS: Record<
  PublicThemeHeadingFont,
  string
> = {
  match: "Same as the body",
  baskerville: "Libre Baskerville",
  inter: "Inter",
  serif: "Serif",
  mono: "Mono",
}

export const PUBLIC_THEME_HEADING_FONT_STACKS: Record<
  Exclude<PublicThemeHeadingFont, "match">,
  string
> = {
  baskerville: '"Libre Baskerville", ui-serif, Georgia, serif',
  inter: PUBLIC_THEME_FONT_STACKS.inter,
  serif: PUBLIC_THEME_FONT_STACKS.serif,
  mono: PUBLIC_THEME_FONT_STACKS.mono,
}

export const DEFAULT_PUBLIC_RADIUS = 10
export const MAX_PUBLIC_RADIUS = 24
export const MIN_PUBLIC_PAGE_WIDTH = 640
export const DEFAULT_PUBLIC_PAGE_WIDTH = 1152
export const MAX_PUBLIC_PAGE_WIDTH = 1600
export const DEFAULT_PUBLIC_MAIN_SPACING = 40
export const MAX_PUBLIC_MAIN_SPACING = 96
/**
 * 12px is `md:gap-3`, the desktop gap the public column has always used. A
 * theme still on this number keeps the responsive `gap-2 md:gap-3` classes, so
 * phones keep their 8px gap until an admin moves the slider.
 */
export const DEFAULT_PUBLIC_GUTTER = 12
/** The `--shell-modal-padding` fallback in theme.css, as a number. */
const DEFAULT_PUBLIC_MODAL_PADDING = 24
/** The `--shell-modal-overlay-opacity` fallback in theme.css, as a number. */
const DEFAULT_PUBLIC_MODAL_OVERLAY_OPACITY = 10
export const DEFAULT_PUBLIC_BACKGROUND_PATTERN_OPACITY = 8
export const MAX_PUBLIC_BACKGROUND_PATTERN_OPACITY = 20
export const PUBLIC_BACKGROUND_PATTERN_SIZE_PIXELS: Record<
  PublicBackgroundPatternSize,
  number
> = {
  small: 12,
  medium: 16,
  large: 24,
}
export const PUBLIC_BRAND_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
export const PUBLIC_BRAND_OVERRIDE_KEYS = [
  "hoverColor",
  "softColor",
  "foregroundColor",
  "darkColor",
] as const satisfies readonly PublicBrandOverrideKey[]

/**
 * The dialog look a public page has today, written as settings.
 *
 * Not `createDefaultModalStyling()`: that is the tuned signed-in look, and the
 * numbers here are the fallbacks already written into the dialog rules in
 * `theme.css`, so a site that changes nothing keeps the dialog it has now.
 */
function createDefaultPublicModalStyling(): ShellModalStyling {
  return {
    background: { mode: "default", strength: 44, color: "#ffffff" },
    borderWidth: 1,
    borderColor: { mode: "default", strength: 28, color: "#d4d4d8" },
    padding: DEFAULT_PUBLIC_MODAL_PADDING,
    overlayOpacity: DEFAULT_PUBLIC_MODAL_OVERLAY_OPACITY,
    cardBackground: { mode: "default", strength: 0, color: "#ffffff" },
    cardBorderWidth: 1,
    cardBorderColor: { mode: "default", strength: 6, color: "#d4d4d8" },
  }
}

export function createDefaultPublicTheme(): PublicTheme {
  return {
    brandColor: "",
    brandOverrides: {},
    canvasColor: { mode: "default", strength: 60, color: "#ffffff" },
    chrome: { mode: "default", strength: 27, color: "#ffffff" },
    gutter: DEFAULT_PUBLIC_GUTTER,
    cardBorderWidth: 1,
    cardBorderColor: { mode: "default", strength: 7, color: "#d4d4d8" },
    dividerColor: { mode: "default", strength: 10, color: "#d4d4d8" },
    modal: createDefaultPublicModalStyling(),
    pageWidth: DEFAULT_PUBLIC_PAGE_WIDTH,
    mainSpacing: DEFAULT_PUBLIC_MAIN_SPACING,
    contentAlignment: "center",
    backgroundPattern: "none",
    backgroundPatternSize: "medium",
    backgroundPatternOpacity: DEFAULT_PUBLIC_BACKGROUND_PATTERN_OPACITY,
    buttonStyle: "solid",
    buttonCasing: "as-written",
    headerBorder: true,
    footerBorder: true,
    colorScheme: "system",
    useCustomFont: false,
    font: "system",
    headingFont: "match",
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

function publicBrandOverridesWithFallback(
  value: unknown,
  fallback: PublicBrandColorOverrides
): PublicBrandColorOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback }
  }

  const overrides = value as Record<string, unknown>
  const resolved = { ...fallback }
  for (const key of PUBLIC_BRAND_OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue

    const color = normalizePublicBrandColor(overrides[key])
    if (color) {
      resolved[key] = color
    } else {
      delete resolved[key]
    }
  }
  return resolved
}

function publicBrandOverrideChanges(
  value: PublicBrandColorOverrides,
  fallback: PublicBrandColorOverrides
): PublicBrandColorOverrides {
  return Object.fromEntries(
    PUBLIC_BRAND_OVERRIDE_KEYS.flatMap((key) => {
      const color = value[key] ?? ""
      return color === (fallback[key] ?? "") ? [] : [[key, color]]
    })
  )
}

/**
 * Every canvas colour an admin can type on the Public styling tab, paired with
 * the name that tab gives it and listed in the order that tab shows them. The
 * header names the field to fix when the auto-save refuses a half-typed hex, so
 * the label lives beside the value it belongs to. A colour left on "Theme
 * default" or "Muted" has no hex to get wrong.
 */
function publicThemeBackgroundFields(
  theme: PublicTheme
): readonly (readonly [ShellBackground, string])[] {
  return [
    [theme.canvasColor, "canvas colour"],
    [theme.cardBorderColor, "border colour"],
    [theme.dividerColor, "divider colour"],
    [theme.chrome, "header and footer colour"],
    [theme.modal.background, "modal background"],
    [theme.modal.borderColor, "modal border colour"],
    [theme.modal.cardBackground, "modal card background"],
    [theme.modal.cardBorderColor, "modal card border colour"],
  ]
}

const PUBLIC_BRAND_OVERRIDE_LABELS: Record<PublicBrandOverrideKey, string> = {
  hoverColor: "hover colour",
  softColor: "soft tint",
  foregroundColor: "button text colour",
  darkColor: "dark-mode brand colour",
}

function isPublicBackgroundValid(background: ShellBackground): boolean {
  return (
    background.mode !== "custom" ||
    PUBLIC_BRAND_COLOR_PATTERN.test(background.color)
  )
}

/**
 * The first half-typed colour on the Public styling tab, named as that tab
 * names it, or null when every colour is a finished 6-digit hex. The auto-save
 * refuses a theme with one of these in it, so this is what the header names.
 */
export function publicThemeColorProblem(theme: PublicTheme): string | null {
  if (!isPublicBrandColor(theme.brandColor)) {
    return "brand colour"
  }
  for (const key of PUBLIC_BRAND_OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(theme.brandOverrides, key)) {
      continue
    }
    const value = theme.brandOverrides[key]
    if (typeof value !== "string" || !PUBLIC_BRAND_COLOR_PATTERN.test(value)) {
      return PUBLIC_BRAND_OVERRIDE_LABELS[key]
    }
  }
  for (const [background, label] of publicThemeBackgroundFields(theme)) {
    if (!isPublicBackgroundValid(background)) {
      return label
    }
  }
  return null
}

/**
 * A site's part of Public Styling. The optional fallback carries CMS's old
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
 * A saved public colour. Three shapes reach this function:
 *
 * - the three-mode object this tab saves now;
 * - a plain hex string, which is every canvas colour saved before the tab
 *   gained the mode picker, and reads as the custom colour it drew;
 * - an empty string, the same rows with no canvas colour, which reads as the
 *   theme's own canvas.
 */
function normalizePublicBackground(
  value: unknown,
  fallback: ShellBackground
): ShellBackground {
  if (typeof value === "string") {
    const color = normalizePublicBrandColor(value)
    return color
      ? { ...fallback, mode: "custom", color }
      : { ...fallback, mode: "default" }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback }
  }

  const background = value as Partial<ShellBackground>
  return {
    mode: SHELL_BACKGROUND_MODES.includes(background.mode as ShellBackgroundMode)
      ? (background.mode as ShellBackgroundMode)
      : fallback.mode,
    strength: normalizeWholeNumber(background.strength, fallback.strength, 0, 100),
    // Only a 6-digit hex, which is the one shape the save schema accepts and
    // the picker writes. These colours reach a signed-out visitor's page as
    // inline styles and CSS variables, so a row edited straight in the
    // database cannot put anything else there.
    color: normalizePublicBrandColor(background.color) || fallback.color,
  }
}

function normalizePublicModalStyling(
  value: unknown,
  fallback: ShellModalStyling
): ShellModalStyling {
  // Copied rather than handed back, colours included, so a normalized theme
  // never shares an object with the fallback it was filled from.
  const modal = (
    value && typeof value === "object" && !Array.isArray(value) ? value : {}
  ) as Partial<ShellModalStyling>
  return {
    background: normalizePublicBackground(modal.background, fallback.background),
    borderWidth: normalizeWholeNumber(
      modal.borderWidth,
      fallback.borderWidth,
      0,
      MAX_CARD_BORDER_WIDTH
    ),
    borderColor: normalizePublicBackground(
      modal.borderColor,
      fallback.borderColor
    ),
    padding: normalizeWholeNumber(
      modal.padding,
      fallback.padding,
      0,
      MAX_MODAL_PADDING
    ),
    overlayOpacity: normalizeWholeNumber(
      modal.overlayOpacity,
      fallback.overlayOpacity,
      0,
      100
    ),
    cardBackground: normalizePublicBackground(
      modal.cardBackground,
      fallback.cardBackground
    ),
    cardBorderWidth: normalizeWholeNumber(
      modal.cardBorderWidth,
      fallback.cardBorderWidth,
      0,
      MAX_CARD_BORDER_WIDTH
    ),
    cardBorderColor: normalizePublicBackground(
      modal.cardBorderColor,
      fallback.cardBorderColor
    ),
  }
}

/**
 * Public theme values are stored in a JSON settings object that can predate
 * fields here. Normalize each one before writing it into a public page.
 */
export function normalizePublicTheme(
  value: unknown,
  fallback: PublicTheme = createDefaultPublicTheme()
): PublicTheme {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback, brandOverrides: { ...fallback.brandOverrides } }
  }

  const theme = value as Partial<PublicTheme>
  const brandTheme = normalizePublicBrandTheme(theme)
  return {
    brandColor: Object.prototype.hasOwnProperty.call(theme, "brandColor")
      ? brandTheme.brandColor
      : fallback.brandColor,
    brandOverrides: Object.prototype.hasOwnProperty.call(
      theme,
      "brandOverrides"
    )
      ? publicBrandOverridesWithFallback(
          theme.brandOverrides,
          fallback.brandOverrides
        )
      : { ...fallback.brandOverrides },
    canvasColor: normalizePublicBackground(
      theme.canvasColor,
      fallback.canvasColor
    ),
    chrome: normalizePublicBackground(theme.chrome, fallback.chrome),
    gutter: normalizeWholeNumber(
      theme.gutter,
      fallback.gutter,
      MIN_CONTENT_GUTTER,
      MAX_CONTENT_GUTTER
    ),
    cardBorderWidth: normalizeWholeNumber(
      theme.cardBorderWidth,
      fallback.cardBorderWidth,
      0,
      MAX_CARD_BORDER_WIDTH
    ),
    cardBorderColor: normalizePublicBackground(
      theme.cardBorderColor,
      fallback.cardBorderColor
    ),
    dividerColor: normalizePublicBackground(
      theme.dividerColor,
      fallback.dividerColor
    ),
    modal: normalizePublicModalStyling(theme.modal, fallback.modal),
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
    contentAlignment: PUBLIC_CONTENT_ALIGNMENTS.includes(
      theme.contentAlignment as PublicContentAlignment
    )
      ? (theme.contentAlignment as PublicContentAlignment)
      : fallback.contentAlignment,
    backgroundPattern: PUBLIC_BACKGROUND_PATTERNS.includes(
      theme.backgroundPattern as PublicBackgroundPattern
    )
      ? (theme.backgroundPattern as PublicBackgroundPattern)
      : fallback.backgroundPattern,
    backgroundPatternSize: PUBLIC_BACKGROUND_PATTERN_SIZES.includes(
      theme.backgroundPatternSize as PublicBackgroundPatternSize
    )
      ? (theme.backgroundPatternSize as PublicBackgroundPatternSize)
      : fallback.backgroundPatternSize,
    backgroundPatternOpacity: normalizeWholeNumber(
      theme.backgroundPatternOpacity,
      fallback.backgroundPatternOpacity,
      0,
      MAX_PUBLIC_BACKGROUND_PATTERN_OPACITY
    ),
    buttonStyle: PUBLIC_BUTTON_STYLES.includes(
      theme.buttonStyle as PublicButtonStyle
    )
      ? (theme.buttonStyle as PublicButtonStyle)
      : fallback.buttonStyle,
    buttonCasing: PUBLIC_BUTTON_CASINGS.includes(
      theme.buttonCasing as PublicButtonCasing
    )
      ? (theme.buttonCasing as PublicButtonCasing)
      : fallback.buttonCasing,
    headerBorder:
      typeof theme.headerBorder === "boolean"
        ? theme.headerBorder
        : fallback.headerBorder,
    footerBorder:
      typeof theme.footerBorder === "boolean"
        ? theme.footerBorder
        : fallback.footerBorder,
    colorScheme: PUBLIC_COLOR_SCHEMES.includes(
      theme.colorScheme as PublicColorScheme
    )
      ? (theme.colorScheme as PublicColorScheme)
      : fallback.colorScheme,
    useCustomFont:
      typeof theme.useCustomFont === "boolean"
        ? theme.useCustomFont
        : fallback.useCustomFont,
    font: PUBLIC_THEME_FONTS.includes(theme.font as PublicThemeFont)
      ? (theme.font as PublicThemeFont)
      : fallback.font,
    headingFont: PUBLIC_THEME_HEADING_FONTS.includes(
      theme.headingFont as PublicThemeHeadingFont
    )
      ? (theme.headingFont as PublicThemeHeadingFont)
      : fallback.headingFont,
    radius: normalizeWholeNumber(
      theme.radius,
      fallback.radius,
      0,
      MAX_PUBLIC_RADIUS
    ),
  }
}

/** Adds the brand values saved for one public site over the app-wide look. */
export function publicThemeForSite(
  appWideTheme: PublicTheme,
  savedBrandTheme: unknown
): PublicTheme {
  const siteTheme = normalizePublicBrandTheme(savedBrandTheme)
  if (!siteTheme.brandColor && !Object.keys(siteTheme.brandOverrides).length) {
    return appWideTheme
  }

  return {
    ...appWideTheme,
    brandColor: siteTheme.brandColor || appWideTheme.brandColor,
    brandOverrides: siteTheme.brandOverrides,
  }
}

function sameBackground(a: ShellBackground, b: ShellBackground): boolean {
  if (a.mode !== b.mode) return false
  if (a.mode === "muted") return a.strength === b.strength
  if (a.mode === "custom") return a.color === b.color
  // "Theme default" draws the theme's own colour, so the strength and colour
  // parked behind the picker change nothing on screen and are not a change.
  return true
}

/**
 * One colour's entry in the saved overrides, or nothing when it still matches
 * the app's starting look. The whole object is saved once it differs, because
 * the mode, the strength and the colour are read together.
 */
function changedBackground<Key extends string>(
  key: Key,
  value: ShellBackground,
  baseline: ShellBackground
): Partial<Record<Key, ShellBackground>> {
  return sameBackground(value, baseline)
    ? {}
    : ({ [key]: value } as Record<Key, ShellBackground>)
}

function modalStylingChanged(
  value: ShellModalStyling,
  baseline: ShellModalStyling
): boolean {
  return (
    value.borderWidth !== baseline.borderWidth ||
    value.padding !== baseline.padding ||
    value.overlayOpacity !== baseline.overlayOpacity ||
    value.cardBorderWidth !== baseline.cardBorderWidth ||
    !sameBackground(value.background, baseline.background) ||
    !sameBackground(value.borderColor, baseline.borderColor) ||
    !sameBackground(value.cardBackground, baseline.cardBackground) ||
    !sameBackground(value.cardBorderColor, baseline.cardBorderColor)
  )
}

/** Keeps only app-wide values an admin changed from the app's starting look. */
export function publicThemeOverrides(
  value: PublicTheme,
  fallback: PublicTheme
): Partial<PublicTheme> {
  const theme = normalizePublicTheme(value)
  const baseline = normalizePublicTheme(fallback)
  const brandOverrides = publicBrandOverrideChanges(
    theme.brandOverrides,
    baseline.brandOverrides
  )

  return {
    ...(theme.brandColor !== baseline.brandColor
      ? { brandColor: theme.brandColor }
      : {}),
    ...(Object.keys(brandOverrides).length ? { brandOverrides } : {}),
    ...changedBackground("canvasColor", theme.canvasColor, baseline.canvasColor),
    ...changedBackground("chrome", theme.chrome, baseline.chrome),
    ...(theme.gutter !== baseline.gutter ? { gutter: theme.gutter } : {}),
    ...(theme.cardBorderWidth !== baseline.cardBorderWidth
      ? { cardBorderWidth: theme.cardBorderWidth }
      : {}),
    ...changedBackground(
      "cardBorderColor",
      theme.cardBorderColor,
      baseline.cardBorderColor
    ),
    ...changedBackground(
      "dividerColor",
      theme.dividerColor,
      baseline.dividerColor
    ),
    ...(modalStylingChanged(theme.modal, baseline.modal)
      ? { modal: theme.modal }
      : {}),
    ...(theme.pageWidth !== baseline.pageWidth
      ? { pageWidth: theme.pageWidth }
      : {}),
    ...(theme.mainSpacing !== baseline.mainSpacing
      ? { mainSpacing: theme.mainSpacing }
      : {}),
    ...(theme.contentAlignment !== baseline.contentAlignment
      ? { contentAlignment: theme.contentAlignment }
      : {}),
    ...(theme.backgroundPattern !== baseline.backgroundPattern
      ? { backgroundPattern: theme.backgroundPattern }
      : {}),
    ...(theme.backgroundPatternSize !== baseline.backgroundPatternSize
      ? { backgroundPatternSize: theme.backgroundPatternSize }
      : {}),
    ...(theme.backgroundPatternOpacity !== baseline.backgroundPatternOpacity
      ? { backgroundPatternOpacity: theme.backgroundPatternOpacity }
      : {}),
    ...(theme.buttonStyle !== baseline.buttonStyle
      ? { buttonStyle: theme.buttonStyle }
      : {}),
    ...(theme.buttonCasing !== baseline.buttonCasing
      ? { buttonCasing: theme.buttonCasing }
      : {}),
    ...(theme.headerBorder !== baseline.headerBorder
      ? { headerBorder: theme.headerBorder }
      : {}),
    ...(theme.footerBorder !== baseline.footerBorder
      ? { footerBorder: theme.footerBorder }
      : {}),
    ...(theme.colorScheme !== baseline.colorScheme
      ? { colorScheme: theme.colorScheme }
      : {}),
    ...(theme.useCustomFont !== baseline.useCustomFont
      ? { useCustomFont: theme.useCustomFont }
      : {}),
    ...(theme.font !== baseline.font ? { font: theme.font } : {}),
    ...(theme.headingFont !== baseline.headingFont
      ? { headingFont: theme.headingFont }
      : {}),
    ...(theme.radius !== baseline.radius ? { radius: theme.radius } : {}),
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
  if (theme.useCustomFont || theme.font !== "system") {
    style["--app-font-sans"] = theme.useCustomFont
      ? `"Custom public font", ${PUBLIC_THEME_FONT_STACKS[theme.font]}`
      : PUBLIC_THEME_FONT_STACKS[theme.font]
    style.fontFamily = "var(--app-font-sans)"
  }
  if (theme.headingFont !== "match") {
    style["--app-font-heading"] =
      PUBLIC_THEME_HEADING_FONT_STACKS[theme.headingFont]
  }
  if (
    theme.backgroundPattern !== "none" &&
    theme.backgroundPatternOpacity > 0
  ) {
    style["--shell-public-pattern-color"] =
      `color-mix(in oklab, var(--foreground) ${theme.backgroundPatternOpacity}%, transparent)`
    style["--shell-public-pattern-size"] =
      `${PUBLIC_BACKGROUND_PATTERN_SIZE_PIXELS[theme.backgroundPatternSize]}px`
  }

  return Object.keys(style).length ? (style as CSSProperties) : undefined
}

export function hasCustomPublicTheme(theme: PublicTheme): boolean {
  const starting = createDefaultPublicTheme()
  return (
    publicThemeStyle(theme) !== undefined ||
    !sameBackground(theme.canvasColor, starting.canvasColor) ||
    !sameBackground(theme.chrome, starting.chrome) ||
    !sameBackground(theme.cardBorderColor, starting.cardBorderColor) ||
    !sameBackground(theme.dividerColor, starting.dividerColor) ||
    theme.gutter !== starting.gutter ||
    theme.cardBorderWidth !== starting.cardBorderWidth ||
    modalStylingChanged(theme.modal, starting.modal) ||
    theme.pageWidth !== DEFAULT_PUBLIC_PAGE_WIDTH ||
    theme.mainSpacing !== DEFAULT_PUBLIC_MAIN_SPACING ||
    theme.contentAlignment !== "center" ||
    (theme.backgroundPattern !== "none" &&
      theme.backgroundPatternOpacity > 0) ||
    theme.buttonStyle !== "solid" ||
    theme.buttonCasing !== "as-written" ||
    !theme.headerBorder ||
    !theme.footerBorder ||
    theme.colorScheme !== "system"
  )
}

/**
 * The public theme read as the styling shape the signed-in app saves, so the
 * public frame can hand it to `resolveBackground`, `getBorderStyleVars` and
 * `getModalStyleVars` instead of repeating what those already do.
 */
export function publicShellStyling(theme: PublicTheme): ShellStyling {
  return {
    gutter: theme.gutter,
    cardBorderWidth: theme.cardBorderWidth,
    cardBorderColor: theme.cardBorderColor,
    dividerColor: theme.dividerColor,
    content: theme.canvasColor,
    chrome: theme.chrome,
    modal: theme.modal,
  }
}

/** Chooses the public colour mode before styles load, avoiding a light/dark flash. */
export function noFlashThemeScript(scheme: PublicColorScheme) {
  if (scheme === "light") {
    return "try{document.documentElement.classList.add('light')}catch(e){}"
  }
  if (scheme === "dark") {
    return "try{document.documentElement.classList.add('dark')}catch(e){}"
  }

  return "try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}"
}
