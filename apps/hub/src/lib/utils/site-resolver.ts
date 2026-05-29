import { headers } from 'next/headers'
import { getSiteBySubdomain, getSiteByDomain, getSiteByHost } from '@/lib/actions/pages/page-frontend-actions'
import { isReservedPlatformSubdomain } from '@/lib/utils/platform-host'

/**
 * Get site data by querying database directly with host
 * Enhanced to work with middleware for custom domains
 */
export async function getSiteFromHeaders(pageSlug?: string) {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  
  // Prefer direct host lookup so site and page are loaded together.
  const hostResult = await getSiteByHost(host, pageSlug)
  if (hostResult.success || hostResult.error === 'Page not found' || hostResult.error === 'Site is not available for viewing') {
    return hostResult
  }

  // Fallback: legacy header-based flow
  const siteSubdomain = headersList.get('x-site-subdomain')
  const customDomain = headersList.get('x-custom-domain')
  if (customDomain && siteSubdomain) {
    const result = await getSiteBySubdomain(siteSubdomain, pageSlug)
    if (!result.success) return await getSiteByDomain(customDomain, pageSlug)
    return result
  }
  if (siteSubdomain) {
    const result = await getSiteBySubdomain(siteSubdomain, pageSlug)
    if (!result.success && pageSlug === 'home') return await getSiteBySubdomain(siteSubdomain)
    return result
  }
  
  // Legacy fallback: try domain lookup first, then subdomain
  const domainResult = await getSiteByDomain(host, pageSlug)
  if (domainResult.success) {
    return domainResult
  }
  
  // If domain lookup fails, try subdomain
  const subdomain = host.split('.')[0]
  if (isReservedPlatformSubdomain(subdomain)) {
    return { success: false, error: 'Site not found' }
  }

  return await getSiteBySubdomain(subdomain, pageSlug)
}
