import { pageVisibility } from "@/lib/pages/page-visibility"
import { publicPages } from "@/lib/pages/page-registry"
import {
  appSitemapEntries,
  type SitemapEntry,
} from "@/server/app-options"
import { readWorkspacePageOverrides } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import { listWrittenPageSitemapEntries } from "@/server/content/written-pages"
import {
  answerForRequest,
  workspaceBaseDomain,
} from "@/server/workspaces/host"
import { visitorWorkspaceId } from "@/server/workspaces/for-request"

/** The site a public machine-readable file belongs to, or none for a dead host. */
export async function publicFileWorkspaceId(
  database: CustomShellDb = db
): Promise<string | null> {
  const answer = await answerForRequest(database)
  if (answer.kind === "unknown") return null
  if (answer.kind === "workspace") return answer.workspace.id

  // On a multisite deployment the platform address is not one of the sites.
  // A one-site app has no base domain and keeps the long-standing fallback.
  if (workspaceBaseDomain()) return null

  // A normal one-site app has only the platform address. It keeps using its
  // oldest workspace, which is the same answer every existing public read uses.
  return visitorWorkspaceId(database)
}

/** Every address a search engine may index on one site. */
export async function readSitemapEntries(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<readonly SitemapEntry[]> {
  const [overrides, written, extra] = await Promise.all([
    readWorkspacePageOverrides(workspaceId, database),
    listWrittenPageSitemapEntries(workspaceId, database),
    appSitemapEntries(workspaceId),
  ])

  return [
    ...publicPages()
      .filter((page) => pageVisibility(overrides, page) === "everyone")
      .map((page) => ({ path: page.path })),
    ...written
      .filter(
        (page) =>
          pageVisibility(overrides, {
            path: page.path,
            canSwitchOff: true,
          }) === "everyone"
      )
      .map((page) => ({ path: page.path, updatedAt: page.updatedAt })),
    ...extra,
  ].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  )
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

/** A small sitemap document with no runtime dependency. */
export function renderSitemapXml(
  origin: string,
  entries: readonly SitemapEntry[]
): string {
  const base = new URL(origin)
  const urls = entries.map((entry) => {
    if (!entry.path.startsWith("/")) {
      throw new Error(`A sitemap path must start with "/": ${entry.path}`)
    }
    const url = new URL(entry.path, base)
    if (url.origin !== base.origin) {
      throw new Error(`A sitemap path must stay on this site: ${entry.path}`)
    }
    const location = escapeXml(url.toString())
    const updated = entry.updatedAt
      ? `<lastmod>${entry.updatedAt.toISOString()}</lastmod>`
      : ""
    return `<url><loc>${location}</loc>${updated}</url>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
}

/** The visitor-facing origin, preserving the domain and scheme they used. */
export function publicRequestOrigin(request: Request): string {
  const requested = new URL(request.url)
  // The same Host header selected the workspace. Using a different forwarded
  // host here could put one site's content under another site's addresses.
  const host = request.headers.get("host")
  const forwardedScheme = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
  const scheme =
    forwardedScheme === "http" || forwardedScheme === "https"
      ? forwardedScheme
      : requested.protocol.slice(0, -1)

  if (!host) return requested.origin
  try {
    return new URL(`${scheme}://${host}`).origin
  } catch {
    return requested.origin
  }
}
