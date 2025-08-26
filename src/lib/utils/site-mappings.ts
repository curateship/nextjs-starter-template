// Site mapping interface for domain/subdomain lookup only
export interface SiteMapping {
  id: string
  subdomain: string
  custom_domain: string | null
  status: 'active' | 'draft' | 'inactive'
}

// Embedded site mappings for Edge Runtime compatibility
// This data is duplicated from site-mappings.json for performance
const SITE_MAPPINGS: SiteMapping[] = [
  {
    id: "b8f5c8e0-9f12-4567-8901-234567890123",
    subdomain: "hub",
    custom_domain: "localhost:3000",
    status: "active"
  },
  {
    id: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    subdomain: "demo",
    custom_domain: "demo.example.com",
    status: "active"
  },
  {
    id: "x9y8z7w6-v5u4-3210-9876-543210fedcba",
    subdomain: "test",
    custom_domain: null,
    status: "draft"
  }
]

/**
 * Get site mapping by domain or subdomain for routing purposes only
 * This function only returns basic site identification data
 * All content (navigation, footer, etc.) should be fetched from database
 */
export function getSiteMapping(host: string): SiteMapping | null {
  // First try to match by custom domain (including localhost:3000)
  const byDomain = SITE_MAPPINGS.find(site => 
    site.custom_domain === host && (site.status === 'active' || site.status === 'draft')
  )
  if (byDomain) {
    return byDomain
  }

  // Extract hostname without port
  const hostname = host.split(':')[0]
  
  // Special handling for localhost
  if (hostname === 'localhost') {
    // Find the hub site which has localhost:3000 as custom domain
    const localhost = SITE_MAPPINGS.find(site => 
      site.custom_domain === 'localhost:3000' && (site.status === 'active' || site.status === 'draft')
    )
    if (localhost) {
      return localhost
    }
  }

  // Then try to match by subdomain (extract from host)
  const subdomain = hostname.split('.')[0]
  const bySubdomain = SITE_MAPPINGS.find(site => 
    site.subdomain === subdomain && (site.status === 'active' || site.status === 'draft')
  )
  if (bySubdomain) {
    return bySubdomain
  }

  return null
}

/**
 * Get all active site mappings (for development/debugging)
 */
export function getAllSiteMappings(): SiteMapping[] {
  return SITE_MAPPINGS.filter(site => site.status === 'active')
}