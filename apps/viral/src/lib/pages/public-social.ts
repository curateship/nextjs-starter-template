/**
 * The social accounts shown as buttons in the public footer.
 *
 * The platform is a fixed list rather than free text, because each one is
 * drawn with its own mark and a name nobody typed could be drawn at all. The
 * stored key never changes even when the label does: `twitter` is still the
 * saved key of the account now labelled X, and renaming it would empty the
 * footer of every site that saved one.
 */
export const PUBLIC_SOCIAL_PLATFORMS = [
  "twitter",
  "linkedin",
  "facebook",
  "instagram",
  "threads",
  "youtube",
  "tiktok",
  "github",
  "medium",
  "substack",
] as const

export type PublicSocialPlatform = (typeof PUBLIC_SOCIAL_PLATFORMS)[number]

export const PUBLIC_SOCIAL_PLATFORM_LABELS: Record<
  PublicSocialPlatform,
  string
> = {
  twitter: "X",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  youtube: "YouTube",
  tiktok: "TikTok",
  github: "GitHub",
  medium: "Medium",
  substack: "Substack",
}

export type PublicSocialLink = {
  platform: PublicSocialPlatform
  url: string
}

export const MAX_PUBLIC_SOCIAL_LINKS = 8
export const MAX_PUBLIC_SOCIAL_URL_LENGTH = 2_048

export const PUBLIC_SOCIAL_LINKS_FULL_MESSAGE =
  `A footer can show ${MAX_PUBLIC_SOCIAL_LINKS} social accounts. Delete one before adding another.`
export const PUBLIC_SOCIAL_URL_MESSAGE =
  "A social account address starts with https://."

/**
 * A social account address is always somewhere else, so only `http:` and
 * `https:` are kept. Anything else, `javascript:` above all, is dropped rather
 * than handed to a browser.
 */
export function normalizePublicSocialUrl(value: unknown) {
  const url =
    typeof value === "string"
      ? value.trim().slice(0, MAX_PUBLIC_SOCIAL_URL_LENGTH)
      : ""
  if (!url) return ""

  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : ""
  } catch {
    return ""
  }
}

/**
 * Reads the saved accounts field by field. An account without a platform this
 * app can draw, or without a usable address, is left out, so a hand-edited
 * setting never leaves a button that goes nowhere.
 */
export function normalizePublicSocialLinks(value: unknown): PublicSocialLink[] {
  if (!Array.isArray(value)) return []

  const links: PublicSocialLink[] = []
  for (const raw of value) {
    if (links.length >= MAX_PUBLIC_SOCIAL_LINKS) break
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue

    const source = raw as Record<string, unknown>
    const platform =
      typeof source.platform === "string"
        ? source.platform.trim().toLowerCase()
        : ""
    if (!PUBLIC_SOCIAL_PLATFORMS.includes(platform as PublicSocialPlatform)) {
      continue
    }

    const url = normalizePublicSocialUrl(source.url)
    if (!url) continue

    links.push({ platform: platform as PublicSocialPlatform, url })
  }

  return links
}
