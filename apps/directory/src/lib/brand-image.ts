/**
 * The dark-mode copy of the one brand image.
 *
 * An admin uploads a single picture. It is the logo on the signed-out pages and
 * the icon in the browser tab, and the app makes its dark-mode twin here rather
 * than asking for a second upload.
 *
 * The twin is made by flipping lightness alone. Hue and saturation stay put, so
 * a navy mark comes back as pale blue instead of the orange a plain photographic
 * negative would give. Black becomes white, white becomes black, and a mid-grey
 * stays roughly where it was — which is what "turn dark ink light" means to the
 * person looking at it.
 */

import type { PublicFaviconSet } from "@/lib/favicon"

/** Colour words a hand-written SVG actually uses. Anything else is left alone. */
const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  red: [255, 0, 0],
  lime: [0, 255, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  navy: [0, 0, 128],
  yellow: [255, 255, 0],
  olive: [128, 128, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
  teal: [0, 128, 128],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  maroon: [128, 0, 0],
}

/** Values that name no colour at all, so there is nothing to flip. */
const NON_COLOR_VALUES = new Set([
  "none",
  "transparent",
  "inherit",
  "currentcolor",
  "context-fill",
  "context-stroke",
])

/**
 * One pixel's dark-mode twin, as 0-255 red, green and blue.
 *
 * The chroma is untouched on purpose: swapping lightness `l` for `1 - l` leaves
 * `1 - |2l - 1|` exactly as it was, so the same saturation reproduces the same
 * distance between the brightest and dimmest channel. The flip is its own
 * inverse, which is the property that keeps a round trip honest.
 */
export function flipLightness(
  red: number,
  green: number,
  blue: number
): [number, number, number] {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const chroma = max - min

  if (chroma === 0) {
    const grey = Math.round((1 - lightness) * 255)
    return [grey, grey, grey]
  }

  const saturation = chroma / (1 - Math.abs(2 * lightness - 1))
  let hue: number
  if (max === r) {
    hue = ((g - b) / chroma + (g < b ? 6 : 0)) / 6
  } else if (max === g) {
    hue = ((b - r) / chroma + 2) / 6
  } else {
    hue = ((r - g) / chroma + 4) / 6
  }

  return hslToRgb(hue, saturation, 1 - lightness)
}

/**
 * The same flip applied to one CSS colour written in an SVG attribute.
 *
 * Returns the value unchanged when it names no colour this understands, because
 * a mark drawn in an unrecognised colour word is better left visible than
 * replaced with a guess.
 */
export function flipCssColorLightness(value: string): string {
  const text = value.trim()
  if (!text || NON_COLOR_VALUES.has(text.toLowerCase())) return value

  const parsed = parseCssColor(text)
  if (!parsed) return value

  const [r, g, b] = flipLightness(parsed.rgb[0], parsed.rgb[1], parsed.rgb[2])
  if (parsed.alpha !== undefined) {
    return `rgba(${r}, ${g}, ${b}, ${parsed.alpha})`
  }
  // Transparency is carried straight through: the flip is about ink, and an
  // eighth hex pair says how much of the page shows through it.
  return `#${[r, g, b].map(toHexPair).join("")}${parsed.alphaHex ?? ""}`
}

/**
 * The dark-mode twin of an SVG, as SVG.
 *
 * Every uploaded SVG has been through `sanitizeSvgContent`, which strips
 * `<style>`, `style=` and gradients and leaves `fill` and `stroke` attributes as
 * the only place a colour can live. That is what makes rewriting the text safe
 * rather than a parsing gamble.
 *
 * An element with no `fill` of its own paints black by default, so a root
 * `fill` is written in before the flip. The flip then turns it white along with
 * everything else, and a mark drawn without a single colour attribute still
 * shows up on a dark page.
 */
export function darkBrandSvg(source: string): string {
  return flipSvgColors(withRootFill(source))
}

function withRootFill(source: string) {
  // Quoted attribute values are stepped over rather than scanned past, because
  // `aria-label="a > b"` is legal on the root tag and the first ">" in the text
  // would then be inside it. Splitting there would drop the fill into the
  // middle of somebody's label.
  const openTag = /^<svg(?:"[^"]*"|'[^']*'|[^>"'])*>/i.exec(source)?.[0]
  if (!openTag) return source
  if (/\sfill\s*=/i.test(openTag)) return source

  const body = openTag.slice(0, openTag.endsWith("/>") ? -2 : -1)
  const close = openTag.endsWith("/>") ? "/>" : ">"
  return `${body} fill="#000000"${close}${source.slice(openTag.length)}`
}

function flipSvgColors(source: string) {
  return source.replace(
    /(\b(?:fill|stroke)\s*=\s*)("[^"]*"|'[^']*')/gi,
    (_match, name: string, quoted: string) => {
      const quote = quoted[0]
      const value = quoted.slice(1, -1)
      return `${name}${quote}${flipCssColorLightness(value)}${quote}`
    }
  )
}

function parseCssColor(text: string) {
  const named = NAMED_COLORS[text.toLowerCase()]
  if (named) return { rgb: named, alpha: undefined, alphaHex: "" }

  const hex = /^#([0-9a-f]{3,8})$/i.exec(text)
  if (hex) return parseHexColor(hex[1])

  const functional =
    /^rgba?\(\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)\s*(?:[,/]\s*([0-9.%]+)\s*)?\)$/i.exec(
      text
    )
  if (!functional) return null

  const channels = [functional[1], functional[2], functional[3]].map((part) =>
    clampChannel(Number(part))
  )
  if (channels.some((channel) => Number.isNaN(channel))) return null

  return {
    rgb: channels as [number, number, number],
    alpha: functional[4] === undefined ? undefined : functional[4],
    alphaHex: "",
  }
}

function parseHexColor(digits: string) {
  const pairs =
    digits.length === 3 || digits.length === 4
      ? Array.from(digits, (digit) => digit + digit)
      : digits.length === 6 || digits.length === 8
        ? digits.match(/.{2}/g)!
        : null
  if (!pairs) return null

  return {
    rgb: pairs.slice(0, 3).map((pair) => parseInt(pair, 16)) as [
      number,
      number,
      number,
    ],
    alpha: undefined,
    alphaHex: pairs[3] ?? "",
  }
}

function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number
): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const secondary = chroma * (1 - Math.abs(((hue * 6) % 2) - 1))
  const base = lightness - chroma / 2
  const sector = Math.floor(hue * 6) % 6
  const [r, g, b] = (
    [
      [chroma, secondary, 0],
      [secondary, chroma, 0],
      [0, chroma, secondary],
      [0, secondary, chroma],
      [secondary, 0, chroma],
      [chroma, 0, secondary],
    ] as const
  )[sector]

  return [
    clampChannel(Math.round((r + base) * 255)),
    clampChannel(Math.round((g + base) * 255)),
    clampChannel(Math.round((b + base) * 255)),
  ]
}

function clampChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function toHexPair(value: number) {
  return value.toString(16).padStart(2, "0")
}

/**
 * The four stored pictures the one upload feeds, and the rule for when they are
 * in step with it.
 *
 * `logo` is the only one an admin chooses. The tab icon is the same file, the
 * dark logo and the dark tab icon are both the generated twin, and the browser
 * sizes are cut from those two. Anything that breaks that chain — an install
 * saved before this rule existed, a half-finished save, a twin whose files were
 * swept away — is out of step, and the next settings save rebuilds the lot.
 */
export type BrandImages = {
  logo: string
  logoDark: string
  favicon: string
  faviconDark: string
  faviconSet: PublicFaviconSet | null
}

export function brandImagesAreCurrent(logo: string, saved: BrandImages) {
  if (!logo) {
    return (
      !saved.logo &&
      !saved.logoDark &&
      !saved.favicon &&
      !saved.faviconDark &&
      !saved.faviconSet
    )
  }

  const darkSource = saved.faviconSet?.dark?.source
  return (
    saved.logo === logo &&
    saved.favicon === logo &&
    saved.faviconSet?.light?.source === logo &&
    Boolean(darkSource) &&
    saved.logoDark === darkSource &&
    saved.faviconDark === darkSource
  )
}
