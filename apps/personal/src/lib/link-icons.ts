import { iconNames, type IconName } from "lucide-react/dynamic"

/**
 * Lucide icon names for a link's icon. The pictures are drawn in
 * `components/link-icon.tsx`; the picker is `components/icon-picker.tsx`.
 */

/** The icons the picker shows before anything is searched for. */
export const SUGGESTED_ICONS: IconName[] = [
  "layout-dashboard",
  "list",
  "folder",
  "file-text",
  "newspaper",
  "calendar",
  "users",
  "inbox",
  "chart-column",
  "store",
  "star",
  "settings",
  "link",
  "house",
  "mail",
  "message-square",
  "bell",
  "search",
  "image",
  "video",
  "music",
  "book-open",
  "briefcase",
  "shopping-cart",
  "credit-card",
  "wallet",
  "trending-up",
  "bot",
  "code",
  "globe",
  "map-pin",
  "heart",
  "dumbbell",
  "camera",
  "pen-line",
]

const LUCIDE_NAMES = new Set<string>(iconNames)

export function isLucideIconName(name: string): name is IconName {
  return LUCIDE_NAMES.has(name)
}

/** Every Lucide icon's name, for the picker's search. */
export const ALL_ICON_NAMES: readonly IconName[] = iconNames

/**
 * Reads what Tyler typed as a Lucide icon's name, accepting "OctagonX",
 * "octagon x", "OctagonXIcon" or a lucide.dev address. Undefined when Lucide
 * has no such icon.
 */
export function lucideIconName(value: string): IconName | undefined {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/lucide\.dev\/icons\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/Icon$/, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
  return LUCIDE_NAMES.has(cleaned) ? (cleaned as IconName) : undefined
}

/** "chart-column" reads "Chart Column". */
export function iconLabel(name: string | undefined) {
  if (!name) return "No icon"
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
