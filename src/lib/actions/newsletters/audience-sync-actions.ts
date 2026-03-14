'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getResendConfig } from '@/lib/actions/integrations/config-helpers'
import { Resend } from 'resend'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifyAuth() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

async function verifySiteOwnership(siteId: string, userId: string) {
  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single()
  return !!site
}

/**
 * Get or create a Resend audience for a site.
 * Stores the audience ID in site_integrations config.
 */
export async function getOrCreateResendAudience(siteId: string): Promise<{ audienceId: string | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { audienceId: null, error: 'Invalid site ID' }
    const user = await verifyAuth()
    if (!user) return { audienceId: null, error: 'Not authenticated' }
    if (!await verifySiteOwnership(siteId, user.id)) return { audienceId: null, error: 'Access denied' }

    const config = await getResendConfig(siteId)
    if (!config?.apiKey) return { audienceId: null, error: 'Resend not configured' }

    // Check if audience ID already stored
    const { data: integration } = await supabaseAdmin
      .from('site_integrations')
      .select('id, config')
      .eq('site_id', siteId)
      .eq('integration_type', 'resend')
      .single()

    if (integration?.config?.audience_id) {
      return { audienceId: integration.config.audience_id, error: null }
    }

    // Create audience in Resend
    const resend = new Resend(config.apiKey)

    // Get site name for audience
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('name')
      .eq('id', siteId)
      .single()

    const { data: audience, error: audienceError } = await resend.audiences.create({
      name: site?.name || 'Newsletter',
    })

    if (audienceError) {
      console.error('Failed to create Resend audience:', audienceError)
      return { audienceId: null, error: 'Failed to create audience in Resend' }
    }

    // Store audience ID in integration config
    if (integration) {
      await supabaseAdmin
        .from('site_integrations')
        .update({
          config: { ...integration.config, audience_id: audience.id },
        })
        .eq('id', integration.id)
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
    const user = await verifyAuth()
    if (!user) return { synced: 0, error: 'Not authenticated' }
    if (!await verifySiteOwnership(siteId, user.id)) return { synced: 0, error: 'Access denied' }
    if (!UUID_REGEX.test(siteId)) return { synced: 0, error: 'Invalid site ID' }

    const config = await getResendConfig(siteId)
    if (!config?.apiKey) return { synced: 0, error: 'Resend not configured' }

    const { audienceId, error: audienceError } = await getOrCreateResendAudience(siteId)
    if (!audienceId) return { synced: 0, error: audienceError }

    const resend = new Resend(config.apiKey)

    // Get all active contacts
    const { data: contacts, error: dbError } = await supabaseAdmin
      .from('newsletter_contacts')
      .select('email, metadata')
      .eq('site_id', siteId)
      .eq('status', 'active')

    if (dbError) {
      console.error('syncContactsToResend db error:', dbError.message)
      return { synced: 0, error: 'Failed to load contacts' }
    }

    if (!contacts?.length) return { synced: 0, error: null }

    // Sync contacts to Resend audience in batches
    let synced = 0
    for (const contact of contacts) {
      try {
        await resend.contacts.create({
          audienceId,
          email: contact.email,
          firstName: contact.metadata?.first_name || undefined,
          lastName: contact.metadata?.last_name || undefined,
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
    const user = await verifyAuth()
    if (!user) return { count: 0, error: 'Not authenticated' }
    if (!await verifySiteOwnership(siteId, user.id)) return { count: 0, error: 'Access denied' }

    let query = supabaseAdmin
      .from('newsletter_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('status', 'active')

    if (audienceFilter.tags?.length) {
      // Filter contacts whose metadata tags overlap with filter tags
      for (const tag of audienceFilter.tags) {
        query = query.contains('metadata', { tags: [tag] })
      }
    }

    if (audienceFilter.sources?.length) {
      query = query.in('metadata->>source', audienceFilter.sources)
    }

    if (audienceFilter.min_engagement_score) {
      query = query.gte('engagement_score', audienceFilter.min_engagement_score)
    }

    const { count, error } = await query

    if (error) {
      console.error('getAudienceCount error:', error.message)
      return { count: 0, error: 'Failed to count audience' }
    }

    return { count: count ?? 0, error: null }
  } catch (err) {
    console.error('getAudienceCount error:', err)
    return { count: 0, error: 'Server error' }
  }
}
