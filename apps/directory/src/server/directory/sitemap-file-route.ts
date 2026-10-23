import type { SitemapEntry } from "@/server/app-options"
import {
  publicFileWorkspaceId,
  publicRequestOrigin,
  renderSitemapXml,
  sitemapXmlResponse,
} from "@/server/content/sitemap"

/**
 * Answers a request for one numbered file: the XML, or a plain 404 for a file
 * that does not exist or a name that is not plain digits. "01", "1e3" and "-1"
 * are not file names this app ever wrote, so they are not files it answers for.
 * The site comes from the domain asked for, so one site's records can never
 * appear under another's.
 */
export async function numberedSitemapResponse(
  request: Request,
  rawChunk: string,
  read: (
    workspaceId: string,
    chunk: number
  ) => Promise<readonly SitemapEntry[] | null>
): Promise<Response> {
  const workspaceId = await publicFileWorkspaceId()
  if (!workspaceId || !/^(0|[1-9][0-9]*)$/.test(rawChunk)) {
    return new Response("Not found", { status: 404 })
  }

  const entries = await read(workspaceId, Number(rawChunk))
  if (!entries) return new Response("Not found", { status: 404 })

  return sitemapXmlResponse(
    renderSitemapXml(publicRequestOrigin(request), entries)
  )
}
