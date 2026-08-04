import type { CSSProperties } from "react"

/**
 * The one look every public page wears: the front page, pricing, the whole
 * sign-in family, and the maintenance page. Saved app-wide in the settings row
 * (no migration — it rides in the same JSON blob as the app name and logo) and
 * handed to the browser by the root route's loader, so it is in the very first
 * paint rather than applied after load.
 *
 * Every value is optional in the sense that matters: an empty color, the system
 * font and the default roundness reproduce today's look exactly, so an app that
 * never saves a theme is untouched. That is what lets this ship before the
 * screens that edit it exist.
 *
 * It deliberately does not reach the signed-in app. That has its own per-
 * workspace styling (`ShellStyling` in `lib/custom-shell.tsx`), and the two are
 * kept apart on purpose: one is what visitors see, the other is what an admin
 * tunes for their own workspace.
 */
export type PublicTheme = {
  /** Buttons and accents. Hex, or "" to keep the theme's own primary. */
  brandColor: string
  /** The page canvas. Hex, or "" to keep the standard muted canvas. */
  backgroundColor: string
  /** Body text. Hex, or "" to keep the theme's own foreground. */
  textColor: string
  /** Which self-hosted face public pages use. Never a font fetched remotely. */
  font: PublicThemeFont
  /** Corner roundness in px. 10 is today's 0.625rem. */
  radius: number
  /**
   * Light or dark for the public side. "system" follows the visitor, which is
   * how the app has always behaved; naming one pins it, because the colours
   * above are one value each rather than a light-and-dark pair.
   */
  colorScheme: PublicColorScheme
}

/**
 * Nothing here is ever fetched from someone else's server. Inter is bundled in
 * `public/fonts`; the other three are the faces already on the visitor's own
 * machine, which cost nothing to use. Anything added later has to be bundled
 * the same way as Inter — pulling a face from Google slows the page down and
 * tells them who visited.
 */
export const PUBLIC_THEME_FONTS = ["system", "inter", "serif", "mono"] as const
export type PublicThemeFont = (typeof PUBLIC_THEME_FONTS)[number]

export const PUBLIC_COLOR_SCHEMES = ["system", "light", "dark"] as const
export type PublicColorScheme = (typeof PUBLIC_COLOR_SCHEMES)[number]

export const PUBLIC_THEME_FONT_STACKS: Record<PublicThemeFont, string> = {
  system: "ui-sans-serif, system-ui, sans-serif",
  inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
}

export const PUBLIC_THEME_FONT_LABELS: Record<PublicThemeFont, string> = {
  system: "System",
  inter: "Inter",
  serif: "Serif",
  mono: "Mono",
}

export const MAX_PUBLIC_RADIUS = 24
/** 10px = the 0.625rem `--radius` in theme.css, so the default changes nothing. */
export const DEFAULT_PUBLIC_RADIUS = 10

export function createDefaultPublicTheme(): PublicTheme {
  return {
    brandColor: "",
    backgroundColor: "",
    textColor: "",
    font: "system",
    radius: DEFAULT_PUBLIC_RADIUS,
    colorScheme: "system",
  }
}

/** `#abc` or `#aabbcc`. Anything else is not a color we are willing to paint. */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Guarded rather than defaulted, and for the same reason the app name and logo
 * are: these values land on a page a signed-out visitor sees, so a junk value in
 * the settings row — hand-edited, or written by an older version — has to read
 * as "no color set" instead of reaching the paint.
 */
function normalizeColor(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim().toLowerCase()
  return HEX_COLOR.test(trimmed) ? trimmed : ""
}

export function normalizePublicTheme(value: unknown): PublicTheme {
  const fallback = createDefaultPublicTheme()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }

  const theme = value as Partial<PublicTheme>
  return {
    brandColor: normalizeColor(theme.brandColor),
    backgroundColor: normalizeColor(theme.backgroundColor),
    textColor: normalizeColor(theme.textColor),
    font: PUBLIC_THEME_FONTS.includes(theme.font as PublicThemeFont)
      ? (theme.font as PublicThemeFont)
      : fallback.font,
    radius:
      typeof theme.radius === "number" && Number.isFinite(theme.radius)
        ? Math.min(MAX_PUBLIC_RADIUS, Math.max(0, Math.round(theme.radius)))
        : fallback.radius,
    colorScheme: PUBLIC_COLOR_SCHEMES.includes(
      theme.colorScheme as PublicColorScheme
    )
      ? (theme.colorScheme as PublicColorScheme)
      : fallback.colorScheme,
  }
}

/** The two text colors already in the palette (theme.css `oklch(0.985 0 0)` / `oklch(0.205 0 0)`). */
const LIGHT_TEXT = "oklch(0.985 0 0)"
const DARK_TEXT = "oklch(0.205 0 0)"

function channelToLinear(channel: number) {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/**
 * Which of the palette's two text colors stays readable on a given brand color.
 *
 * A brand color arrives on its own — nobody picks the text that sits on top of
 * a button — so a pale brand with the default near-white label would be an
 * unreadable button. This works it out from the color's brightness instead.
 */
export function readableTextOn(hexColor: string): string {
  const hex = hexColor.replace("#", "")
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex
  const red = parseInt(full.slice(0, 2), 16)
  const green = parseInt(full.slice(2, 4), 16)
  const blue = parseInt(full.slice(4, 6), 16)
  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) {
    return LIGHT_TEXT
  }

  // Relative luminance, the same weighting the contrast standards use.
  const luminance =
    0.2126 * channelToLinear(red) +
    0.7152 * channelToLinear(green) +
    0.0722 * channelToLinear(blue)
  return luminance > 0.45 ? DARK_TEXT : LIGHT_TEXT
}

/**
 * The theme as CSS custom properties, for the element every public page sits
 * inside. They are the same properties `theme.css` already declares, so nothing
 * has to be taught to read them — overriding `--primary` on an ancestor is what
 * makes every button below it change color.
 *
 * A property is only emitted when the admin actually set the value behind it.
 * That is the whole "no theme saved looks exactly like today" guarantee: an
 * unset color leaves the theme's own token in place rather than replacing it
 * with a copy of the same color that could drift later.
 */
export function publicThemeStyle(theme: PublicTheme): CSSProperties {
  const style: Record<string, string> = {
    // Always emitted, because the default is exactly today's value. Written in
    // rem rather than px so it still tracks a visitor's own text size.
    "--radius": `${theme.radius / 16}rem`,
    "--app-font-sans": PUBLIC_THEME_FONT_STACKS[theme.font],
    // Not redundant with the variable above: <html> already computed its
    // font-family from the default stack, and children inherit that finished
    // value rather than re-reading the variable. Same reason `body.app-font`
    // in theme.css restates it.
    fontFamily: "var(--app-font-sans)",
  }

  if (theme.brandColor) {
    style["--primary"] = theme.brandColor
    style["--primary-foreground"] = readableTextOn(theme.brandColor)
  }
  if (theme.backgroundColor) {
    style["--background"] = theme.backgroundColor
  }
  if (theme.textColor) {
    style["--foreground"] = theme.textColor
  }

  return style as CSSProperties
}

/**
 * The script that decides light or dark before anything paints. It runs in
 * `<head>`, ahead of the stylesheet, so the page never shows one scheme and
 * then swaps to the other.
 *
 * `scheme` is "system" everywhere except a public page whose theme pins one. A
 * pinned scheme skips the saved choice entirely — see `forcedTheme` in
 * `light-dark-switcher.tsx` for why the admin wins on that side. It comes from
 * a fixed list of three words, so putting it straight into the script is safe.
 */
export function noFlashThemeScript(scheme: PublicColorScheme) {
  if (scheme !== "system") {
    return `try{document.documentElement.classList.add('${scheme}')}catch(e){}`
  }

  return `try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}`
}
