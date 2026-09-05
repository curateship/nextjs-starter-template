export const PUBLIC_HEADER_MENU_ALIGNMENTS = ["left", "center"] as const
export type PublicHeaderMenuAlignment =
  (typeof PUBLIC_HEADER_MENU_ALIGNMENTS)[number]

export const PUBLIC_HEADER_LOGO_SIZES = [
  "small",
  "standard",
  "large",
] as const
export type PublicHeaderLogoSize = (typeof PUBLIC_HEADER_LOGO_SIZES)[number]

export type PublicHeader = {
  /** Keeps the full public header at the top while the visitor scrolls. */
  sticky: boolean
  /** Keeps menu links in their usual flow or centres them on desktop. */
  menuAlignment: PublicHeaderMenuAlignment
  /** One of the three fixed logo sizes offered in Settings. */
  logoSize: PublicHeaderLogoSize
}

export function createDefaultPublicHeader(): PublicHeader {
  return {
    sticky: false,
    menuAlignment: "left",
    logoSize: "standard",
  }
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
  }
}
