export const SOCIAL_CARD_TYPES = ["summary", "summary_large_image"] as const
export type SocialCardType = (typeof SOCIAL_CARD_TYPES)[number]

export const DEFAULT_SOCIAL_CARD_TYPE: SocialCardType = "summary"
export const MAX_SOCIAL_HANDLE_LENGTH = 15
export const MAX_PUBLIC_SYSTEM_HEADING_LENGTH = 120
export const MAX_PUBLIC_SYSTEM_BODY_LENGTH = 300

export type PublicSystemCopy = {
  notFoundHeading: string
  notFoundBody: string
  maintenanceHeading: string
  maintenanceBody: string
}

export const DEFAULT_NOT_FOUND_HEADING = "That page does not exist"
export const DEFAULT_NOT_FOUND_BODY =
  "We could not find the page you requested."
export const DEFAULT_MAINTENANCE_HEADING = "We will be back soon"
export const DEFAULT_MAINTENANCE_BODY =
  "We are making some improvements and will be back shortly."

export function createDefaultPublicSystemCopy(): PublicSystemCopy {
  return {
    notFoundHeading: "",
    notFoundBody: "",
    maintenanceHeading: "",
    maintenanceBody: "",
  }
}

/** Keeps saved public copy small and plain before an error page renders it. */
export function normalizePublicSystemCopy(value: unknown): PublicSystemCopy {
  const fallback = createDefaultPublicSystemCopy()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }

  const copy = value as Partial<PublicSystemCopy>
  return {
    notFoundHeading: cleanText(
      copy.notFoundHeading,
      MAX_PUBLIC_SYSTEM_HEADING_LENGTH
    ),
    notFoundBody: cleanText(copy.notFoundBody, MAX_PUBLIC_SYSTEM_BODY_LENGTH),
    maintenanceHeading: cleanText(
      copy.maintenanceHeading,
      MAX_PUBLIC_SYSTEM_HEADING_LENGTH
    ),
    maintenanceBody: cleanText(
      copy.maintenanceBody,
      MAX_PUBLIC_SYSTEM_BODY_LENGTH
    ),
  }
}

export function resolveNotFoundCopy(copy: PublicSystemCopy, appName = "") {
  const displayName = appName.trim()
  return {
    heading: copy.notFoundHeading || DEFAULT_NOT_FOUND_HEADING,
    body:
      copy.notFoundBody ||
      (displayName
        ? `${displayName} could not find the page you requested.`
        : DEFAULT_NOT_FOUND_BODY),
  }
}

export function resolveMaintenanceCopy(copy: PublicSystemCopy) {
  return {
    heading: copy.maintenanceHeading || DEFAULT_MAINTENANCE_HEADING,
    body: copy.maintenanceBody || DEFAULT_MAINTENANCE_BODY,
  }
}

export function normalizeSocialCardType(value: unknown): SocialCardType {
  return SOCIAL_CARD_TYPES.includes(value as SocialCardType)
    ? (value as SocialCardType)
    : DEFAULT_SOCIAL_CARD_TYPE
}

/** X handles are stored without their display @ and never exceed X's limit. */
export function normalizeSocialHandle(value: unknown) {
  if (typeof value !== "string") return ""
  const handle = value.trim().replace(/^@+/, "")
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : ""
}

/** The settings input applies the same rule while preserving valid typing. */
export function cleanSocialHandleInput(value: string) {
  return value
    .trimStart()
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, MAX_SOCIAL_HANDLE_LENGTH)
}

/** Only web images are allowed to leave the settings row for a meta tag. */
export function normalizeShareImage(value: unknown) {
  if (typeof value !== "string") return ""
  const image = value.trim().slice(0, 2048)
  try {
    const url = new URL(image)
    return url.protocol === "http:" || url.protocol === "https:" ? image : ""
  } catch {
    return ""
  }
}

/** A changed timestamp gives social services a new address after replacement. */
export function versionedShareImage(image: unknown, version: unknown) {
  const normalized = normalizeShareImage(image)
  if (!normalized || typeof version !== "string" || !version.trim()) {
    return normalized
  }

  const url = new URL(normalized)
  url.searchParams.set("v", version.trim().slice(0, 64))
  return url.toString()
}

export function defaultPublicDescription(appName: string) {
  return `Visit ${appName}.`
}

/** The shared social tags every public route adds to its first response. */
export function publicSocialMeta(input: {
  title: string
  description: string
  image: string
  cardType: SocialCardType
  handle: string
}) {
  return [
    { name: "description", content: input.description },
    { property: "og:title", content: input.title },
    { property: "og:description", content: input.description },
    { name: "twitter:card", content: input.cardType },
    ...(input.handle
      ? [{ name: "twitter:site", content: `@${input.handle}` }]
      : []),
    ...(input.image
      ? [
          { property: "og:image", content: input.image },
          { name: "twitter:image", content: input.image },
        ]
      : []),
  ]
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}
