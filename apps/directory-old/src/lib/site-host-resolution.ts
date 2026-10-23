import { eq, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { isReservedPlatformSubdomain } from '@/lib/utils/platform-host'

function normalizeSiteHost(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
}

function getSubdomainFromHost(host: string) {
  if (!host.includes('.')) return null

  const subdomain = host.split('.')[0]
  return isReservedPlatformSubdomain(subdomain) ? null : subdomain
}

function canUseDevelopmentSiteFallback(hostname: string) {
  if (process.env.NODE_ENV === 'production') return false
  const host = normalizeSiteHost(hostname)
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

// Public endpoints hit by localhost in development have no matching site host;
// fall back to the first active site so they stay testable locally.
export async function resolveSiteByHostWithDevFallback(hostname: string) {
  const site = await resolveSiteByHostInternal(hostname)
  if (site || !canUseDevelopmentSiteFallback(hostname)) return site

  const [firstSite] = await db
    .select({ id: sites.id, subdomain: sites.subdomain, customDomain: sites.customDomain })
    .from(sites)
    .where(eq(sites.status, 'active'))
    .limit(1)

  return firstSite
    ? { id: firstSite.id, subdomain: firstSite.subdomain, custom_domain: firstSite.customDomain }
    : null
}

export async function resolveSiteByHostInternal(hostname: string) {
  const host = normalizeSiteHost(hostname)
  const subdomain = getSubdomainFromHost(host)
  if (!host) return null

  const [site] = await db
    .select({
      id: sites.id,
      subdomain: sites.subdomain,
      customDomain: sites.customDomain,
      status: sites.status,
    })
    .from(sites)
    .where(
      subdomain
        ? or(eq(sites.customDomain, host), eq(sites.subdomain, subdomain))
        : eq(sites.customDomain, host)
    )
    .orderBy(sql`
      case
        when ${sites.status} in ('active', 'draft') and ${sites.customDomain} = ${host} then 0
        when ${sites.status} in ('active', 'draft') and ${sites.subdomain} = ${subdomain} then 1
        when ${sites.customDomain} = ${host} then 2
        else 3
      end
    `)
    .limit(1)

  if (!site || (site.status !== 'active' && site.status !== 'draft')) return null

  return {
    id: site.id,
    subdomain: site.subdomain,
    custom_domain: site.customDomain,
  }
}
