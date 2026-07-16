import { NextRequest, NextResponse } from '@/lib/web-response'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { getCoreBridgeAllowedSiteIds, isAuthorizedCoreBridgeRequest } from '@/lib/utils/core-bridge-auth'

export async function GET(request: NextRequest) {
  if (!isAuthorizedCoreBridgeRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.select({
    id: sites.id,
    name: sites.name,
    subdomain: sites.subdomain,
    customDomain: sites.customDomain,
    status: sites.status,
  })
    .from(sites)
    .where(eq(sites.isTemplate, false))
    .orderBy(asc(sites.name))

  const allowedSiteIds = getCoreBridgeAllowedSiteIds()
  const exportableSites = allowedSiteIds
    ? rows.filter((site) => allowedSiteIds.has(site.id))
    : rows

  return NextResponse.json({
    sites: exportableSites.map((site) => ({
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.customDomain,
      status: site.status,
    })),
  })
}
