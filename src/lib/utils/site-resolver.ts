import { headers } from 'next/headers'
import { getSiteBySubdomain, getSiteByDomain } from '@/lib/actions/pages/page-frontend-actions'

/**
 * Get site data by querying database directly with host
 */
export async function getSiteFromHeaders(pageSlug?: string) {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  
  // For localhost:3000, try domain lookup first
  if (host === 'localhost:3000') {
    return await getSiteByDomain('localhost:3000', pageSlug)
  }
  
  // For other hosts, try domain lookup first, then subdomain
  const domainResult = await getSiteByDomain(host, pageSlug)
  if (domainResult.success) {
    return domainResult
  }
  
  // If domain lookup fails, try subdomain
  const subdomain = host.split('.')[0]
  return await getSiteBySubdomain(subdomain, pageSlug)
}