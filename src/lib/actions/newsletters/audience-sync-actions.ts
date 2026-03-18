'use server'

import { eq, and, sql, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterContacts, siteIntegrations, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { getResendConfig } from '@/lib/actions/integrations/config-helpers'
import { Resend } from 'resend'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

/**
 * Get or create a Resend audience for a site.
 * Stores the audience ID in site_integrations config.
 */
export async function getOrCreateResendAudience(siteId: string): Promise<{ audienceId: string | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { audienceId: null, error: 'Invalid site ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { audienceId: null, error: 'Not authenticated' }
    if (!await verifySiteOwnership(siteId, user.id)) return { audienceId: null, error: 'Access denied' }

    const config = await getResendConfig(siteId)
    if (!config?.apiKey) return { audienceId: null, error: 'Resend not configured' }

    // Check if audience ID already stored
    const [integration] = await db
      .select({ id: siteIntegrations.id, config: siteIntegrations.config })
      .from(siteIntegrations)
      .where(and(eq(siteIntegrations.siteId, siteId), eq(siteIntegrations.integrationType, 'resend')))
      .limit(1)

    const integrationConfig = integration?.config as Record<string, any> | null
    if (integrationConfig?.audience_id) {
      return { audienceId: integrationConfig.audience_id, error: null }
    }

    // Create audience in Resend
    const resend = new Resend(config.apiKey)

    // Get site name for audience
    const [site] = await db
      .select({ name: sites.name })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    const { data: audience, error: audienceError } = await resend.audiences.create({
      name: site?.name || 'Newsletter',
    })

    if (audienceError) {
      console.error('Failed to create Resend audience:', audienceError)
      return { audienceId: null, error: 'Failed to create audience in Resend' }
    }

    // Store audience ID in integration config
    if (integration) {
      await db
        .update(siteIntegrations)
        .set({
          config: { ...integrationConfig, audience_id: audience.id },
        })
        .where(eq(siteIntegrations.id, integration.id))
    }

    return { audienceId: audience.id, error: null }
  } catch (err) {
    console.error('getOrCreateResendAudience error:', err)
    return { audienceId: null, error: 'Server error' }
  }
}

/**
 * Sync all active contacts for a site to the Resend audience.
 */
export async function syncContactsToResend(siteId: string): Promise<{ synced: number; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { synced: 0, error: 'Not authenticated' }
    if (!await verifySiteOwnership(siteId, user.id)) return { synced: 0, error: 'Access denied' }
    if (!UUID_REGEX.test(siteId)) return { synced: 0, error: 'Invalid site ID' }

    const config = await getResendConfig(siteId)
    if (!config?.apiKey) return { synced: 0, error: 'Resend not configured' }

    const { audienceId, error: audienceError } = await getOrCreateResendAudience(siteId)
    if (!audienceId) return { synced: 0, error: audienceError }

    const resend = new Resend(config.apiKey)

    // Get all active contacts
    const contacts = await db
      .select({ email: newsletterContacts.email, metadata: newsletterContacts.metadata })
      .from(newsletterContacts)
      .where(and(eq(newsletterContacts.siteId, siteId), eq(newsletterContacts.status, 'active')))

    if (!contacts.length) return { synced: 0, error: null }

    // Sync contacts to Resend audience in batches
    let synced = 0
    for (const contact of contacts) {
      try {
        const meta = contact.metadata as Record<string, any> | null
        await resend.contacts.create({
          audienceId,
          email: contact.email,
          firstName: meta?.first_name || undefined,
          lastName: meta?.last_name || undefined,
          unsubscribed: false,
        })
        synced++
      } catch (err) {
        // Resend returns error for duplicates, skip
        console.error(`Failed to sync contact ${contact.email}:`, err)
      }
    }

    return { synced, error: null }
  } catch (err) {
    console.error('syncContactsToResend error:', err)
    return { synced: 0, error: 'Server error' }
  }
}

/**
 * Get audience count matching a newsletter's filter.
 */
export async function getAudienceCount(
  siteId: string,
  audienceFilter: { tags?: string[]; sources?: string[]; min_engagement_score?: number }
): Promise<{ count: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { count: 0, error: 'Invalid site ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { count: 0, error: 'Not authenticated' }
    if (!await verifySiteOwnership(siteId, user.id)) return { count: 0, error: 'Access denied' }

    const conditions = [
      eq(newsletterContacts.siteId, siteId),
      eq(newsletterContacts.status, 'active'),
    ]

    if (audienceFilter.tags?.length) {
      // Filter contacts whose metadata tags overlap with filter tags
      for (const tag of audienceFilter.tags) {
        conditions.push(sql`${newsletterContacts.metadata} @> ${JSON.stringify({ tags: [tag] })}::jsonb`)
      }
    }

    if (audienceFilter.sources?.length) {
      conditions.push(sql`${newsletterContacts.metadata}->>'source' IN (${sql.join(audienceFilter.sources.map((s: string) => sql`${s}`), sql`, `)})`)
    }

    if (audienceFilter.min_engagement_score) {
      conditions.push(gte(newsletterContacts.engagementScore, audienceFilter.min_engagement_score))
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(newsletterContacts)
      .where(and(...conditions))

    return { count: result?.count ?? 0, error: null }
  } catch (err) {
    console.error('getAudienceCount error:', err)
    return { count: 0, error: 'Server error' }
  }
}
