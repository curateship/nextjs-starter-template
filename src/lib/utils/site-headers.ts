import { headers } from 'next/headers'
import { getSiteBySubdomain, getSiteByDomain } from '@/lib/actions/frontend-actions'

/**
 * Get site data from request headers set by middleware
 */
export async function getSiteFromHeaders(pageSlug?: string) {
  const headersList = await headers()
  const siteId = headersList.get('x-site-id')
  const siteSubdomain = headersList.get('x-site-subdomain')
  const siteDomain = headersList.get('x-site-domain')

  if (!siteId) {
    return { success: false, error: 'No site found in headers' }
  }

  // Use custom domain if available, otherwise use subdomain
  if (siteDomain) {
    return await getSiteByDomain(siteDomain, pageSlug)
  } else if (siteSubdomain) {
    return await getSiteBySubdomain(siteSubdomain, pageSlug)
  }

  return { success: false, error: 'No site identifier found' }
}