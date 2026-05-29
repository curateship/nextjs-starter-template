import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import { buildSiteUrl } from '@/lib/utils/seo-helpers'
import type { MetadataRoute } from 'next'

/**
 * Dynamic robots.txt — generates per-site with correct sitemap URL
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { success, site } = await getSiteFromHeaders()

  // Default sitemap URL fallback
  let sitemapUrl = '/sitemap.xml'

  if (success && site) {
    const baseUrl = buildSiteUrl(site)
    sitemapUrl = `${baseUrl}/sitemap.xml`
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/login', '/api', '/maintenance'],
      },
    ],
    sitemap: sitemapUrl,
  }
}
