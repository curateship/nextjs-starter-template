import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"

export type PublicNavigationLink = {
  label: string
  href: string
}

export type PublicNavigationSearchItem = {
  type: "search"
  visible: boolean
}

export type PublicNavigationGroup = {
  type: "group"
  label: string
  links: PublicNavigationLink[]
}

export type PublicNavigationItem =
  | PublicNavigationLink
  | PublicNavigationSearchItem
  | PublicNavigationGroup

export const MAX_PUBLIC_FOOTER_LINKS = 20
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
  return !("type" in item)
}

export function isPublicNavigationGroup(
  item: PublicNavigationItem
): item is PublicNavigationGroup {
  return "type" in item && item.type === "group"
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
    .slice(0, MAX_PUBLIC_FOOTER_LINKS)
    .flatMap((item) => cleanPublicNavigationLink(item) ?? [])
}

/** Keeps safe links and exactly one draggable search item. */
export function cleanPublicNavigationItems(
  value: unknown
): PublicNavigationItem[] {
  if (!Array.isArray(value)) return createDefaultPublicNavigation()

  let hasSearch = false
  const items: PublicNavigationItem[] = []

  for (const item of value) {
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

    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as { type?: unknown }).type === "group"
    ) {
      const group = item as { label?: unknown; links?: unknown }
      const label = cleanPublicNavigationLabel(group.label)
      const links = Array.isArray(group.links)
        ? group.links.flatMap((link) => cleanPublicNavigationLink(link) ?? [])
        : []
      if (label && links.length) {
        items.push({ type: "group", label, links })
      }
      continue
    }

    const link = cleanPublicNavigationLink(item)
    if (link) {
      items.push(link)
    }
  }

  if (!hasSearch) items.unshift({ type: "search", visible: true })
  return items
}

/** Direct links and each group's links in menu order, with Search left out. */
export function flattenPublicNavigationLinks(
  items: PublicNavigationItem[]
): PublicNavigationLink[] {
  return items.flatMap((item) => {
    if (isPublicNavigationLink(item)) return [item]
    return isPublicNavigationGroup(item) ? item.links : []
  })
}

function cleanPublicNavigationLink(
  value: unknown
): PublicNavigationLink | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const { label, href } = value as { label?: unknown; href?: unknown }
  const cleanLabel = cleanPublicNavigationLabel(label)
  if (typeof href !== "string") return null

  const cleanHref = href.trim().slice(0, MAX_PUBLIC_NAVIGATION_HREF_LENGTH)
  if (!cleanLabel || !cleanHref || !isSafeWrittenPageLink(cleanHref)) {
    return null
  }

  return { label: cleanLabel, href: cleanHref }
}

function cleanPublicNavigationLabel(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_PUBLIC_NAVIGATION_LABEL_LENGTH)
    : ""
}

export function cleanPublicFooterCopyright(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH)
    : ""
}
