/**
 * A listing's contact links: an address line, a list of typed links (phone,
 * website, email, directions, custom) and a list of social profiles. Ported
 * from the directory app's Core block, minus the block wrapper around it.
 *
 * **This is the injection surface of the directory feature.** A link is the
 * one place a listing hands the browser something it will follow, so every
 * address goes through `sanitizeContactHref` — on the way into the database
 * and again when a page draws it. A `javascript:` URL is not a link, it is a
 * script, and it is dropped rather than escaped.
 *
 * Browser-safe on purpose: the edit form needs the labels and placeholders,
 * the public page needs the href builders, and the server needs the
 * normalizer, so it lives in `lib` where all three may import it.
 */

export const MENU_LINK_TYPES = [
  "phone",
  "website",
  "email",
  "directions",
  "custom",
] as const

export type MenuLinkType = (typeof MENU_LINK_TYPES)[number]

export type MenuLink = {
  id: string
  type: MenuLinkType
  /** Optional display label; blank means "show the value nicely". */
  label: string
  /** What the admin typed: a number, a domain, an address, a URL. */
  value: string
}

export type SocialLink = {
  id: string
  /** "Instagram", "X", "YouTube" — free text, shown as the link's name. */
  platform: string
  url: string
}

export type ContactLinks = {
  /** The street address line shown on the listing. Plain text. */
  address: string
  menuLinks: MenuLink[]
  socialLinks: SocialLink[]
}

export function emptyContactLinks(): ContactLinks {
  return { address: "", menuLinks: [], socialLinks: [] }
}

/**
 * Schemes a link is never allowed to carry. `javascript:` is the reason the
 * list exists; the rest are the same family of "the browser will do something
 * other than navigate" schemes.
 */
const DANGEROUS_PROTOCOLS = [
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "about:",
  "blob:",
]

function isSafeHref(value: string) {
  const lower = value.trim().toLowerCase()
  if (!lower) return false
  if (DANGEROUS_PROTOCOLS.some((protocol) => lower.startsWith(protocol))) {
    return false
  }
  return (
    /^https?:\/\//i.test(value) ||
    /^mailto:/i.test(value) ||
    /^tel:/i.test(value) ||
    (value.startsWith("/") && !value.startsWith("//"))
  )
}

/** The address if it is safe to follow, or empty — never a "cleaned" version. */
export function sanitizeContactHref(value?: string | null): string {
  const trimmed = value?.trim() || ""
  return trimmed && isSafeHref(trimmed) ? trimmed : ""
}

/**
 * What somebody typed as "the website", made followable: a full URL passes as
 * is, a bare domain gets https:// put in front, and anything unsafe is empty.
 */
export function buildUrlHref(value?: string | null): string {
  const trimmed = value?.trim() || ""
  if (!trimmed) return ""

  const safe = sanitizeContactHref(trimmed)
  if (safe) return safe

  if (!trimmed.includes(":") && !trimmed.startsWith("//")) {
    return `https://${trimmed}`
  }
  return ""
}

/** The link kinds, what each is called, and the hint its value field shows. */
const MENU_TYPE_TEXT: Record<MenuLinkType, { label: string; placeholder: string }> = {
  phone: { label: "Phone", placeholder: "+1 607-247-8870" },
  website: { label: "Website", placeholder: "example.com" },
  email: { label: "Email", placeholder: "hello@example.com" },
  directions: {
    label: "Get directions",
    placeholder: "1245 Broadway, New York, NY or a maps URL",
  },
  custom: { label: "Link", placeholder: "/about or https://example.com" },
}

export function menuTypeLabel(type: MenuLinkType): string {
  return MENU_TYPE_TEXT[type].label
}

export function menuTypePlaceholder(type: MenuLinkType): string {
  return MENU_TYPE_TEXT[type].placeholder
}

function formatPhone(value: string): string {
  const withoutScheme = value.replace(/^tel:/i, "").trim()
  const digits = withoutScheme.replace(/\D/g, "")
  const local =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
  }
  return withoutScheme
}

function formatWebsite(value: string): string {
  const host = value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
  return host || value
}

/**
 * What the link shows: a custom label wins, otherwise the value said nicely —
 * a phone number formatted, a website as its bare domain — and the type's own
 * name as the last resort.
 */
export function menuLinkLabel(link: MenuLink): string {
  const label = link.label.trim()
  if (label) return label

  const value = link.value.trim()
  if (value) {
    switch (link.type) {
      case "phone":
        return formatPhone(value)
      case "website":
        return formatWebsite(value)
      case "email":
        return value.replace(/^mailto:/i, "")
      case "directions":
        if (!value.includes(":") && !value.startsWith("//")) return value
        break
    }
  }
  return menuTypeLabel(link.type)
}

/**
 * Where the link goes, or empty when it cannot safely go anywhere. A typed
 * street address becomes a maps search; a bare number becomes tel:; a bare
 * email becomes mailto:.
 */
export function menuLinkHref(link: MenuLink): string {
  const value = link.value.trim()
  if (!value) return ""

  switch (link.type) {
    case "directions": {
      const safe = sanitizeContactHref(value)
      if (safe) return safe
      if (value.includes(":") || value.startsWith("//")) return ""
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
    }
    case "phone": {
      if (/^tel:/i.test(value)) return sanitizeContactHref(value)
      const digits = value.replace(/[^\d+]/g, "")
      return digits ? `tel:${digits}` : ""
    }
    case "email": {
      if (/^mailto:/i.test(value)) return sanitizeContactHref(value)
      return value.includes("@") ? `mailto:${value}` : ""
    }
    case "website":
    case "custom":
      return buildUrlHref(value)
  }
}

/** A social link's target, made followable the same way a website is. */
export function socialLinkHref(link: SocialLink): string {
  return buildUrlHref(link.url)
}

const MAX_LINKS = 20
const MAX_TEXT = 300

/**
 * Addresses get their own, much longer cap. A maps link with the place and
 * its coordinates encoded into it runs well past 300 characters, and cutting
 * one short does not shorten a link — it breaks it, silently, in a field
 * nobody will think to check.
 */
const MAX_HREF = 2000

function cleanText(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function cleanMenuLink(raw: unknown, index: number): MenuLink | null {
  if (!raw || typeof raw !== "object") return null
  const link = raw as Record<string, unknown>
  const type = MENU_LINK_TYPES.includes(link.type as MenuLinkType)
    ? (link.type as MenuLinkType)
    : "custom"
  const label = cleanText(link.label, 100)
  const value = cleanText(link.value, MAX_HREF)
  if (!label && !value) return null
  return {
    id:
      typeof link.id === "string" && link.id
        ? link.id.slice(0, 36)
        : `menu-${index + 1}`,
    type,
    label,
    value,
  }
}

function cleanSocialLink(raw: unknown, index: number): SocialLink | null {
  if (!raw || typeof raw !== "object") return null
  const link = raw as Record<string, unknown>
  const platform = cleanText(link.platform, 100)
  const url = cleanText(link.url, MAX_HREF)
  if (!platform && !url) return null
  return {
    id:
      typeof link.id === "string" && link.id
        ? link.id.slice(0, 36)
        : `social-${index + 1}`,
    platform,
    url,
  }
}

/**
 * Whatever arrived, reduced to the shape above: unknown keys dropped, lists
 * capped, text trimmed, and every stored value one the href builders will
 * later be willing to follow or show as text. Run on the way into the
 * database and again on the way out, so a row edited by hand cannot smuggle
 * anything past it.
 */
export function cleanContactLinks(raw: unknown): ContactLinks {
  const input =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}

  const menuLinks = Array.isArray(input.menuLinks)
    ? input.menuLinks
        .slice(0, MAX_LINKS)
        .map(cleanMenuLink)
        .filter((link): link is MenuLink => link !== null)
    : []
  const socialLinks = Array.isArray(input.socialLinks)
    ? input.socialLinks
        .slice(0, MAX_LINKS)
        .map(cleanSocialLink)
        .filter((link): link is SocialLink => link !== null)
    : []

  return {
    address: cleanText(input.address),
    menuLinks,
    socialLinks,
  }
}
