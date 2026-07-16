import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import {
  createSitemapXmlResponse,
  getDirectorySitemapEntries,
  getSitemapBaseUrl,
  renderUrlSet,
} from '@/lib/utils/sitemap'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chunk: string }> }
) {
  const { chunk } = await params
  const chunkIndex = Number.parseInt(chunk, 10)

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return new Response('Not found', { status: 404 })
  }

  const { success, site } = await getSiteFromHeaders()
  if (!success || !site) {
    return createSitemapXmlResponse(renderUrlSet([]))
  }

  const baseUrl = getSitemapBaseUrl(site)
  const entries = await getDirectorySitemapEntries(site.id, baseUrl, chunkIndex)

  if (entries.length === 0) {
    return new Response('Not found', { status: 404 })
  }

  return createSitemapXmlResponse(renderUrlSet(entries))
}
