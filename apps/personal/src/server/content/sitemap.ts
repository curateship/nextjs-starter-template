import { pageVisibility } from "@/lib/pages/page-visibility"
import { publicPages } from "@/lib/pages/page-registry"
import {
  appSitemapEntries,
  type SitemapChunkFile,
  type SitemapEntry,
} from "@/server/app-options"
import { readWorkspacePageOverrides } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import { listWrittenPageSitemapEntries } from "@/server/content/written-pages"
import {
  answerForRequest,
  publicOriginFromParts,
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

/**
 * Where the sitemap index sends a search engine for everything that is not one
 * of the app's numbered files — the shell's pages and any flat rows the app
 * adds. The same route answers it; only the question is different.
 */
export const SITEMAP_PAGES_PART = "pages"
const SITEMAP_PAGES_PATH = `/sitemap.xml?part=${SITEMAP_PAGES_PART}`

/** One address as the files write it, refused outright if it leaves this site. */
function sitemapLocation(base: URL, path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`A sitemap path must start with "/": ${path}`)
  }
  const url = new URL(path, base)
  if (url.origin !== base.origin) {
    throw new Error(`A sitemap path must stay on this site: ${path}`)
  }
  return escapeXml(url.toString())
}

function lastModified(updatedAt: Date | undefined): string {
  return updatedAt ? `<lastmod>${updatedAt.toISOString()}</lastmod>` : ""
}

/** A small sitemap document with no runtime dependency. */
export function renderSitemapXml(
  origin: string,
  entries: readonly SitemapEntry[]
): string {
  const base = new URL(origin)
  const urls = entries.map(
    (entry) =>
      `<url><loc>${sitemapLocation(base, entry.path)}</loc>${lastModified(entry.updatedAt)}</url>`
  )

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
}

/**
 * The index a chunked site serves at `/sitemap.xml`: a list of other sitemap
 * files rather than a list of addresses. Its first entry is always the site's
 * pages, so nothing an app does with numbered files can drop them.
 */
export function renderSitemapIndexXml(
  origin: string,
  chunks: readonly SitemapChunkFile[]
): string {
  const base = new URL(origin)
  const files = [{ path: SITEMAP_PAGES_PATH }, ...chunks].map(
    (file) =>
      `<sitemap><loc>${sitemapLocation(base, file.path)}</loc>${lastModified(file.updatedAt)}</sitemap>`
  )

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.join("\n")}\n</sitemapindex>\n`
}

/** Every public sitemap file answers the same way. */
export function sitemapXmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  })
}

/** The visitor-facing origin, preserving the domain and scheme they used. */
export function publicRequestOrigin(request: Request): string {
  // The same Host header selected the workspace. Using a different forwarded
  // host here could put one site's content under another site's addresses.
  const forwardedScheme = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim() ?? null
  return publicOriginFromParts(
    request.url,
    request.headers.get("host"),
    forwardedScheme
  )
}
