export const PUBLIC_HEADER_MENU_ALIGNMENTS = ["left", "center"] as const
export type PublicHeaderMenuAlignment =
  (typeof PUBLIC_HEADER_MENU_ALIGNMENTS)[number]

export const PUBLIC_HEADER_LOGO_SIZES = [
  "small",
  "standard",
  "large",
] as const
export type PublicHeaderLogoSize = (typeof PUBLIC_HEADER_LOGO_SIZES)[number]

/** How strongly the see-through header blurs the page scrolling under it. */
export const PUBLIC_HEADER_BLURS = ["none", "light", "medium", "heavy"] as const
export type PublicHeaderBlur = (typeof PUBLIC_HEADER_BLURS)[number]

export const PUBLIC_HEADER_BLUR_LABELS: Record<PublicHeaderBlur, string> = {
  none: "None",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
}

/** The same range the directory app offers for its navigation width. */
export const MIN_PUBLIC_HEADER_WIDTH = 320
export const MAX_PUBLIC_HEADER_WIDTH = 2560

export type PublicHeader = {
  /** Keeps the full public header at the top while the visitor scrolls. */
  sticky: boolean
  /** Keeps menu links in their usual flow or centres them on desktop. */
  menuAlignment: PublicHeaderMenuAlignment
  /** One of the three fixed logo sizes offered in Settings. */
  logoSize: PublicHeaderLogoSize
  /** Spreads the header's contents across the whole window. */
  fullWidth: boolean
  /**
   * The widest the header's contents become, in pixels. Null follows the page
   * width in Styling, which is what every header did before this setting, so a
   * site saved earlier keeps its header exactly where it was.
   */
  width: number | null
  /** Medium is the blur the header always had. */
  blur: PublicHeaderBlur
}

export function createDefaultPublicHeader(): PublicHeader {
  return {
    sticky: false,
    menuAlignment: "left",
    logoSize: "standard",
    fullWidth: false,
    width: null,
    blur: "medium",
  }
}

function isPublicHeaderWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_PUBLIC_HEADER_WIDTH &&
    value <= MAX_PUBLIC_HEADER_WIDTH
  )
}

export function normalizePublicHeader(value: unknown): PublicHeader {
  const fallback = createDefaultPublicHeader()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }

  const header = value as Partial<PublicHeader>
  return {
    sticky:
      typeof header.sticky === "boolean" ? header.sticky : fallback.sticky,
    menuAlignment: PUBLIC_HEADER_MENU_ALIGNMENTS.includes(
      header.menuAlignment as PublicHeaderMenuAlignment
    )
      ? (header.menuAlignment as PublicHeaderMenuAlignment)
      : fallback.menuAlignment,
    logoSize: PUBLIC_HEADER_LOGO_SIZES.includes(
      header.logoSize as PublicHeaderLogoSize
    )
      ? (header.logoSize as PublicHeaderLogoSize)
      : fallback.logoSize,
    fullWidth:
      typeof header.fullWidth === "boolean"
        ? header.fullWidth
        : fallback.fullWidth,
    width: isPublicHeaderWidth(header.width) ? header.width : fallback.width,
    blur: PUBLIC_HEADER_BLURS.includes(header.blur as PublicHeaderBlur)
      ? (header.blur as PublicHeaderBlur)
      : fallback.blur,
  }
}
