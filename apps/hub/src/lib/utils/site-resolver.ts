import { headers } from 'next/headers'
import { getSiteBySubdomain, getSiteByDomain } from '@/lib/actions/pages/page-frontend-actions'
import { resolveSiteByHost } from '@/lib/actions/pages/page-frontend-actions'

/**
 * Get site data by querying database directly with host
 * Enhanced to work with middleware for custom domains
 */
export async function getSiteFromHeaders(pageSlug?: string) {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  
  // Prefer cached resolver (works regardless of middleware headers)
  const resolved = await resolveSiteByHost(host)
  if (resolved) {
    const result = await getSiteBySubdomain(resolved.subdomain, pageSlug)
    if (!result.success && pageSlug === 'home') {
      return await getSiteBySubdomain(resolved.subdomain)
    }
    if (!result.success && resolved.custom_domain) {
      return await getSiteByDomain(resolved.custom_domain, pageSlug)
    }
    return result
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
  return await getSiteBySubdomain(subdomain, pageSlug)
}