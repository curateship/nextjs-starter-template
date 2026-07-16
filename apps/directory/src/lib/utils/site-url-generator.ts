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
    const localUrl = new URL(import.meta.env.VITE_DIRECTORY_ORIGIN)
    localUrl.hostname = `${site.subdomain}.${localUrl.hostname}`
    return localUrl.origin
  }

  // If custom domain is set, use it
  if (customDomain) {
    // Add protocol if not present
    if (customDomain.startsWith('http')) {
      return customDomain
    }
    return `https://${customDomain}`
  }

  // Fallback for production without custom domain.
  const baseDomain = (import.meta.env.VITE_APP_DOMAIN || '').replace(/^https?:\/\//, '')
  if (baseDomain) {
    return `https://${site.subdomain}.${baseDomain}`
  }
  const localUrl = new URL(import.meta.env.VITE_DIRECTORY_ORIGIN)
  localUrl.hostname = `${site.subdomain}.${localUrl.hostname}`
  return localUrl.origin
}
