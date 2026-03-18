'use server'

import { eq, and, sql, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletters, newsletterContacts, newsletterSegments, newsletterEvents, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { getResendConfig } from '@/lib/actions/integrations/config-helpers'
import { Resend } from 'resend'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { generateEmailHtml } from './email-html'

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

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

function rowToNewsletter(row: any): Newsletter {
  return {
    id: row.id,
    site_id: row.siteId,
    subject: row.subject,
    content: row.content,
    content_blocks: row.contentBlocks ?? {},
    from_name: row.fromName ?? null,
    status: row.status,
    audience_filter: row.audienceFilter ?? {},
    scheduled_at: row.scheduledAt?.toISOString() ?? null,
    sent_at: row.sentAt?.toISOString() ?? null,
    total_recipients: row.totalRecipients ?? 0,
    total_sent: row.totalSent ?? 0,
    total_opened: row.totalOpened ?? 0,
    total_clicked: row.totalClicked ?? 0,
    metadata: row.metadata ?? {},
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

export async function getNewslettersBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: Newsletter[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, total: 0, error: 'Access denied' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(newsletters)
        .where(eq(newsletters.siteId, siteId))
        .orderBy(desc(newsletters.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletters)
        .where(eq(newsletters.siteId, siteId)),
    ])

    return { data: rows.map(rowToNewsletter), total: countResult[0]?.count ?? 0, error: null }
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

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [row] = await db
      .select()
      .from(newsletters)
      .where(eq(newsletters.id, newsletterId))
      .limit(1)

    if (!row) return { data: null, error: 'Newsletter not found' }

    if (!await verifySiteOwnership(row.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    return { data: rowToNewsletter(row), error: null }
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

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (!input.subject?.trim()) return { data: null, error: 'Subject is required' }

    const subjectTrimmed = input.subject.trim()

    const [data] = await db
      .insert(newsletters)
      .values({
        siteId: input.siteId,
        name: subjectTrimmed,
        subject: subjectTrimmed,
        audienceFilter: input.audience_filter || {},
        content: input.content || '',
        status: input.status || 'draft',
      })
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to create newsletter' }
    }

    return { data: rowToNewsletter(data), error: null }
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

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [newsletter] = await db
      .select({ siteId: newsletters.siteId, metadata: newsletters.metadata })
      .from(newsletters)
      .where(eq(newsletters.id, newsletterId))
      .limit(1)

    if (!newsletter) return { data: null, error: 'Newsletter not found' }

    if (!await verifySiteOwnership(newsletter.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (updates.status !== undefined && !['draft', 'scheduled', 'paused'].includes(updates.status)) {
      return { data: null, error: 'Invalid status' }
    }

    const allowedFields: Record<string, any> = { updatedAt: new Date() }
    if (updates.subject !== undefined) allowedFields.subject = updates.subject
    if (updates.content !== undefined) allowedFields.content = updates.content
    if (updates.status !== undefined) allowedFields.status = updates.status
    if (updates.audience_filter !== undefined) allowedFields.audienceFilter = updates.audience_filter
    if (updates.metadata !== undefined) allowedFields.metadata = updates.metadata
    if (updates.content_blocks !== undefined) {
      allowedFields.contentBlocks = updates.content_blocks
      // Regenerate email HTML from blocks
      const blockEntries = Object.values(updates.content_blocks).filter((b: any) => b.id && b.type)
      const sortedBlocks = (blockEntries as NewsletterBlock[]).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      if (sortedBlocks.length > 0) {
        // Get maxWidth from metadata (check updates first, then existing DB metadata)
        const existingMeta = newsletter.metadata as Record<string, any> | null
        const maxWidth = updates.metadata?.maxWidth || existingMeta?.maxWidth || 600
        allowedFields.content = generateEmailHtml(sortedBlocks, maxWidth)
      }
    }

    const [data] = await db
      .update(newsletters)
      .set(allowedFields)
      .where(eq(newsletters.id, newsletterId))
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to update newsletter' }
    }

    return { data: rowToNewsletter(data), error: null }
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

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const rows = await db
      .select({ id: newsletters.id, siteId: newsletters.siteId })
      .from(newsletters)
      .where(inArray(newsletters.id, ids))

    if (!rows.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(rows.map(n => n.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    await db.delete(newsletters).where(inArray(newsletters.id, ids))

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteNewsletters error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function sendNewsletter(newsletterId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { success: false, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [nlRow] = await db
      .select()
      .from(newsletters)
      .where(eq(newsletters.id, newsletterId))
      .limit(1)

    if (!nlRow) return { success: false, error: 'Newsletter not found' }
    if (!await verifySiteOwnership(nlRow.siteId, user.id)) {
      return { success: false, error: 'Access denied' }
    }

    const newsletter = rowToNewsletter(nlRow)

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
        await db.update(newsletters).set({ content: newsletter.content }).where(eq(newsletters.id, newsletterId))
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

    await db.update(newsletters).set({ status: 'sending' }).where(eq(newsletters.id, newsletterId))

    // Resolve segment if segment_id is set
    if (filter.segment_id) {
      const [segment] = await db
        .select({ filterRules: newsletterSegments.filterRules })
        .from(newsletterSegments)
        .where(eq(newsletterSegments.id, filter.segment_id))
        .limit(1)
      const rules = segment?.filterRules as Record<string, any> | null
      if (rules?.tags?.length) {
        filter = { ...filter, tags: rules.tags }
      }
    }

    // Build contact query conditions
    const contactConditions = [
      eq(newsletterContacts.siteId, newsletter.site_id),
      eq(newsletterContacts.status, 'active'),
    ]

    if (filter.tags?.length) {
      for (const tag of filter.tags) {
        contactConditions.push(sql`${newsletterContacts.metadata} @> ${JSON.stringify({ tags: [tag] })}::jsonb`)
      }
    }
    if (filter.sources?.length) {
      contactConditions.push(sql`${newsletterContacts.metadata}->>'source' IN (${sql.join(filter.sources.map((s: string) => sql`${s}`), sql`, `)})`)
    }

    const contacts = await db
      .select({ id: newsletterContacts.id, email: newsletterContacts.email, metadata: newsletterContacts.metadata })
      .from(newsletterContacts)
      .where(and(...contactConditions))

    if (!contacts.length) {
      await db.update(newsletters).set({ status: 'draft' }).where(eq(newsletters.id, newsletterId))
      return { success: false, error: 'No matching contacts' }
    }

    const resend = new Resend(config.apiKey)
    const fromEmail = config.fromEmail
    if (!fromEmail) {
      await db.update(newsletters).set({ status: 'draft' }).where(eq(newsletters.id, newsletterId))
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
          await db.insert(newsletterEvents).values({
            siteId: newsletter.site_id,
            contactId: contact.id,
            eventType: 'sent',
            sourceType: 'broadcast',
            sourceId: newsletterId,
            resendMessageId: result.data.id,
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

      await db
        .update(newsletters)
        .set({
          totalRecipients: contacts.length,
          totalSent: totalSent,
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
        .where(eq(newsletters.id, newsletterId))
    } else {
      // Non-drip or all contacts fit in first batch
      await db
        .update(newsletters)
        .set({
          status: 'sent',
          sentAt: new Date(),
          totalRecipients: contacts.length,
          totalSent: totalSent,
          metadata: { ...newsletter.metadata, send_errors: errors },
        })
        .where(eq(newsletters.id, newsletterId))
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

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [nlRow] = await db
      .select()
      .from(newsletters)
      .where(eq(newsletters.id, newsletterId))
      .limit(1)

    if (!nlRow) return { success: false, error: 'Newsletter not found' }
    if (!await verifySiteOwnership(nlRow.siteId, user.id)) {
      return { success: false, error: 'Access denied' }
    }

    const newsletter = rowToNewsletter(nlRow)

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

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [nlRow] = await db
      .select({ siteId: newsletters.siteId, status: newsletters.status, metadata: newsletters.metadata })
      .from(newsletters)
      .where(eq(newsletters.id, newsletterId))
      .limit(1)

    if (!nlRow) return { success: false, error: 'Newsletter not found' }
    if (!await verifySiteOwnership(nlRow.siteId, user.id)) {
      return { success: false, error: 'Access denied' }
    }
    if (nlRow.status !== 'sending') {
      return { success: false, error: 'Newsletter is not currently sending' }
    }

    const existingMeta = nlRow.metadata as Record<string, any> | null

    await db
      .update(newsletters)
      .set({
        status: 'paused',
        metadata: {
          ...existingMeta,
          drip_config: {
            ...existingMeta?.drip_config,
            paused_reason: 'manual',
          },
        },
      })
      .where(eq(newsletters.id, newsletterId))

    return { success: true, error: null }
  } catch (err) {
    console.error('pauseNewsletter error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function resumeNewsletter(newsletterId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { success: false, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [nlRow] = await db
      .select({ siteId: newsletters.siteId, status: newsletters.status, metadata: newsletters.metadata })
      .from(newsletters)
      .where(eq(newsletters.id, newsletterId))
      .limit(1)

    if (!nlRow) return { success: false, error: 'Newsletter not found' }
    if (!await verifySiteOwnership(nlRow.siteId, user.id)) {
      return { success: false, error: 'Access denied' }
    }
    if (nlRow.status !== 'paused') {
      return { success: false, error: 'Newsletter is not paused' }
    }

    const existingMeta = nlRow.metadata as Record<string, any> | null

    await db
      .update(newsletters)
      .set({
        status: 'sending',
        metadata: {
          ...existingMeta,
          drip_config: {
            ...existingMeta?.drip_config,
            next_batch_at: new Date().toISOString(),
            paused_reason: null,
          },
        },
      })
      .where(eq(newsletters.id, newsletterId))

    return { success: true, error: null }
  } catch (err) {
    console.error('resumeNewsletter error:', err)
    return { success: false, error: 'Server error' }
  }
}
