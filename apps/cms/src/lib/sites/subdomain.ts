/**
 * What a site's address may be, written once so the admin form and the server
 * refuse the same things for the same reasons.
 *
 * Browser-safe on purpose: the dialog shows the address as it is typed and says
 * why a bad one is bad, and the server checks the same rules again before it
 * writes. Neither trusts the other.
 */

/** The shortest and longest a subdomain label may be, from the DNS rules. */
export const MIN_SUBDOMAIN = 3
export const MAX_SUBDOMAIN = 63

/** The longest a custom domain may be. */
export const MAX_CUSTOM_DOMAIN = 253

/**
 * Names the deployment itself answers to, so none of them can become a site.
 *
 * `www` and `app` are the app's own front door, `api` is where its endpoints
 * live, and `admin` is the screen this very form is on — a site on any of them
 * would take an address the deployment needs for itself.
 */
export const RESERVED_SUBDOMAINS = ["www", "api", "admin", "app"] as const

/** Lowercase, no spaces, no dots — one DNS label and nothing else. */
const SUBDOMAIN_SHAPE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/** A dotted name with a real ending, e.g. `joes-diner.com`. */
const DOMAIN_SHAPE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

/** Tidies what somebody typed, without judging it. */
export function cleanSubdomain(value: string) {
  return value.trim().toLowerCase()
}

/**
 * Why this subdomain cannot be used, or null when it can.
 *
 * A sentence rather than a code, because it is shown to the admin who typed it
 * and there is nothing to translate it into.
 */
export function subdomainProblem(value: string): string | null {
  const subdomain = cleanSubdomain(value)

  if (!subdomain) return "A site needs an address."
  if (subdomain.length < MIN_SUBDOMAIN) {
    return `An address needs at least ${MIN_SUBDOMAIN} characters.`
  }
  if (subdomain.length > MAX_SUBDOMAIN) {
    return `An address can be at most ${MAX_SUBDOMAIN} characters.`
  }
  if (!SUBDOMAIN_SHAPE.test(subdomain)) {
    return "An address can use lowercase letters, numbers and hyphens, and has to start and end with a letter or number."
  }
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(subdomain)) {
    return `“${subdomain}” is kept for the app itself. Please pick another address.`
  }

  return null
}

/**
 * Strips a custom domain back to the bare host.
 *
 * People paste what is in their browser bar, so an address, a port, a path and
 * a trailing dot all have to come off. `www.` goes too, and the same happens to
 * every host on the way in — otherwise a site saved as `www.joes.com` would
 * never match a visitor who typed `joes.com`, or the other way round.
 */
export function cleanCustomDomain(value: string) {
  const bare = value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "")
    .replace(/:\d+$/, "")

  return bare.startsWith("www.") ? bare.slice(4) : bare
}

/** Why this custom domain cannot be used, or null when it can. Empty is fine. */
export function customDomainProblem(value: string): string | null {
  const domain = cleanCustomDomain(value)

  if (!domain) return null
  if (domain.length > MAX_CUSTOM_DOMAIN) {
    return `A domain can be at most ${MAX_CUSTOM_DOMAIN} characters.`
  }
  if (!DOMAIN_SHAPE.test(domain)) {
    return "That does not look like a domain. A domain looks like joes-diner.com."
  }

  return null
}

/** The address a site answers on, for showing next to the field as it is typed. */
export function siteAddress(subdomain: string, baseDomain: string) {
  return `${cleanSubdomain(subdomain) || "your-site"}.${baseDomain}`
}
