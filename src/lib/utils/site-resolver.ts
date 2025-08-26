import { headers } from 'next/headers'
import { getSiteBySubdomain, getSiteByDomain } from '@/lib/actions/pages/page-frontend-actions'
import { getSiteMapping } from '@/lib/utils/site-mappings'

/**
 * Get site data by resolving host to site mapping, then fetching from database
 */
export async function getSiteFromHeaders(pageSlug?: string) {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  
  // Look up site in JSON mappings first
  const siteMapping = getSiteMapping(host)
  
  if (!siteMapping) {
    return { success: false, error: 'Site not found' }
  }
  
  // Pass homepage_slug from mappings to avoid database lookup
  const homepageSlug = siteMapping.homepage_slug
  
  // For localhost or custom domains, use domain lookup
  if (siteMapping.custom_domain) {
    return await getSiteByDomain(siteMapping.custom_domain, pageSlug, homepageSlug)
  }
  
  // Otherwise use subdomain lookup
  return await getSiteBySubdomain(siteMapping.subdomain, pageSlug, homepageSlug)
}