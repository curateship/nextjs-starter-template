import { headers } from '@/lib/request-headers'
import { getSiteBySubdomain, getSiteByDomain, getSiteByHost } from '@/lib/actions/pages/page-frontend-actions'
import { isReservedPlatformSubdomain } from '@/lib/utils/platform-host'

type SiteResolverOptions = {
  listingPage?: number
}

/**
 * Get site data by querying database directly with host
 * Enhanced to work with middleware for custom domains
 */
export async function getSiteFromHeaders(pageSlug?: string, options?: SiteResolverOptions) {
  const headersList = await headers()
  const host = headersList.get('host') || new URL(import.meta.env.VITE_DIRECTORY_ORIGIN).host

  // Prefer direct host lookup so site and page are loaded together.
  const hostResult = await getSiteByHost(host, pageSlug, options)
  if (hostResult.success || hostResult.error === 'Page not found' || hostResult.error === 'Site is not available for viewing') {
    return hostResult
  }

  // Fallback: legacy header-based flow
  const siteSubdomain = headersList.get('x-site-subdomain')
  const customDomain = headersList.get('x-custom-domain')
  if (customDomain && siteSubdomain) {
    const result = await getSiteBySubdomain(siteSubdomain, pageSlug, options)
    if (!result.success) return await getSiteByDomain(customDomain, pageSlug, options)
    return result
  }
  if (siteSubdomain) {
    const result = await getSiteBySubdomain(siteSubdomain, pageSlug, options)
    if (!result.success && pageSlug === 'home') return await getSiteBySubdomain(siteSubdomain, undefined, options)
    return result
  }

  // Legacy fallback: try domain lookup first, then subdomain
  const domainResult = await getSiteByDomain(host, pageSlug, options)
  if (domainResult.success) {
    return domainResult
  }

  // If domain lookup fails, try subdomain
  const subdomain = host.split('.')[0]
  if (isReservedPlatformSubdomain(subdomain)) {
    return { success: false, error: 'Site not found' }
  }

  return await getSiteBySubdomain(subdomain, pageSlug, options)
}
