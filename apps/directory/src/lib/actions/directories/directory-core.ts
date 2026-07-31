import { isQuickLinkIconValue, type QuickLinkIconName, type QuickLinkIconValue } from "@/lib/utils/site-quick-links"

export const DIRECTORY_CORE_BLOCK_TYPE = "directory-core"

export const DIRECTORY_CORE_MENU_LINK_TYPES = [
  "directions",
  "phone",
  "website",
  "email",
  "claim",
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
  icon?: QuickLinkIconValue
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

function sanitizeDirectoryCoreHref(value?: string | null): string {
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

// The six link kinds and what each one shows. Three lookups over the same keys
// used to be three separate switch statements.
const DIRECTORY_CORE_MENU_TYPES: Record<
  string,
  { label: string; placeholder: string; icon: QuickLinkIconName }
> = {
  directions: {
    label: "Get Directions",
    placeholder: "1245 Broadway, New York, NY or Google Maps URL",
    icon: "map",
  },
  phone: { label: "Phone", placeholder: "+1 607-247-8870", icon: "phone" },
  website: { label: "Website", placeholder: "example.com", icon: "site" },
  email: { label: "Email", placeholder: "hello@example.com", icon: "newsletters" },
  claim: { label: "Claim Listing", placeholder: "Claim Listing", icon: "building" },
  custom: {
    label: "Custom",
    placeholder: "/about or https://example.com",
    icon: "link",
  },
}

export function getDirectoryCoreMenuTypeLabel(type?: string): string {
  return DIRECTORY_CORE_MENU_TYPES[type ?? ""]?.label ?? "Link"
}

export function getDirectoryCoreMenuValuePlaceholder(type?: string): string {
  return DIRECTORY_CORE_MENU_TYPES[type ?? ""]?.placeholder ?? "Value"
}

export function getDirectoryCoreMenuDefaultIcon(type?: string): QuickLinkIconName {
  return DIRECTORY_CORE_MENU_TYPES[type ?? ""]?.icon ?? "link"
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
    case "claim":
      return ""
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
    icon: isQuickLinkIconValue(rawLink.icon) ? rawLink.icon : undefined,
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
    address: typeof nextContent.address === "string" ? nextContent.address : "",
    rating: typeof nextContent.rating === "number" || typeof nextContent.rating === "string" ? nextContent.rating : "",
    claimEnabled: nextContent.claimEnabled !== false,
    claimButtonText: typeof nextContent.claimButtonText === "string" ? nextContent.claimButtonText : "Claim Listing",
    claimPendingEmailText: typeof nextContent.claimPendingEmailText === "string" ? nextContent.claimPendingEmailText : "Check Business Email",
    claimPendingReviewText: typeof nextContent.claimPendingReviewText === "string" ? nextContent.claimPendingReviewText : "Claim Pending Review",
    claimApprovedText: typeof nextContent.claimApprovedText === "string" ? nextContent.claimApprovedText : "Edit Listing",
    saveIconOpacity: typeof nextContent.saveIconOpacity === "number" ? Math.min(100, Math.max(0, nextContent.saveIconOpacity)) : 100,
    visibility,
  }
}
