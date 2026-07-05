'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites, sponsorPortalLinks, sponsors } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { getSiteUrl } from '@/lib/utils/site-url-generator'
import { generateSponsorReportToken, hashSponsorReportToken } from '@/lib/utils/sponsor-report-token'
import { UUID_REGEX } from '@/lib/utils/validation'

const PORTAL_LINK_TTL_DAYS = 90

export interface SponsorReportLinkStatus {
  sponsor_id: string
  status: 'active' | 'expired' | 'revoked'
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
}

async function getSponsorWithSiteForUser(sponsorId: string) {
  if (!UUID_REGEX.test(sponsorId)) return null

  const user = await getAuthenticatedUser()
  if (!user) return null

  const [row] = await db
    .select({ sponsor: sponsors, site: sites })
    .from(sponsors)
    .innerJoin(sites, eq(sites.id, sponsors.siteId))
    .where(eq(sponsors.id, sponsorId))
    .limit(1)

  if (!row) return null
  if (user.role !== 'super_admin' && row.site.userId !== user.id) return null

  return row
}

function rowToLinkStatus(row: typeof sponsorPortalLinks.$inferSelect): SponsorReportLinkStatus {
  const now = Date.now()
  const status = row.revokedAt ? 'revoked' : row.expiresAt.getTime() <= now ? 'expired' : 'active'

  return {
    sponsor_id: row.sponsorId,
    status,
    expires_at: row.expiresAt.toISOString(),
    revoked_at: row.revokedAt?.toISOString() ?? null,
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }
}

export async function getSponsorReportLinksAction(siteId: string): Promise<{ data: Record<string, SponsorReportLinkStatus>; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: {}, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: {}, error: 'Not authenticated' }

    const [site] = user.role === 'super_admin'
      ? await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1)
      : await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, user.id))).limit(1)

    if (!site) return { data: {}, error: 'Site not found or access denied' }

    const rows = await db
      .select()
      .from(sponsorPortalLinks)
      .where(eq(sponsorPortalLinks.siteId, siteId))

    return {
      data: Object.fromEntries(rows.map((row) => [row.sponsorId, rowToLinkStatus(row)])),
      error: null,
    }
  } catch {
    return { data: {}, error: 'Failed to load sponsor report links' }
  }
}

/**
 * Create or regenerate the portal link for a sponsor. Any previous link is
 * replaced. The full URL is returned once — only the token hash is stored.
 */
export async function createSponsorReportLinkAction(sponsorId: string): Promise<{ data: { url: string; link: SponsorReportLinkStatus } | null; error: string | null }> {
  try {
    const row = await getSponsorWithSiteForUser(sponsorId)
    if (!row) return { data: null, error: 'Sponsor not found or access denied' }

    const token = generateSponsorReportToken()
    const tokenHash = hashSponsorReportToken(token)
    const expiresAt = new Date(Date.now() + PORTAL_LINK_TTL_DAYS * 86_400_000)

    await db.delete(sponsorPortalLinks).where(eq(sponsorPortalLinks.sponsorId, sponsorId))
    const [created] = await db
      .insert(sponsorPortalLinks)
      .values({
        siteId: row.sponsor.siteId,
        sponsorId,
        tokenHash,
        expiresAt,
      })
      .returning()

    const url = `${getSiteUrl(row.site)}/sponsor-reports/${token}`

    return { data: { url, link: rowToLinkStatus(created) }, error: null }
  } catch {
    return { data: null, error: 'Failed to create sponsor report link' }
  }
}

export async function revokeSponsorReportLinkAction(sponsorId: string): Promise<{ data: SponsorReportLinkStatus | null; error: string | null }> {
  try {
    const row = await getSponsorWithSiteForUser(sponsorId)
    if (!row) return { data: null, error: 'Sponsor not found or access denied' }

    const [updated] = await db
      .update(sponsorPortalLinks)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(sponsorPortalLinks.sponsorId, sponsorId))
      .returning()

    if (!updated) return { data: null, error: 'No report link to revoke' }

    return { data: rowToLinkStatus(updated), error: null }
  } catch {
    return { data: null, error: 'Failed to revoke sponsor report link' }
  }
}
