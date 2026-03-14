'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getResendConfig } from '@/lib/actions/integrations/config-helpers'
import { Resend } from 'resend'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export interface Newsletter {
  id: string
  site_id: string
  name: string
  subject: string
  content: string
  content_blocks: Record<string, any>
  from_name: string | null
  status: 'draft' | 'scheduled' | 'sending' | 'sent'
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function generateEmailHtml(blocks: NewsletterBlock[]): string {
  const blockHtmlParts = blocks.map(block => {
    switch (block.type) {
      case 'newsletter-header': {
        const { logoUrl, siteName, showSiteName, alignment = 'center', backgroundColor = '#ffffff', padding = 20 } = block.content
        const align = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center'
        let inner = ''
        if (logoUrl) {
          inner += `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(siteName || '')}" style="max-width:200px;height:auto;display:block;margin:0 ${align === 'center' ? 'auto' : '0'};" />`
        }
        if (showSiteName !== false && siteName) {
          inner += `<h1 style="margin:${logoUrl ? '12px' : '0'} 0 0 0;font-size:24px;font-weight:bold;color:#333333;text-align:${align};">${escapeHtml(siteName)}</h1>`
        }
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${escapeHtml(backgroundColor)};"><tr><td style="padding:${padding}px;text-align:${align};">${inner}</td></tr></table>`
      }
      case 'newsletter-rich-text': {
        const { htmlContent = '', backgroundColor = '#ffffff', padding = 20 } = block.content
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${escapeHtml(backgroundColor)};"><tr><td style="padding:${padding}px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#333333;">${htmlContent}</td></tr></table>`
      }
      case 'newsletter-divider': {
        const { color = '#e5e7eb', thickness = 1, width = 100, spacing = 20 } = block.content
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:${spacing}px 0;text-align:center;"><hr style="border:none;border-top:${thickness}px solid ${escapeHtml(color)};width:${width}%;margin:0 auto;" /></td></tr></table>`
      }
      case 'newsletter-footer': {
        const { companyName = '', companyAddress = '', showUnsubscribe = true, alignment = 'center' } = block.content
        const align = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center'
        let inner = ''
        if (companyName) inner += `<p style="margin:0 0 4px 0;font-weight:bold;">${escapeHtml(companyName)}</p>`
        if (companyAddress) inner += `<p style="margin:0 0 12px 0;">${escapeHtml(companyAddress)}</p>`
        if (showUnsubscribe) inner += `<p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#999999;text-decoration:underline;">Unsubscribe</a></p>`
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:20px;text-align:${align};font-family:Arial,sans-serif;font-size:12px;color:#999999;">${inner}</td></tr></table>`
      }
      default:
        return ''
    }
  })

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;"><tr><td align="center" style="padding:20px 0;"><table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;">${blockHtmlParts.join('')}</table></td></tr></table></body></html>`
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
  name: string
  subject: string
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

    if (!input.name?.trim()) return { data: null, error: 'Newsletter name is required' }
    if (!input.subject?.trim()) return { data: null, error: 'Subject is required' }

    const { data, error } = await supabaseAdmin
      .from('newsletters')
      .insert({
        site_id: input.siteId,
        name: input.name.trim(),
        subject: input.subject.trim(),
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
  updates: { name?: string; subject?: string; content?: string; content_blocks?: Record<string, any>; status?: string; audience_filter?: Record<string, any> }
): Promise<{ data: Newsletter | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { data: null, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: newsletter } = await supabaseAdmin
      .from('newsletters')
      .select('site_id')
      .eq('id', newsletterId)
      .single()

    if (!newsletter) return { data: null, error: 'Newsletter not found' }

    if (!await verifySiteOwnership(newsletter.site_id, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (updates.status !== undefined && !['draft', 'scheduled'].includes(updates.status)) {
      return { data: null, error: 'Invalid status' }
    }

    const allowedFields: Record<string, any> = {}
    if (updates.name !== undefined) allowedFields.name = updates.name
    if (updates.subject !== undefined) allowedFields.subject = updates.subject
    if (updates.content !== undefined) allowedFields.content = updates.content
    if (updates.status !== undefined) allowedFields.status = updates.status
    if (updates.audience_filter !== undefined) allowedFields.audience_filter = updates.audience_filter
    if (updates.content_blocks !== undefined) {
      allowedFields.content_blocks = updates.content_blocks
      // Regenerate email HTML from blocks
      const blockEntries = Object.values(updates.content_blocks).filter((b: any) => b.id && b.type)
      const sortedBlocks = (blockEntries as NewsletterBlock[]).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      if (sortedBlocks.length > 0) {
        allowedFields.content = generateEmailHtml(sortedBlocks)
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
    if (newsletter.status === 'sent' || newsletter.status === 'sending') {
      return { success: false, error: 'Already sent' }
    }
    if (!newsletter.content?.trim()) {
      return { success: false, error: 'Newsletter has no content' }
    }

    const config = await getResendConfig(newsletter.site_id)
    if (!config?.apiKey) return { success: false, error: 'Resend not configured' }

    await supabaseAdmin.from('newsletters').update({ status: 'sending' }).eq('id', newsletterId)

    let query = supabaseAdmin
      .from('newsletter_contacts')
      .select('id, email, metadata')
      .eq('site_id', newsletter.site_id)
      .eq('status', 'active')

    let filter = newsletter.audience_filter || {}

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

    let totalSent = 0
    const errors: string[] = []

    for (const contact of contacts) {
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
          subject: newsletter.subject || newsletter.name,
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
    if (!newsletter.content?.trim()) {
      return { success: false, error: 'Newsletter has no content' }
    }

    const config = await getResendConfig(newsletter.site_id)
    if (!config?.apiKey || !config?.fromEmail) {
      return { success: false, error: 'Resend not configured' }
    }

    const resend = new Resend(config.apiKey)
    const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail

    const result = await resend.emails.send({
      from,
      to: testEmail,
      subject: `[TEST] ${newsletter.subject || newsletter.name}`,
      html: newsletter.content,
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
