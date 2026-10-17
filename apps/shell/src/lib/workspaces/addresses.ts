/**
 * What a workspace's address may be, written once so the admin form and the
 * server refuse the same things for the same reasons.
 *
 * Browser-safe on purpose: the form shows the address as it is typed and says
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

  if (!subdomain) return "A workspace needs an address."
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

/**
 * What a workspace answers on, worked out once for everything that shows it.
 *
 * The sidebar switcher and the workspaces table both print this, and they used
 * to each work it out themselves — so changing the rule meant remembering to
 * change it twice. `kind` is here because the two cases are not the same thing:
 * a domain of its own is the real address, and the subdomain is what it falls
 * back to until somebody sets one.
 *
 * `name` is the last resort. Where the deployment has no base domain there is
 * no address to print at all, and repeating the workspace's own name reads
 * better than an empty cell.
 */
export type WorkspaceListedAddress = {
  kind: "domain" | "subdomain" | "name"
  text: string
}

export function workspaceListedAddress(
  workspace: { name: string; subdomain: string; customDomain: string },
  baseDomain: string
): WorkspaceListedAddress {
  const domain = workspace.customDomain.trim()
  if (domain) return { kind: "domain", text: domain }
  if (baseDomain) {
    return { kind: "subdomain", text: `${workspace.subdomain}.${baseDomain}` }
  }
  return { kind: "name", text: workspace.name }
}

/**
 * The address a workspace answers on, for showing beside the field as it is typed.
 *
 * `standIn` is what fills the gap before anything is typed. It is a parameter
 * rather than a fixed word so an app that calls a workspace something else can
 * hand its own word in; the default keeps the shell reading as it always has.
 */
export function workspaceAddress(
  subdomain: string,
  baseDomain: string,
  standIn = "your-workspace"
) {
  return `${cleanSubdomain(subdomain) || standIn}.${baseDomain}`
}

/**
 * Where a link to a workspace's public pages goes, without the path: an origin
 * such as `https://joes.com`, or empty when the page's own host is the right
 * one.
 *
 * **A workspace's own domain is used only from a deployment.** On a
 * developer's machine the site being edited is the one on this machine, and
 * `joes.com` points at the live server. Opening it from localhost showed the
 * live site to somebody who had come to look at their own edits. Local goes to
 * `joes.localhost:3002` instead, which browsers resolve here with no hosts
 * file.
 *
 * **Empty with no base domain**, because one deployment then serves one site
 * and every host is it, so a plain path is already right.
 *
 * `browserOrigin` is empty while the server draws the page, which has no
 * window to ask. The link is then drawn without the port and put right as soon
 * as the page is running in the browser.
 */
export function workspacePublicOrigin(
  workspace: { subdomain: string; customDomain: string },
  baseDomain: string,
  browserOrigin: string
): string {
  const currentOrigin = browserOrigin ? new URL(browserOrigin) : null
  const local = currentOrigin?.hostname.endsWith("localhost") ?? false

  if (!local && workspace.customDomain) {
    return `https://${workspace.customDomain}`
  }
  if (!baseDomain) return ""

  const protocol =
    currentOrigin?.protocol ?? (baseDomain === "localhost" ? "http:" : "https:")
  const port = currentOrigin?.port ? `:${currentOrigin.port}` : ""
  return `${protocol}//${workspace.subdomain}.${baseDomain}${port}`
}
