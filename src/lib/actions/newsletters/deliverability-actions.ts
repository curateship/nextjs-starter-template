'use server'

import { eq, and, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterContacts, newsletterEvents, sites } from '@/lib/db/schema'
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
  engagementDistribution: {
    hot: number    // 70-100
    warm: number   // 30-69
    cold: number   // 0-29
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
        engagementScore: newsletterContacts.engagementScore,
        lastEngagedAt: newsletterContacts.lastEngagedAt,
      })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.siteId, siteId))

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    const contactHealth = { active: 0, unsubscribed: 0, bounced: 0, complained: 0, cold: 0 }
    const engagementDistribution = { hot: 0, warm: 0, cold: 0 }

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

      const score = c.engagementScore || 0
      if (score >= 70) engagementDistribution.hot++
      else if (score >= 30) engagementDistribution.warm++
      else engagementDistribution.cold++
    }

    // Email metrics (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const events = await db
      .select({ eventType: newsletterEvents.eventType })
      .from(newsletterEvents)
      .where(and(eq(newsletterEvents.siteId, siteId), gte(newsletterEvents.createdAt, thirtyDaysAgo)))

    let totalSent = 0, totalOpened = 0, totalClicked = 0, totalBounced = 0, totalComplained = 0

    for (const e of events) {
      if (e.eventType === 'sent') totalSent++
      else if (e.eventType === 'opened') totalOpened++
      else if (e.eventType === 'clicked') totalClicked++
      else if (e.eventType === 'bounced') totalBounced++
      else if (e.eventType === 'complained') totalComplained++
    }

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
      data: { domain, contactHealth, emailMetrics, engagementDistribution },
      error: null,
    }
  } catch (err) {
    console.error('getDeliverabilityReport error:', err)
    return { data: null, error: 'Server error' }
  }
}
