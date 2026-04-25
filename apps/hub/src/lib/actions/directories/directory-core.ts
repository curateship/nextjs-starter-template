import type { QuickLinkIconName } from "@/lib/utils/site-quick-links"

export const DIRECTORY_CORE_BLOCK_TYPE = "directory-core"

export const DIRECTORY_CORE_MENU_LINK_TYPES = [
  "directions",
  "phone",
  "website",
  "email",
  "custom",
] as const

export type DirectoryCoreMenuLinkType = typeof DIRECTORY_CORE_MENU_LINK_TYPES[number]

export interface DirectoryCoreSocialLink {
  id?: string
  platform: string
  url: string
}

export interface DirectoryCoreMenuLink {
  id?: string
  type: DirectoryCoreMenuLinkType
  label?: string
  value?: string
  icon?: QuickLinkIconName
}

const DANGEROUS_PROTOCOLS = [
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "about:",
  "blob:",
]

function isSafeCoreHref(value: string) {
  const lowerValue = value.trim().toLowerCase()
  if (!lowerValue) return false
  if (DANGEROUS_PROTOCOLS.some((protocol) => lowerValue.startsWith(protocol))) return false

  return (
    /^https?:\/\//i.test(value) ||
    /^mailto:/i.test(value) ||
    /^tel:/i.test(value) ||
    (value.startsWith("/") && !value.startsWith("//"))
  )
}

export function sanitizeDirectoryCoreHref(value?: string | null): string {
  const trimmedValue = value?.trim() || ""
  return trimmedValue && isSafeCoreHref(trimmedValue) ? trimmedValue : ""
}

export function buildDirectoryCoreUrlHref(value?: string | null): string {
  const trimmedValue = value?.trim() || ""
  if (!trimmedValue) return ""

  const safeHref = sanitizeDirectoryCoreHref(trimmedValue)
  if (safeHref) return safeHref

  if (!trimmedValue.includes(":") && !trimmedValue.startsWith("//")) {
    return `https://${trimmedValue}`
  }

  return ""
}

export function getDirectoryCoreMenuTypeLabel(type?: string): string {
  switch (type) {
    case "directions":
      return "Get Directions"
    case "phone":
      return "Phone"
    case "website":
      return "Website"
    case "email":
      return "Email"
    case "custom":
      return "Custom"
    default:
      return "Link"
  }
}

export function getDirectoryCoreMenuValuePlaceholder(type?: string): string {
  switch (type) {
    case "directions":
      return "1245 Broadway, New York, NY or Google Maps URL"
    case "phone":
      return "+1 607-247-8870"
    case "email":
      return "hello@example.com"
    case "website":
      return "example.com"
    case "custom":
      return "/about or https://example.com"
    default:
      return "Value"
  }
}

export function getDirectoryCoreMenuDefaultIcon(type?: string): QuickLinkIconName {
  switch (type) {
    case "directions":
      return "map"
    case "phone":
      return "phone"
    case "email":
      return "newsletters"
    case "website":
      return "site"
    case "custom":
      return "link"
    default:
      return "link"
  }
}

export function getDirectoryCoreMenuLabel(link: DirectoryCoreMenuLink): string {
  const label = link.label?.trim()
  if (label) return label
  return getDirectoryCoreMenuTypeLabel(link.type)
}

export function buildDirectoryCoreMenuHref(link: DirectoryCoreMenuLink): string {
  const value = link.value?.trim() || ""
  if (!value) return ""

  switch (link.type) {
    case "directions": {
      const safeHref = sanitizeDirectoryCoreHref(value)
      if (safeHref) return safeHref
      if (value.includes(":") || value.startsWith("//")) return ""
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
    }
    case "phone": {
      if (/^tel:/i.test(value)) return sanitizeDirectoryCoreHref(value)
      const phoneValue = value.replace(/[^\d+]/g, "")
      return phoneValue ? `tel:${phoneValue}` : ""
    }
    case "email": {
      if (/^mailto:/i.test(value)) return sanitizeDirectoryCoreHref(value)
      return value.includes("@") ? `mailto:${value}` : ""
    }
    case "website":
    case "custom":
      return buildDirectoryCoreUrlHref(value)
  }
}

function createCoreListItemId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`
}

export function normalizeDirectoryCoreMenuLink(
  link: unknown,
  index: number
): DirectoryCoreMenuLink | null {
  if (!link || typeof link !== "object") return null

  const rawLink = link as Record<string, unknown>
  const type = DIRECTORY_CORE_MENU_LINK_TYPES.includes(rawLink.type as DirectoryCoreMenuLinkType)
    ? rawLink.type as DirectoryCoreMenuLinkType
    : "custom"
  const value = typeof rawLink.value === "string" ? rawLink.value : ""

  return {
    id: typeof rawLink.id === "string" && rawLink.id ? rawLink.id : createCoreListItemId("menu", index),
    type,
    label: typeof rawLink.label === "string" ? rawLink.label : "",
    value,
    icon: typeof rawLink.icon === "string" ? rawLink.icon as QuickLinkIconName : undefined,
  }
}

export function normalizeDirectoryCoreSocialLink(
  link: unknown,
  index: number
): DirectoryCoreSocialLink | null {
  if (!link || typeof link !== "object") return null

  const rawLink = link as Record<string, unknown>
  const platform = typeof rawLink.platform === "string" ? rawLink.platform : ""
  const url = typeof rawLink.url === "string" ? rawLink.url : ""

  if (!platform && !url) return null

  return {
    id: typeof rawLink.id === "string" && rawLink.id ? rawLink.id : createCoreListItemId("social", index),
    platform,
    url,
  }
}

export function normalizeDirectoryCoreContent(
  content?: Record<string, unknown> | null
): Record<string, unknown> {
  const nextContent = content && typeof content === "object" ? content : {}

  const visibility = nextContent.visibility && typeof nextContent.visibility === "object"
    ? nextContent.visibility as Record<string, boolean>
    : {}

  return {
    layoutColumn: nextContent.layoutColumn,
    sticky: nextContent.sticky === true,
    socialLinks: Array.isArray(nextContent.socialLinks)
      ? nextContent.socialLinks.map(normalizeDirectoryCoreSocialLink).filter(Boolean)
      : [],
    menuLinks: Array.isArray(nextContent.menuLinks)
      ? nextContent.menuLinks.map(normalizeDirectoryCoreMenuLink).filter(Boolean)
      : [],
    visibility,
  }
}
