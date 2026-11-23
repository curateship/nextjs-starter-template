import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import {
  DIRECTORY_SITEMAP_BATCH_SIZE,
  createSitemapXmlResponse,
  getPublishedDirectorySitemapCount,
  getSitemapBaseUrl,
  renderSitemapIndex,
} from '@/lib/utils/sitemap'

export async function GET() {
  const { success, site } = await getSiteFromHeaders()
  if (!success || !site) {
    return createSitemapXmlResponse(renderSitemapIndex([]))
  }

  const baseUrl = getSitemapBaseUrl(site)
  const directoryCount = await getPublishedDirectorySitemapCount(site.id)
  const directoryChunkCount = Math.ceil(directoryCount / DIRECTORY_SITEMAP_BATCH_SIZE)

  const urls = [`${baseUrl}/content-sitemap`]

  for (let chunk = 0; chunk < directoryChunkCount; chunk += 1) {
    urls.push(`${baseUrl}/directory-sitemaps/${chunk}`)
  }

  return createSitemapXmlResponse(renderSitemapIndex(urls))
}
