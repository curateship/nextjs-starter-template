/**
 * Which service a tracked account is on, and how an address typed into the
 * "Add a creator" window turns into a handle.
 *
 * X only, and permanently: Tyler ruled out Instagram, YouTube and TikTok.
 * The column still names the platform so a stored row says what it is rather
 * than leaving the reader to assume.
 */
export type SocialPlatform = "x"

export const SOCIAL_PLATFORM: SocialPlatform = "x"

/** The hosts an X address can arrive on. */
const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
])

/**
 * Paths on x.com that are the site's own, not somebody's account. Pasting
 * `https://x.com/home` is a mistake worth naming rather than tracking an
 * account called "home".
 */
const X_RESERVED = new Set([
  "home",
  "explore",
  "notifications",
  "messages",
  "settings",
  "search",
  "i",
  "intent",
  "compose",
  "login",
  "signup",
  "about",
  "tos",
  "privacy",
])

/** X's own rule: 1 to 15 letters, digits or underscores. */
const HANDLE = /^[A-Za-z0-9_]{1,15}$/

/** Thrown with a code the API turns into a sentence. */
export class SocialHandleError extends Error {}

/**
 * Whether this looks like a web address rather than a bare handle. Used to
 * decide whether the server has to run it past the private-address check
 * before anything else happens.
 */
function looksLikeAddress(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.startsWith("@")) return false
  return (
    trimmed.includes("://") || trimmed.includes("/") || trimmed.includes(".")
  )
}

/**
 * The handle out of anything a person is likely to paste: a full address, an
 * address with a query string or a trailing slash, a link to one post, an
 * @name, or the bare name.
 *
 * The answer keeps the capitals it was given, because that is how the creator
 * writes their own name. Everything that has to match ignores case.
 */
export function readSocialHandle(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new SocialHandleError("SOCIAL_HANDLE_EMPTY")

  if (!looksLikeAddress(trimmed)) {
    const bare = trimmed.replace(/^@/, "")
    if (!HANDLE.test(bare)) throw new SocialHandleError("SOCIAL_HANDLE_BAD")
    if (X_RESERVED.has(bare.toLowerCase())) {
      throw new SocialHandleError("SOCIAL_HANDLE_NOT_AN_ACCOUNT")
    }
    return bare
  }

  const url = readAddress(trimmed)
  if (!X_HOSTS.has(url.hostname.toLowerCase())) {
    throw new SocialHandleError("SOCIAL_HANDLE_NOT_X")
  }
  const first = url.pathname.split("/").filter(Boolean)[0] ?? ""
  const bare = decodeURIComponent(first).replace(/^@/, "")
  if (!HANDLE.test(bare)) throw new SocialHandleError("SOCIAL_HANDLE_BAD")
  if (X_RESERVED.has(bare.toLowerCase())) {
    throw new SocialHandleError("SOCIAL_HANDLE_NOT_AN_ACCOUNT")
  }
  return bare
}

/**
 * The pasted address as a complete URL, or null when a bare handle was typed
 * and there is no address to check. `x.com/sam` gains the https it left out,
 * so a host without a scheme is still checked rather than waved through.
 */
export function socialAddressToCheck(value: string): string | null {
  const trimmed = value.trim()
  if (!looksLikeAddress(trimmed)) return null
  return readAddress(trimmed).toString()
}

/** Where the creator's own page is. */
export function socialProfileUrl(handle: string): string {
  return `https://x.com/${handle}`
}

function readAddress(value: string): URL {
  const withScheme = value.includes("://") ? value : `https://${value}`
  try {
    return new URL(withScheme)
  } catch {
    throw new SocialHandleError("SOCIAL_HANDLE_BAD")
  }
}
