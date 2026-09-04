import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"

export type PublicNavigationLink = {
  label: string
  href: string
}

export type PublicNavigationSearchItem = {
  type: "search"
  visible: boolean
}

export type PublicNavigationItem =
  | PublicNavigationLink
  | PublicNavigationSearchItem

export const MAX_PUBLIC_NAVIGATION_LINKS = 20
export const MAX_PUBLIC_NAVIGATION_ITEMS = MAX_PUBLIC_NAVIGATION_LINKS + 1
export const MAX_PUBLIC_NAVIGATION_LABEL_LENGTH = 120
export const MAX_PUBLIC_NAVIGATION_HREF_LENGTH = 2_048
export const MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH = 300

export function createDefaultPublicNavigation(): PublicNavigationItem[] {
  return [{ type: "search", visible: true }]
}

export function isPublicNavigationSearchItem(
  item: PublicNavigationItem
): item is PublicNavigationSearchItem {
  return "type" in item && item.type === "search"
}

export function isPublicNavigationLink(
  item: PublicNavigationItem
): item is PublicNavigationLink {
  return !isPublicNavigationSearchItem(item)
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

/** Keeps safe links and exactly one draggable search item. */
export function cleanPublicNavigationItems(
  value: unknown
): PublicNavigationItem[] {
  if (!Array.isArray(value)) return createDefaultPublicNavigation()

  let hasSearch = false
  let linkCount = 0
  const items: PublicNavigationItem[] = []

  for (const item of value.slice(0, MAX_PUBLIC_NAVIGATION_ITEMS)) {
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as { type?: unknown }).type === "search"
    ) {
      if (!hasSearch) {
        items.push({
          type: "search",
          visible: (item as { visible?: unknown }).visible !== false,
        })
        hasSearch = true
      }
      continue
    }

    const [link] = cleanPublicNavigationLinks([item])
    if (link && linkCount < MAX_PUBLIC_NAVIGATION_LINKS) {
      items.push(link)
      linkCount += 1
    }
  }

  if (!hasSearch) items.unshift({ type: "search", visible: true })
  return items
}

export function cleanPublicFooterCopyright(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH)
    : ""
}
