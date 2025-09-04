import { headers } from 'next/headers'
import { getSiteBySubdomain, getSiteByDomain } from '@/lib/actions/pages/page-frontend-actions'
import { createClient } from '@supabase/supabase-js'

/**
 * Get site data by querying database directly with host
 * Enhanced to work with middleware for custom domains
 */
export async function getSiteFromHeaders(pageSlug?: string) {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  
  // Check if middleware has already identified the site (for custom domains)
  const siteSubdomain = headersList.get('x-site-subdomain')
  const customDomain = headersList.get('x-custom-domain')
  
  // If middleware identified a custom domain, try subdomain lookup first
  if (customDomain && siteSubdomain) {
    console.log('[SITE-RESOLVER] Custom domain detected:', { customDomain, siteSubdomain, pageSlug })
    const result = await getSiteBySubdomain(siteSubdomain, pageSlug)
    console.log('[SITE-RESOLVER] Subdomain lookup result:', { success: result.success, error: result.error })
    
    // If subdomain lookup fails, fallback to domain lookup
    if (!result.success) {
      const domainResult = await getSiteByDomain(customDomain, pageSlug)
      console.log('[SITE-RESOLVER] Domain lookup result:', { success: domainResult.success, error: domainResult.error })
      return domainResult
    }
    
    return result
  }
  
  // If middleware identified a subdomain site, use it
  if (siteSubdomain) {
    const result = await getSiteBySubdomain(siteSubdomain, pageSlug)
    
    // If page not found but this is home page, try without specific page
    if (!result.success && pageSlug === 'home') {
      return await getSiteBySubdomain(siteSubdomain)
    }
    
    return result
  }
  
  // For localhost:3000 root domain, use the HUB_SITE_ID to find subdomain
  if (host === 'localhost:3000') {
    const hubSiteId = process.env.HUB_SITE_ID || process.env.NEXT_PUBLIC_HUB_SITE_ID
    if (hubSiteId) {
      // Create Supabase client inline to avoid global state
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      // Quick query to get the subdomain for this site ID
      const { data: site } = await supabaseAdmin
        .from('sites')
        .select('subdomain')
        .eq('id', hubSiteId)
        .single()
      
      if (site?.subdomain) {
        return await getSiteBySubdomain(site.subdomain, pageSlug)
      }
    }
    // Fallback to domain lookup if no HUB_SITE_ID or site not found
    return await getSiteByDomain('localhost:3000', pageSlug)
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