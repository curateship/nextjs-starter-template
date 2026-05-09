'use server'

import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterContacts, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { getResendConfig } from '@/lib/actions/integrations/config-helpers'
import dns from 'dns/promises'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

export interface DomainHealth {
  domain: string
  spf: 'pass' | 'fail' | 'missing'
  dkim: 'pass' | 'fail' | 'missing'
  dmarc: 'pass' | 'fail' | 'missing'
}

export interface DeliverabilityReport {
  domain: DomainHealth | null
  contactHealth: {
    active: number
    unsubscribed: number
    bounced: number
    complained: number
    cold: number  // no engagement in 90 days
  }
  emailMetrics: {
    totalSent: number
    totalOpened: number
    totalClicked: number
    totalBounced: number
    totalComplained: number
    openRate: number
    clickRate: number
    bounceRate: number
    complaintRate: number
  }
}

/**
 * Check domain health for SPF, DKIM, DMARC.
 */
export async function checkDomainHealth(siteId: string): Promise<{ data: DomainHealth | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const config = await getResendConfig(siteId)
    if (!config?.fromEmail) return { data: null, error: 'From email not configured' }

    const domain = config.fromEmail.split('@')[1]
    if (!domain) return { data: null, error: 'Invalid from email' }

    const health: DomainHealth = { domain, spf: 'missing', dkim: 'missing', dmarc: 'missing' }

    // Check SPF
    try {
      const txtRecords = await dns.resolveTxt(domain)
      const spfRecord = txtRecords.flat().find(r => r.startsWith('v=spf1'))
      health.spf = spfRecord ? 'pass' : 'missing'
    } catch {
      health.spf = 'missing'
    }

    // Check DKIM (Resend uses resend._domainkey)
    try {
      const dkimRecords = await dns.resolveTxt(`resend._domainkey.${domain}`)
      health.dkim = dkimRecords.flat().some(r => r.includes('DKIM')) || dkimRecords.length > 0 ? 'pass' : 'missing'
    } catch {
      health.dkim = 'missing'
    }

    // Check DMARC
    try {
      const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`)
      const dmarcRecord = dmarcRecords.flat().find(r => r.startsWith('v=DMARC1'))
      health.dmarc = dmarcRecord ? 'pass' : 'missing'
    } catch {
      health.dmarc = 'missing'
    }

    return { data: health, error: null }
  } catch (err) {
    console.error('checkDomainHealth error:', err)
    return { data: null, error: 'Server error' }
  }
}

/**
 * Get full deliverability report for a site.
 */
export async function getDeliverabilityReport(siteId: string): Promise<{ data: DeliverabilityReport | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Domain health
    const { data: domain } = await checkDomainHealth(siteId)

    // Contact health
    const contacts = await db
      .select({
        status: newsletterContacts.status,
        lastEngagedAt: newsletterContacts.lastEngagedAt,
      })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.siteId, siteId))

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    const contactHealth = { active: 0, unsubscribed: 0, bounced: 0, complained: 0, cold: 0 }

    for (const c of contacts) {
      if (c.status === 'active') {
        contactHealth.active++
        // Cold = active but no engagement in 90 days
        if (!c.lastEngagedAt || c.lastEngagedAt < ninetyDaysAgo) {
          contactHealth.cold++
        }
      }
      else if (c.status === 'unsubscribed') contactHealth.unsubscribed++
      else if (c.status === 'bounced') contactHealth.bounced++
      else if (c.status === 'complained') contactHealth.complained++
    }

    // Email metrics (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const metricRows = await db.execute<{
      total_sent: number
      total_opened: number
      total_clicked: number
      total_bounced: number
      total_complained: number
    }>(sql`
      select
        count(*) filter (where sent_at >= ${thirtyDaysAgo} and is_duplicate_send = false)::int as total_sent,
        count(*) filter (where first_opened_at >= ${thirtyDaysAgo})::int as total_opened,
        count(*) filter (where first_clicked_at >= ${thirtyDaysAgo})::int as total_clicked,
        count(*) filter (where bounced_at >= ${thirtyDaysAgo})::int as total_bounced,
        count(*) filter (where complained_at >= ${thirtyDaysAgo})::int as total_complained
      from newsletter_deliveries
      where site_id = ${siteId}
        and (
          sent_at >= ${thirtyDaysAgo}
          or first_opened_at >= ${thirtyDaysAgo}
          or first_clicked_at >= ${thirtyDaysAgo}
          or bounced_at >= ${thirtyDaysAgo}
          or complained_at >= ${thirtyDaysAgo}
        )
    `)

    const totalSent = Number(metricRows.rows[0]?.total_sent ?? 0)
    const totalOpened = Number(metricRows.rows[0]?.total_opened ?? 0)
    const totalClicked = Number(metricRows.rows[0]?.total_clicked ?? 0)
    const totalBounced = Number(metricRows.rows[0]?.total_bounced ?? 0)
    const totalComplained = Number(metricRows.rows[0]?.total_complained ?? 0)

    const emailMetrics = {
      totalSent,
      totalOpened,
      totalClicked,
      totalBounced,
      totalComplained,
      openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
      clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
      bounceRate: totalSent > 0 ? Math.round((totalBounced / totalSent) * 1000) / 10 : 0,
      complaintRate: totalSent > 0 ? Math.round((totalComplained / totalSent) * 10000) / 100 : 0,
    }

    return {
      data: { domain, contactHealth, emailMetrics },
      error: null,
    }
  } catch (err) {
    console.error('getDeliverabilityReport error:', err)
    return { data: null, error: 'Server error' }
  }
}
