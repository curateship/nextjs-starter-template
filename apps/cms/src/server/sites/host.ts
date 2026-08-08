import { getRequestHeader } from "@tanstack/react-start/server"

import { cleanSiteSettings } from "@/lib/sites/site-settings"
import { RESERVED_SUBDOMAINS } from "@/lib/sites/subdomain"
import { appUrl } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { LIVE_SITE_STATUSES } from "@/lib/sites/site-status"
import { sites, type SiteRow } from "@/server/sites/schema"

/**
 * Turning the domain a visitor typed into one site.
 *
 * The shell has no middleware and nothing that reads the Host header on the way
 * in, so this is asked for during a render instead. That is fine — it is one
 * lookup against a table with a handful of rows, and the answer is held in
 * memory between requests.
 *
 * **The host is always read here, on the server, and never taken from the
 * browser.** A host in a request body is a value anybody can type, and
 * believing one would let a visitor ask for any site they liked — including a
 * switched-off one.
 */

/** The public face of a site: what a page needs to draw itself, and no more. */
export type ResolvedSite = {
  id: string
  name: string
  subdomain: string
  settings: ReturnType<typeof cleanSiteSettings>
}

/**
 * The domain sites hang off — `example.com`, so a site called alpha answers on
 * `alpha.example.com`.
 *
 * `localhost` in development, because browsers resolve every `*.localhost` name
 * to this machine on their own. That is what makes `alpha.localhost:3015` work
 * with no hosts file and no setup.
 */
export function siteBaseDomain() {
  return (process.env.CMS_SITES_BASE_DOMAIN || "localhost")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
}

/**
 * A host cut back to the bare name: no port, no trailing dot, no `www.`.
 *
 * `www.` comes off here and off a site's saved custom domain too, so the two
 * always meet in the same shape and a visitor who types either one arrives.
 */
export function normalizeHost(host: string | null | undefined) {
  const bare = (host ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")

  return bare.startsWith("www.") ? bare.slice(4) : bare
}

/** The host this deployment itself answers on. */
function platformHost() {
  try {
    return normalizeHost(new URL(appUrl()).hostname)
  } catch {
    return ""
  }
}

/**
 * The label in front of the base domain, or null when this host is not one of
 * ours.
 *
 * Only a single label counts: `alpha.example.com` is a site, `a.b.example.com`
 * is not. Anything deeper would have to answer which of the two names owns it,
 * and there is no good answer.
 */
function subdomainOf(host: string, baseDomain: string) {
  const suffix = `.${baseDomain}`
  if (!host.endsWith(suffix)) return null

  const label = host.slice(0, -suffix.length)
  if (!label || label.includes(".")) return null

  return label
}

/**
 * Whether this host belongs to the deployment rather than to any site.
 *
 * The app's own address, the base domain on its own, and the handful of names
 * kept for the app — none of them can ever be a site, however the sites table
 * looks.
 */
export function isPlatformHost(host: string | null | undefined) {
  const asked = normalizeHost(host)
  if (!asked) return true

  const baseDomain = siteBaseDomain()
  if (asked === baseDomain || asked === platformHost()) return true

  const label = subdomainOf(asked, baseDomain)
  return label !== null && (RESERVED_SUBDOMAINS as readonly string[]).includes(label)
}

type SiteCache = {
  /** The database it was read from, so a test's own database never sees another's rows. */
  database: CustomShellDb
  bySubdomain: Map<string, ResolvedSite>
  byCustomDomain: Map<string, ResolvedSite>
  customDomains: Set<string>
}

let cache: SiteCache | null = null

function toResolvedSite(row: SiteRow): ResolvedSite {
  return {
    id: row.id,
    name: row.name,
    subdomain: row.subdomain,
    settings: cleanSiteSettings(row.settings),
  }
}

/**
 * Forgets what it knows, so the next visitor is answered from the database.
 *
 * Called by every write in `sites.ts`. A site whose address or status just
 * changed must not keep answering the old way, and there is no version of this
 * worth being clever about — the table is small and reading it again is cheap.
 */
export function dropSiteCache() {
  cache = null
}

async function siteCache(database: CustomShellDb): Promise<SiteCache> {
  if (cache && cache.database === database) return cache

  const rows = await database.select().from(sites)
  const next: SiteCache = {
    database,
    bySubdomain: new Map(),
    byCustomDomain: new Map(),
    customDomains: new Set(),
  }

  for (const row of rows) {
    // Every site's custom domain counts as one of ours for the origin check,
    // even a switched-off site's: it is still a name this deployment owns, and
    // refusing it would only make its "we are closed" page fail oddly.
    if (row.customDomain) next.customDomains.add(row.customDomain)

    if (!(LIVE_SITE_STATUSES as readonly string[]).includes(row.status)) continue

    const site = toResolvedSite(row)
    next.bySubdomain.set(row.subdomain, site)
    if (row.customDomain) next.byCustomDomain.set(row.customDomain, site)
  }

  cache = next
  return next
}

/**
 * The site this host belongs to, or null when it belongs to none.
 *
 * A custom domain wins over a subdomain, because a site that has been given its
 * own name is meant to be reached by it. A switched-off site answers nothing —
 * it looks exactly like a site that never existed, which is the point.
 */
export async function resolveSiteByHost(
  host: string | null | undefined,
  database: CustomShellDb = db
): Promise<ResolvedSite | null> {
  const asked = normalizeHost(host)
  if (!asked || isPlatformHost(asked)) return null

  const known = await siteCache(database)

  const byDomain = known.byCustomDomain.get(asked)
  if (byDomain) return byDomain

  const label = subdomainOf(asked, siteBaseDomain())
  return label ? (known.bySubdomain.get(label) ?? null) : null
}

/**
 * Who the request being handled belongs to, from its Host header.
 *
 * Three answers, not two, and the difference matters: an address that belongs
 * to no site is **not** the same as the deployment's own. The platform's front
 * page must keep rendering on the platform's own address, and a subdomain
 * nobody has taken — or one whose site is switched off — has to be a dead
 * address rather than quietly showing the app's own marketing page.
 */
export type HostAnswer =
  | { kind: "platform" }
  | { kind: "site"; site: ResolvedSite }
  | { kind: "unknown" }

export async function answerForRequest(
  database: CustomShellDb = db
): Promise<HostAnswer> {
  const host = getRequestHeader("host")
  if (isPlatformHost(host)) return { kind: "platform" }

  const site = await resolveSiteByHost(host, database)
  return site ? { kind: "site", site } : { kind: "unknown" }
}

/**
 * Whether an address belongs to this deployment, for the shell's origin check.
 *
 * **Synchronous, because the check that calls it is.** It never reads the
 * database: a subdomain of the base domain is ours by definition and needs no
 * lookup at all, and a custom domain is answered from the cache the resolver
 * fills. A page is always drawn before a form on it is submitted, and drawing
 * it fills the cache — so by the time a write arrives from a site's own domain,
 * the answer is already in hand. If it somehow is not, this says no and the
 * write is refused, which is the safe way to be wrong.
 */
export function hostBelongsToThisApp(origin: string) {
  let host: string
  try {
    host = normalizeHost(new URL(origin).hostname)
  } catch {
    return false
  }

  if (!host) return false

  const label = subdomainOf(host, siteBaseDomain())
  if (label && !(RESERVED_SUBDOMAINS as readonly string[]).includes(label)) {
    return true
  }

  return cache?.customDomains.has(host) ?? false
}
