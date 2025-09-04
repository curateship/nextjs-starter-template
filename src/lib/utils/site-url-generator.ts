/**
 * Utility functions for generating site URLs
 */

interface Site {
  subdomain: string
  custom_domain?: string | null
}

/**
 * Generate the correct URL for a site
 */
export function getSiteUrl(site: Site): string {
  // In development, always use localhost regardless of custom domain settings
  if (process.env.NODE_ENV === 'development') {
    return `http://${site.subdomain}.localhost:3000`
  }

  // If custom domain is set, use it
  if (site.custom_domain) {
    // Add protocol if not present
    if (site.custom_domain.startsWith('http')) {
      return site.custom_domain
    }
    return `http://${site.custom_domain}`
  }

  // Fallback for production without custom domain
  // Update this domain as needed for your production deployment
  const productionDomain = process.env.NEXT_PUBLIC_APP_URL || 'yourapp.vercel.app'
  return `https://${site.subdomain}.${productionDomain}`
}

/**
 * Get the display URL for showing to users (without protocol)
 */
export function getSiteDisplayUrl(site: Site): string {
  const url = getSiteUrl(site)
  return url.replace(/^https?:\/\//, '')
}