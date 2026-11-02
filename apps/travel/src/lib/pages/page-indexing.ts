/**
 * The two search-engine controls a written page owns.
 *
 * **Hidden from search** means the page carries `noindex` and is left out of
 * the sitemap. It is not a lock. The page still loads for anyone with the
 * link, and who may open it is the visibility setting, which is a different
 * switch on a different screen.
 *
 * **Canonical address** names the address that counts when the same words
 * answer on more than one address, so the site does not compete with itself.
 */

export const MAX_CANONICAL_URL_LENGTH = 2048

/** Only ever used to parse a path. Nothing resolved against it is stored. */
const PATH_PROBE_ORIGIN = "https://canonical.invalid"

/**
 * What gets stored, from whatever was typed.
 *
 * An address on this same site is kept as a path and resolved against the
 * domain the visitor used, which is the only answer that stays right on a
 * deployment serving several domains. A full web address is kept whole,
 * because pointing at another site is the reason the field exists.
 *
 * Anything else becomes empty rather than being stored and silently ignored:
 * a half-written address in a `<link rel="canonical">` tells a search engine
 * to count a page that does not exist.
 */
export function normalizeCanonicalUrl(value: unknown): string {
  if (typeof value !== "string") return ""
  const typed = value.trim().slice(0, MAX_CANONICAL_URL_LENGTH)
  if (!typed) return ""

  if (typed.startsWith("/")) {
    // Parsed against a stand-in domain so the browser's own rules decide what
    // is a path. "//example.com" is a protocol-relative address rather than a
    // path on this site, and it changes the origin, which is how it is caught.
    try {
      const probe = new URL(typed, PATH_PROBE_ORIGIN)
      if (probe.origin !== PATH_PROBE_ORIGIN) return ""
      // Collapsed and untrailed the same way a written page's own address is,
      // so "/about/" and "/about" cannot become two different claims.
      const collapsed = probe.pathname.replace(/\/{2,}/g, "/")
      const path =
        collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed
      // A fragment is never part of an address a search engine counts.
      const address = `${path}${probe.search}`
      return address.length <= MAX_CANONICAL_URL_LENGTH ? address : ""
    } catch {
      return ""
    }
  }

  try {
    const url = new URL(typed)
    if (url.protocol !== "http:" && url.protocol !== "https:") return ""
    if (url.username || url.password) return ""
    // Encoding can make a parsed address longer than what was typed, and the
    // column is 2048 wide. Refusing here turns that into the same sentence
    // every other bad address gets, rather than a raw database error.
    return url.href.length <= MAX_CANONICAL_URL_LENGTH ? url.href : ""
  } catch {
    return ""
  }
}

/** Why the typed canonical address cannot be used, or null when it can. */
export function canonicalUrlProblem(value: string): string | null {
  if (!value.trim()) return null
  return normalizeCanonicalUrl(value)
    ? null
    : "A canonical address is either an address on this site, like /about, or a full one, like https://example.com/about."
}

/**
 * The address the tag actually carries, or empty for no tag at all.
 *
 * A stored path becomes a full address on the domain the visitor used. A
 * stored full address is handed through untouched.
 */
export function resolveCanonicalUrl(origin: string, stored: string): string {
  const canonical = normalizeCanonicalUrl(stored)
  if (!canonical) return ""
  if (!canonical.startsWith("/")) return canonical

  try {
    return new URL(canonical, origin).href
  } catch {
    return ""
  }
}
