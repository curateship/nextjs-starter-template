/**
 * Utility functions for generating site URLs
 */

interface Site {
  subdomain: string
  custom_domain?: string | null
  customDomain?: string | null
}

/**
 * Generate the correct URL for a site
 */
export function getSiteUrl(site: Site): string {
  const customDomain = site.custom_domain || site.customDomain

  // In development, always use localhost regardless of custom domain settings
  if (process.env.NODE_ENV === 'development') {
    return `http://${site.subdomain}.localhost:3000`
  }

  // If custom domain is set, use it
  if (customDomain) {
    // Add protocol if not present
    if (customDomain.startsWith('http')) {
      return customDomain
    }
    return `https://${customDomain}`
  }

  // Fallback for production without custom domain — use sslip.io base URL
  const baseDomain = (process.env.NEXT_PUBLIC_APP_DOMAIN || '').replace(/^https?:\/\//, '')
  if (baseDomain) {
    return `http://${site.subdomain}.${baseDomain}`
  }
  return `http://${site.subdomain}.localhost:3000`
}

/**
 * Get the display URL for showing to users (without protocol)
 */
export function getSiteDisplayUrl(site: Site): string {
  const url = getSiteUrl(site)
  return url.replace(/^https?:\/\//, '')
}