import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import {
  createSitemapXmlResponse,
  getContentSitemapEntries,
  getSitemapBaseUrl,
  renderUrlSet,
} from '@/lib/utils/sitemap'

export async function GET() {
  const { success, site } = await getSiteFromHeaders()
  if (!success || !site) {
    return createSitemapXmlResponse(renderUrlSet([]))
  }

  const baseUrl = getSitemapBaseUrl(site)
  const entries = await getContentSitemapEntries(site.id, baseUrl)

  return createSitemapXmlResponse(renderUrlSet(entries))
}
