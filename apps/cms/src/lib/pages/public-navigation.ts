import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"

export type PublicNavigationLink = {
  label: string
  href: string
}

export const MAX_PUBLIC_NAVIGATION_LINKS = 20
export const MAX_PUBLIC_NAVIGATION_LABEL_LENGTH = 120
export const MAX_PUBLIC_NAVIGATION_HREF_LENGTH = 2_048
export const MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH = 300

/** Same-site links use the app router; every allowed non-slash address leaves it. */
export function isInternalPublicNavigationHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//")
}

/**
 * Keeps only complete, safe public links. This runs on reads as well as writes,
 * so a hand-edited row can never put an executable address into the page.
 */
export function cleanPublicNavigationLinks(
  value: unknown
): PublicNavigationLink[] {
  if (!Array.isArray(value)) return []

  return value
    .slice(0, MAX_PUBLIC_NAVIGATION_LINKS)
    .flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return []

      const { label, href } = item as { label?: unknown; href?: unknown }
      if (typeof label !== "string" || typeof href !== "string") return []

      const cleanLabel = label.trim().slice(0, MAX_PUBLIC_NAVIGATION_LABEL_LENGTH)
      const cleanHref = href.trim().slice(0, MAX_PUBLIC_NAVIGATION_HREF_LENGTH)
      if (!cleanLabel || !cleanHref || !isSafeWrittenPageLink(cleanHref)) {
        return []
      }

      return [{ label: cleanLabel, href: cleanHref }]
    })
}

export function cleanPublicFooterCopyright(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH)
    : ""
}
