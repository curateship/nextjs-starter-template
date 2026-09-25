export const PUBLIC_THEME_MIN_TEXT_CONTRAST = 4.5
export const PUBLIC_THEME_LIGHT_SURFACE = "#ffffff"
export const PUBLIC_THEME_DARK_SURFACE = "#18181b"
export const PUBLIC_THEME_LIGHT_MODE_TEXT = "#18181b"
export const PUBLIC_THEME_DARK_MODE_TEXT = "#fafafa"

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

type RgbColor = {
  red: number
  green: number
  blue: number
}

export type PublicBrandColorOverrides = Partial<{
  hoverColor: string
  softColor: string
  foregroundColor: string
  darkColor: string
}>

export type PublicBrandModeColors = {
  brand: string
  hover: string
  soft: string
  foreground: string
}

export type PublicBrandColors = {
  light: PublicBrandModeColors
  dark: PublicBrandModeColors
}

export type PublicThemeContrast = {
  light: {
    pageText: boolean
    buttonText: boolean
    link: boolean
  }
  dark: {
    pageText: boolean
    buttonText: boolean
    link: boolean
  }
}

function parseHexColor(value: string): RgbColor | null {
  if (!HEX_COLOR_PATTERN.test(value)) return null

  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  }
}

function colorChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)))
    .toString(16)
    .padStart(2, "0")
}

function rgbToHex(color: RgbColor) {
  return `#${colorChannel(color.red)}${colorChannel(color.green)}${colorChannel(color.blue)}`
}

export function mixHexColors(
  color: string,
  target: string,
  targetWeight: number
): string {
  const sourceRgb = parseHexColor(color)
  const targetRgb = parseHexColor(target)
  if (!sourceRgb || !targetRgb) return color.toLowerCase()

  const weight = Math.min(1, Math.max(0, targetWeight))
  return rgbToHex({
    red: sourceRgb.red * (1 - weight) + targetRgb.red * weight,
    green: sourceRgb.green * (1 - weight) + targetRgb.green * weight,
    blue: sourceRgb.blue * (1 - weight) + targetRgb.blue * weight,
  })
}

function linearChannel(value: number) {
  const channel = value / 255
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(color: string): number | null {
  const rgb = parseHexColor(color)
  if (!rgb) return null

  return (
    0.2126 * linearChannel(rgb.red) +
    0.7152 * linearChannel(rgb.green) +
    0.0722 * linearChannel(rgb.blue)
  )
}

export function contrastRatio(
  foreground: string,
  background: string
): number | null {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  if (foregroundLuminance === null || backgroundLuminance === null) return null

  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

export function hasReadableTextContrast(
  foreground: string,
  background: string
) {
  const ratio = contrastRatio(foreground, background)
  return ratio !== null && ratio >= PUBLIC_THEME_MIN_TEXT_CONTRAST
}

export function readableTextOnBrand(brandColor: string) {
  const lightRatio = contrastRatio(PUBLIC_THEME_DARK_MODE_TEXT, brandColor) ?? 0
  const darkRatio = contrastRatio(PUBLIC_THEME_LIGHT_MODE_TEXT, brandColor) ?? 0
  const preferred = darkRatio > lightRatio
    ? PUBLIC_THEME_LIGHT_MODE_TEXT
    : PUBLIC_THEME_DARK_MODE_TEXT
  if (hasReadableTextContrast(preferred, brandColor)) return preferred

  return (contrastRatio("#000000", brandColor) ?? 0) >
    (contrastRatio("#ffffff", brandColor) ?? 0)
    ? "#000000"
    : "#ffffff"
}

function hoverColor(brandColor: string) {
  const luminance = relativeLuminance(brandColor) ?? 0
  return mixHexColors(
    brandColor,
    luminance > 0.005 ? "#000000" : "#ffffff",
    0.12
  )
}

function brandColorForDarkMode(brandColor: string) {
  if (hasReadableTextContrast(brandColor, PUBLIC_THEME_DARK_SURFACE)) {
    return brandColor
  }

  for (let step = 1; step <= 50; step += 1) {
    const candidate = mixHexColors(brandColor, "#ffffff", step * 0.02)
    if (hasReadableTextContrast(candidate, PUBLIC_THEME_DARK_SURFACE)) {
      return candidate
    }
  }

  return "#ffffff"
}

function resolvedOverride(value: string | undefined, automatic: string) {
  return value && HEX_COLOR_PATTERN.test(value) ? value.toLowerCase() : automatic
}

export function derivePublicBrandColors(
  brandColor: string,
  overrides: PublicBrandColorOverrides = {}
): PublicBrandColors | null {
  if (!HEX_COLOR_PATTERN.test(brandColor)) return null

  const lightBrand = brandColor.toLowerCase()
  const darkBrand = resolvedOverride(
    overrides.darkColor,
    brandColorForDarkMode(lightBrand)
  )
  const foregroundOverride = overrides.foregroundColor
  const hoverOverride = overrides.hoverColor
  const softOverride = overrides.softColor

  return {
    light: {
      brand: lightBrand,
      hover: resolvedOverride(hoverOverride, hoverColor(lightBrand)),
      soft: resolvedOverride(
        softOverride,
        mixHexColors(PUBLIC_THEME_LIGHT_SURFACE, lightBrand, 0.12)
      ),
      foreground: resolvedOverride(
        foregroundOverride,
        readableTextOnBrand(lightBrand)
      ),
    },
    dark: {
      brand: darkBrand,
      hover: resolvedOverride(hoverOverride, hoverColor(darkBrand)),
      soft: resolvedOverride(
        softOverride,
        mixHexColors(PUBLIC_THEME_DARK_SURFACE, darkBrand, 0.18)
      ),
      foreground: resolvedOverride(
        foregroundOverride,
        readableTextOnBrand(darkBrand)
      ),
    },
  }
}

export function publicThemeContrast(
  colors: PublicBrandColors
): PublicThemeContrast {
  return {
    light: {
      pageText: hasReadableTextContrast(
        PUBLIC_THEME_LIGHT_MODE_TEXT,
        PUBLIC_THEME_LIGHT_SURFACE
      ),
      buttonText: hasReadableTextContrast(
        colors.light.foreground,
        colors.light.brand
      ),
      link: hasReadableTextContrast(
        colors.light.brand,
        PUBLIC_THEME_LIGHT_SURFACE
      ),
    },
    dark: {
      pageText: hasReadableTextContrast(
        PUBLIC_THEME_DARK_MODE_TEXT,
        PUBLIC_THEME_DARK_SURFACE
      ),
      buttonText: hasReadableTextContrast(
        colors.dark.foreground,
        colors.dark.brand
      ),
      link: hasReadableTextContrast(
        colors.dark.brand,
        PUBLIC_THEME_DARK_SURFACE
      ),
    },
  }
}
