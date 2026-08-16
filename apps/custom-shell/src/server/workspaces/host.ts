import { getRequestHeader } from "@tanstack/react-start/server"

import { RESERVED_SUBDOMAINS } from "@/lib/workspaces/addresses"
import { LIVE_WORKSPACE_STATUSES } from "@/lib/workspaces/status"
import { appUrl } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { customShellWorkspaces, type CustomShellWorkspace } from "@/server/schema"

/**
 * Turning the domain a visitor typed into one workspace.
 *
 * The shell has no middleware and nothing that reads the Host header on the way
 * in, so this is asked for during a render instead. That is fine — it is one
 * lookup against a table with a handful of rows, and the answer is held in
 * memory between requests.
 *
 * **The host is always read here, on the server, and never taken from the
 * browser.** A host in a request body is a value anybody can type, and
 * believing one would let a visitor ask for any workspace they liked — including a
 * switched-off one.
 */

/** The public face of a workspace: what a page needs to draw itself, and no more. */
export type ResolvedWorkspace = {
  id: string
  name: string
  subdomain: string
  /**
   * Left unparsed on purpose. Parsing lives in `people/workspaces.ts`, and that
   * module already reaches in here to drop the cache when it writes — reaching
   * back would be a circle. Callers that need the settings parse them.
   */
  settings: unknown
}

/**
 * The domain workspaces hang off — `example.com`, so a workspace called alpha
 * answers on `alpha.example.com`.
 *
 * Empty unless an app sets it, and empty means one deployment serves one site,
 * which is what nearly every app built on this shell wants. Set it to
 * `localhost` in development: browsers resolve every `*.localhost` name to this
 * machine on their own, so `alpha.localhost:3002` works with no hosts file.
 */
export function workspaceBaseDomain() {
  return (process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
}

/**
 * A host cut back to the bare name: no port, no trailing dot, no `www.`.
 *
 * `www.` comes off here and off a workspace's saved custom domain too, so the two
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

/**
 * The host being asked for, or null when there is no request.
 *
 * Reading it throws outside the server runtime — from a background job, a
 * script, or a test — and there genuinely is no host in any of those. Null is
 * the truthful answer, and it lands on "this is the deployment itself", which
 * is what work with nobody watching should assume.
 */
function requestHost(): string | null {
  try {
    return getRequestHeader("host") ?? null
  } catch {
    return null
  }
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
 * Only a single label counts: `alpha.example.com` is a workspace, `a.b.example.com`
 * is not. Anything deeper would have to answer which of the two names owns it,
 * and there is no good answer.
 */
function subdomainOf(host: string, baseDomain: string) {
  // No base domain configured means multisite is switched off: nothing hangs
  // off anything, so no host is a workspace's and none is trusted for a write.
  // Defaulting this to "localhost" would have every app trusting every
  // `*.localhost` origin whether or not it serves more than one site.
  if (!baseDomain) return null

  const suffix = `.${baseDomain}`
  if (!host.endsWith(suffix)) return null

  const label = host.slice(0, -suffix.length)
  if (!label || label.includes(".")) return null

  return label
}

/**
 * Whether this host belongs to the deployment rather than to any workspace.
 *
 * The app's own address, the base domain on its own, and the handful of names
 * kept for the app — none of them can ever be a workspace, however the workspaces table
 * looks.
 */
export function isPlatformHost(host: string | null | undefined) {
  const asked = normalizeHost(host)
  if (!asked) return true

  const baseDomain = workspaceBaseDomain()

  // Multisite off: every host is this app. Without this, an app that never
  // asked for workspaces to have addresses would call any host but its own
  // configured one a dead end — a LAN address, a staging alias, a proxy in
  // front of it — and look broken for no reason.
  if (!baseDomain) return true
  if (asked === baseDomain || asked === platformHost()) return true

  const label = subdomainOf(asked, baseDomain)
  return label !== null && (RESERVED_SUBDOMAINS as readonly string[]).includes(label)
}

type WorkspaceCache = {
  /** The database it was read from, so a test's own database never sees another's rows. */
  database: CustomShellDb
  bySubdomain: Map<string, ResolvedWorkspace>
  byCustomDomain: Map<string, ResolvedWorkspace>
  customDomains: Set<string>
}

/**
 * The cache lives on `globalThis`, not in this module.
 *
 * A page's loader and a server route handler — `/feed.xml`, `/sitemap.xml` —
 * are built into **different bundles**, and each bundle gets its own copy of
 * every module it imports. With the cache held in a module variable, clearing
 * it from a save cleared only that bundle's copy: the site's own page showed
 * the new name straight away while its feed kept the old one until the server
 * restarted. One slot on `globalThis` is one cache, whoever is asking.
 */
const CACHE_SLOT = Symbol.for("custom-shell.workspace-host-cache")

type CacheHolder = { [CACHE_SLOT]?: WorkspaceCache | null }

function readCache(): WorkspaceCache | null {
  return (globalThis as CacheHolder)[CACHE_SLOT] ?? null
}

function writeCache(value: WorkspaceCache | null) {
  ;(globalThis as CacheHolder)[CACHE_SLOT] = value
}

function toResolvedWorkspace(row: CustomShellWorkspace): ResolvedWorkspace {
  return {
    id: row.id,
    name: row.name,
    subdomain: row.subdomain,
    settings: row.settings,
  }
}

/**
 * Forgets what it knows, so the next visitor is answered from the database.
 *
 * Called by every write in `people/workspaces.ts`. A workspace whose address or status just
 * changed must not keep answering the old way, and there is no version of this
 * worth being clever about — the table is small and reading it again is cheap.
 */
export function dropWorkspaceCache() {
  writeCache(null)
}

async function workspaceCache(database: CustomShellDb): Promise<WorkspaceCache> {
  const known = readCache()
  if (known && known.database === database) return known

  const rows = await database.select().from(customShellWorkspaces)
  const next: WorkspaceCache = {
    database,
    bySubdomain: new Map(),
    byCustomDomain: new Map(),
    customDomains: new Set(),
  }

  for (const row of rows) {
    // Every workspace's custom domain counts as one of ours for the origin check,
    // even a switched-off workspace's: it is still a name this deployment owns, and
    // refusing it would only make its "we are closed" page fail oddly.
    if (row.customDomain) next.customDomains.add(row.customDomain)

    if (!(LIVE_WORKSPACE_STATUSES as readonly string[]).includes(row.status)) continue

    const workspace = toResolvedWorkspace(row)
    next.bySubdomain.set(row.subdomain, workspace)
    if (row.customDomain) next.byCustomDomain.set(row.customDomain, workspace)
  }

  writeCache(next)
  return next
}

/**
 * The workspace this host belongs to, or null when it belongs to none.
 *
 * A custom domain wins over a subdomain, because a workspace that has been given its
 * own name is meant to be reached by it. A switched-off workspace answers nothing —
 * it looks exactly like a workspace that never existed, which is the point.
 */
export async function resolveWorkspaceByHost(
  host: string | null | undefined,
  database: CustomShellDb = db
): Promise<ResolvedWorkspace | null> {
  const asked = normalizeHost(host)
  if (!asked || isPlatformHost(asked)) return null

  const known = await workspaceCache(database)

  const byDomain = known.byCustomDomain.get(asked)
  if (byDomain) return byDomain

  const label = subdomainOf(asked, workspaceBaseDomain())
  return label ? (known.bySubdomain.get(label) ?? null) : null
}

/**
 * Who the request being handled belongs to, from its Host header.
 *
 * Three answers, not two, and the difference matters: an address that belongs
 * to no workspace is **not** the same as the deployment's own. The platform's front
 * page must keep rendering on the platform's own address, and a subdomain
 * nobody has taken — or one whose workspace is switched off — has to be a dead
 * address rather than quietly showing the app's own marketing page.
 */
export type HostAnswer =
  | { kind: "platform" }
  | { kind: "workspace"; workspace: ResolvedWorkspace }
  | { kind: "unknown" }

export async function answerForRequest(
  database: CustomShellDb = db
): Promise<HostAnswer> {
  const host = requestHost()
  if (isPlatformHost(host)) return { kind: "platform" }

  const workspace = await resolveWorkspaceByHost(host, database)
  return workspace ? { kind: "workspace", workspace } : { kind: "unknown" }
}

/**
 * Whether an address belongs to this deployment, for the shell's origin check.
 *
 * **Synchronous, because the check that calls it is.** It never reads the
 * database: a subdomain of the base domain is ours by definition and needs no
 * lookup at all, and a custom domain is answered from the cache the resolver
 * fills. A page is always drawn before a form on it is submitted, and drawing
 * it fills the cache — so by the time a write arrives from a workspace's own domain,
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

  const label = subdomainOf(host, workspaceBaseDomain())
  if (label && !(RESERVED_SUBDOMAINS as readonly string[]).includes(label)) {
    return true
  }

  return readCache()?.customDomains.has(host) ?? false
}
