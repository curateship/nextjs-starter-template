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
  // If custom domain is set, use it
  if (site.custom_domain) {
    // Add protocol if not present
    if (site.custom_domain.startsWith('http')) {
      return site.custom_domain
    }
    return `http://${site.custom_domain}`
  }

  // Use subdomain URLs
  // Local development: subdomain.localhost:3000
  // Production: subdomain.yourapp.vercel.app (update domain as needed)
  return `http://${site.subdomain}.localhost:3000`
}

/**
 * Get the display URL for showing to users (without protocol)
 */
export function getSiteDisplayUrl(site: Site): string {
  if (site.custom_domain) {
    return site.custom_domain.replace(/^https?:\/\//, '')
  }

  return `${site.subdomain}.localhost:3000`
}