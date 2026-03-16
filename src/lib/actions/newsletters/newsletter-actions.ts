'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getResendConfig } from '@/lib/actions/integrations/config-helpers'
import { Resend } from 'resend'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { generateEmailHtml } from './email-html'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export interface Newsletter {
  id: string
  site_id: string
  subject: string
  content: string
  content_blocks: Record<string, any>
  from_name: string | null
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused'
  audience_filter: Record<string, any>
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  total_sent: number
  total_opened: number
  total_clicked: number
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

interface NewsletterBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}


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

export async function getNewslettersBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: Newsletter[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, total: 0, error: 'Access denied' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await supabaseAdmin
      .from('newsletters')
      .select('*', { count: 'exact' })
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('getNewslettersBySite error:', error.message)
      return { data: null, total: 0, error: 'Failed to load newsletters' }
    }

    return { data: data as Newsletter[], total: count ?? 0, error: null }
  } catch (err) {
    console.error('getNewslettersBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getNewsletterById(
  newsletterId: string
): Promise<{ data: Newsletter | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { data: null, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: newsletter, error } = await supabaseAdmin
      .from('newsletters')
      .select('*')
      .eq('id', newsletterId)
      .single()

    if (error || !newsletter) return { data: null, error: 'Newsletter not found' }

    if (!await verifySiteOwnership(newsletter.site_id, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    return { data: newsletter as Newsletter, error: null }
  } catch (err) {
    console.error('getNewsletterById error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function createNewsletter(input: {
  siteId: string
  subject: string
  audience_filter?: Record<string, any>
  content?: string
  status?: 'draft' | 'scheduled'
}): Promise<{ data: Newsletter | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (!input.subject?.trim()) return { data: null, error: 'Subject is required' }

    const subjectTrimmed = input.subject.trim()

    const { data, error } = await supabaseAdmin
      .from('newsletters')
      .insert({
        site_id: input.siteId,
        subject: subjectTrimmed,
        audience_filter: input.audience_filter || {},
        content: input.content || '',
        status: input.status || 'draft',
      })
      .select()
      .single()

    if (error) {
      console.error('createNewsletter error:', error.message)
      return { data: null, error: 'Failed to create newsletter' }
    }

    return { data: data as Newsletter, error: null }
  } catch (err) {
    console.error('createNewsletter error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateNewsletter(
  newsletterId: string,
  updates: { subject?: string; content?: string; content_blocks?: Record<string, any>; status?: string; audience_filter?: Record<string, any>; metadata?: Record<string, any> }
): Promise<{ data: Newsletter | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { data: null, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: newsletter } = await supabaseAdmin
      .from('newsletters')
      .select('site_id, metadata')
      .eq('id', newsletterId)
      .single()

    if (!newsletter) return { data: null, error: 'Newsletter not found' }

    if (!await verifySiteOwnership(newsletter.site_id, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (updates.status !== undefined && !['draft', 'scheduled', 'paused'].includes(updates.status)) {
      return { data: null, error: 'Invalid status' }
    }

    const allowedFields: Record<string, any> = {}
    if (updates.subject !== undefined) allowedFields.subject = updates.subject
    if (updates.content !== undefined) allowedFields.content = updates.content
    if (updates.status !== undefined) allowedFields.status = updates.status
    if (updates.audience_filter !== undefined) allowedFields.audience_filter = updates.audience_filter
    if (updates.metadata !== undefined) allowedFields.metadata = updates.metadata
    if (updates.content_blocks !== undefined) {
      allowedFields.content_blocks = updates.content_blocks
      // Regenerate email HTML from blocks
      const blockEntries = Object.values(updates.content_blocks).filter((b: any) => b.id && b.type)
      const sortedBlocks = (blockEntries as NewsletterBlock[]).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      if (sortedBlocks.length > 0) {
        // Get maxWidth from metadata (check updates first, then existing DB metadata)
        const maxWidth = updates.metadata?.maxWidth || newsletter.metadata?.maxWidth || 600
        allowedFields.content = generateEmailHtml(sortedBlocks, maxWidth)
      }
    }

    const { data, error } = await supabaseAdmin
      .from('newsletters')
      .update(allowedFields)
      .eq('id', newsletterId)
      .select()
      .single()

    if (error) {
      console.error('updateNewsletter error:', error.message)
      return { data: null, error: 'Failed to update newsletter' }
    }

    return { data: data as Newsletter, error: null }
  } catch (err) {
    console.error('updateNewsletter error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteNewsletters(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }
    for (const id of ids) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' }
    }

    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: newsletters } = await supabaseAdmin
      .from('newsletters')
      .select('id, site_id')
      .in('id', ids)

    if (!newsletters?.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(newsletters.map(n => n.site_id))]
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('id')
      .in('id', siteIds)
      .eq('user_id', user.id)

    if (!sites?.length || sites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await supabaseAdmin
      .from('newsletters')
      .delete()
      .in('id', ids)

    if (error) {
      console.error('deleteNewsletters error:', error.message)
      return { success: false, error: 'Failed to delete' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteNewsletters error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function sendNewsletter(newsletterId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { success: false, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: newsletter } = await supabaseAdmin
      .from('newsletters')
      .select('*')
      .eq('id', newsletterId)
      .single()

    if (!newsletter) return { success: false, error: 'Newsletter not found' }
    if (!await verifySiteOwnership(newsletter.site_id, user.id)) {
      return { success: false, error: 'Access denied' }
    }
    if (newsletter.status === 'sent' || newsletter.status === 'sending' || newsletter.status === 'paused') {
      return { success: false, error: 'Already sent or in progress' }
    }
    // Generate HTML from content_blocks if content is empty
    if (!newsletter.content?.trim()) {
      const contentBlocks = newsletter.content_blocks || {}
      const blockEntries = Object.values(contentBlocks).filter((b: any) => b.id && b.type)
      const sortedBlocks = (blockEntries as NewsletterBlock[]).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      if (sortedBlocks.length > 0) {
        const maxWidth = newsletter.metadata?.maxWidth || 600
        newsletter.content = generateEmailHtml(sortedBlocks, maxWidth)
        await supabaseAdmin.from('newsletters').update({ content: newsletter.content }).eq('id', newsletterId)
      }
    }
    if (!newsletter.content?.trim()) {
      return { success: false, error: 'Newsletter has no content' }
    }

    const config = await getResendConfig(newsletter.site_id)
    if (!config?.apiKey) return { success: false, error: 'Resend not configured' }

    let filter = newsletter.audience_filter || {}
    if (!filter.audience && !filter.segment_id && !filter.tags?.length && !filter.sources?.length) {
      return { success: false, error: 'No audience selected. Choose a segment or audience before sending.' }
    }

    await supabaseAdmin.from('newsletters').update({ status: 'sending' }).eq('id', newsletterId)

    let query = supabaseAdmin
      .from('newsletter_contacts')
      .select('id, email, metadata')
      .eq('site_id', newsletter.site_id)
      .eq('status', 'active')

    // Resolve segment if segment_id is set
    if (filter.segment_id) {
      const { data: segment } = await supabaseAdmin
        .from('newsletter_segments')
        .select('filter_rules')
        .eq('id', filter.segment_id)
        .single()
      if (segment?.filter_rules?.tags?.length) {
        filter = { ...filter, tags: segment.filter_rules.tags }
      }
    }

    if (filter.tags?.length) {
      for (const tag of filter.tags) {
        query = query.contains('metadata', { tags: [tag] })
      }
    }
    if (filter.sources?.length) {
      query = query.in('metadata->>source', filter.sources)
    }

    const { data: contacts } = await query

    if (!contacts?.length) {
      await supabaseAdmin.from('newsletters').update({ status: 'draft' }).eq('id', newsletterId)
      return { success: false, error: 'No matching contacts' }
    }

    const resend = new Resend(config.apiKey)
    const fromEmail = config.fromEmail
    if (!fromEmail) {
      await supabaseAdmin.from('newsletters').update({ status: 'draft' }).eq('id', newsletterId)
      return { success: false, error: 'From email not configured in Resend settings' }
    }

    const from = config.fromName ? `${config.fromName} <${fromEmail}>` : fromEmail
    const baseUrl = process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'

    const dripConfig = newsletter.metadata?.drip_config
    const isDrip = dripConfig?.enabled === true

    // For drip mode, only send a random-sized first batch
    const contactsToSend = isDrip
      ? contacts.slice(0, Math.floor(Math.random() * (dripConfig.batch_size_max - dripConfig.batch_size_min + 1)) + dripConfig.batch_size_min)
      : contacts

    let totalSent = 0
    const errors: string[] = []

    for (const contact of contactsToSend) {
      try {
        const unsubToken = generateUnsubscribeToken(newsletter.site_id, contact.email)
        const unsubUrl = `${baseUrl}/unsubscribe?site=${newsletter.site_id}&email=${encodeURIComponent(contact.email)}&token=${unsubToken}`

        const htmlWithUnsub = newsletter.content + `
          <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;">
            <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
          </div>`

        const result = await resend.emails.send({
          from,
          to: contact.email,
          subject: newsletter.subject,
          html: htmlWithUnsub,
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })

        if (result.data?.id) {
          totalSent++
          await supabaseAdmin.from('newsletter_events').insert({
            site_id: newsletter.site_id,
            contact_id: contact.id,
            event_type: 'sent',
            source_type: 'broadcast',
            source_id: newsletterId,
            resend_message_id: result.data.id,
          })
        }
      } catch {
        errors.push(contact.email)
      }
    }

    if (isDrip && contacts.length > contactsToSend.length) {
      // Drip mode: set next batch time, keep status as 'sending'
      const intervalMin = dripConfig.interval_min_minutes || 30
      const intervalMax = dripConfig.interval_max_minutes || 60
      const nextIntervalMs = (Math.floor(Math.random() * (intervalMax - intervalMin + 1)) + intervalMin) * 60 * 1000
      const nextBatchAt = new Date(Date.now() + nextIntervalMs).toISOString()

      await supabaseAdmin
        .from('newsletters')
        .update({
          total_recipients: contacts.length,
          total_sent: totalSent,
          metadata: {
            ...newsletter.metadata,
            send_errors: errors,
            drip_config: {
              ...dripConfig,
              next_batch_at: nextBatchAt,
              batches_sent: 1,
              total_bounced: 0,
              paused_reason: null,
            },
          },
        })
        .eq('id', newsletterId)
    } else {
      // Non-drip or all contacts fit in first batch
      await supabaseAdmin
        .from('newsletters')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          total_recipients: contacts.length,
          total_sent: totalSent,
          metadata: { ...newsletter.metadata, send_errors: errors },
        })
        .eq('id', newsletterId)
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('sendNewsletter error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function sendTestNewsletter(
  newsletterId: string,
  testEmail: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { success: false, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: newsletter } = await supabaseAdmin
      .from('newsletters')
      .select('*')
      .eq('id', newsletterId)
      .single()

    if (!newsletter) return { success: false, error: 'Newsletter not found' }
    if (!await verifySiteOwnership(newsletter.site_id, user.id)) {
      return { success: false, error: 'Access denied' }
    }

    // Generate HTML from content_blocks (always fresh)
    const contentBlocks = newsletter.content_blocks || {}
    const blockEntries = Object.values(contentBlocks).filter((b: any) => b.id && b.type)
    const sortedBlocks = (blockEntries as NewsletterBlock[]).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))

    const maxWidth = newsletter.metadata?.maxWidth || 600
    const html = sortedBlocks.length > 0 ? generateEmailHtml(sortedBlocks, maxWidth) : newsletter.content
    if (!html?.trim()) {
      return { success: false, error: 'Newsletter has no content. Add some blocks and save first.' }
    }

    const config = await getResendConfig(newsletter.site_id)
    if (!config?.apiKey || !config?.fromEmail) {
      return { success: false, error: 'Resend not configured. Add your Resend API key in site integrations.' }
    }

    const resend = new Resend(config.apiKey)
    const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail

    const result = await resend.emails.send({
      from,
      to: testEmail,
      subject: `[TEST] ${newsletter.subject}`,
      html,
    })

    if (result.error) {
      return { success: false, error: result.error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('sendTestNewsletter error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function pauseNewsletter(newsletterId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { success: false, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: newsletter } = await supabaseAdmin
      .from('newsletters')
      .select('site_id, status, metadata')
      .eq('id', newsletterId)
      .single()

    if (!newsletter) return { success: false, error: 'Newsletter not found' }
    if (!await verifySiteOwnership(newsletter.site_id, user.id)) {
      return { success: false, error: 'Access denied' }
    }
    if (newsletter.status !== 'sending') {
      return { success: false, error: 'Newsletter is not currently sending' }
    }

    await supabaseAdmin
      .from('newsletters')
      .update({
        status: 'paused',
        metadata: {
          ...newsletter.metadata,
          drip_config: {
            ...newsletter.metadata?.drip_config,
            paused_reason: 'manual',
          },
        },
      })
      .eq('id', newsletterId)

    return { success: true, error: null }
  } catch (err) {
    console.error('pauseNewsletter error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function resumeNewsletter(newsletterId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { success: false, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: newsletter } = await supabaseAdmin
      .from('newsletters')
      .select('site_id, status, metadata')
      .eq('id', newsletterId)
      .single()

    if (!newsletter) return { success: false, error: 'Newsletter not found' }
    if (!await verifySiteOwnership(newsletter.site_id, user.id)) {
      return { success: false, error: 'Access denied' }
    }
    if (newsletter.status !== 'paused') {
      return { success: false, error: 'Newsletter is not paused' }
    }

    await supabaseAdmin
      .from('newsletters')
      .update({
        status: 'sending',
        metadata: {
          ...newsletter.metadata,
          drip_config: {
            ...newsletter.metadata?.drip_config,
            next_batch_at: new Date().toISOString(),
            paused_reason: null,
          },
        },
      })
      .eq('id', newsletterId)

    return { success: true, error: null }
  } catch (err) {
    console.error('resumeNewsletter error:', err)
    return { success: false, error: 'Server error' }
  }
}
