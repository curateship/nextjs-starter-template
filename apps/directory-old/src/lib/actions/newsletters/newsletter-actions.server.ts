import { eq, and, sql, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletters, newsletterContacts, newsletterSegmentContacts, newsletterSourceStats, sites } from '@/lib/db/schema'
import { checkSiteAccess, getAuthenticatedUser, verifySiteOwnership } from '@/lib/db/helpers'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { getEmailProvider } from '@/lib/actions/email/provider'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { DEFAULT_NEWSLETTER_MAX_WIDTH, sortNewsletterBlocks } from '@/lib/actions/newsletters/render'
import { renderNewsletterEmailHtml } from '@/lib/actions/newsletters/render-blocks'
import { isWithinNewsletterSendWindow } from '@/lib/actions/newsletters/send-windows'
import { queryNewsletterStatusEvents, type NewsletterStatusEvent, type NewsletterStatusEventFilter } from '@/lib/actions/newsletters/status-events-query'
import { recordNewsletterDeliverySent } from '@/lib/actions/newsletters/event-stats'
import { acquireDeliveryLock, clearDeliveryLock, isNewsletterPaused, releaseDeliveryLock } from '@/lib/actions/newsletters/delivery-lock'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'

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
  total_send_events: number
  duplicate_send_events: number
  total_opened: number
  total_clicked: number
  total_unsubscribed: number
  total_bounced: number
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}


function rowToNewsletter(row: any, totalUnsubscribed = 0, totalSendEvents?: number, duplicateSendEvents = 0, totalBounced = 0): Newsletter {
  const uniqueSent = row.totalSent ?? 0
  const sendEvents = totalSendEvents ?? uniqueSent
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
    total_sent: uniqueSent,
    total_send_events: sendEvents,
    duplicate_send_events: duplicateSendEvents,
    total_opened: row.totalOpened ?? 0,
    total_clicked: row.totalClicked ?? 0,
    total_unsubscribed: totalUnsubscribed,
    total_bounced: totalBounced,
    metadata: row.metadata ?? {},
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

export async function getNewslettersBySiteImpl(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: Newsletter[] | null; total: number; error: string | null }> {
  try {
    const access = await checkSiteAccess(siteId)
    if (access.error) return { data: null, total: 0, error: access.error }

    const { page, pageSize, offset } = normalizePagination(options)

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

    const newsletterIds = rows.map((row) => row.id)
    const statsRows = newsletterIds.length === 0
      ? []
      : await db
        .select()
        .from(newsletterSourceStats)
        .where(and(
          eq(newsletterSourceStats.siteId, siteId),
          eq(newsletterSourceStats.sourceType, 'broadcast'),
          eq(newsletterSourceStats.stepOrder, 0),
          inArray(newsletterSourceStats.sourceId, newsletterIds),
        ))

    const statsByNewsletter = new Map(statsRows.map((row) => [row.sourceId, row]))
    return {
      data: rows.map((row) => {
        const stats = statsByNewsletter.get(row.id)
        return rowToNewsletter(
          stats
            ? {
                ...row,
                totalSent: stats.sent,
                totalOpened: stats.opened,
                totalClicked: stats.clicked,
              }
            : row,
          stats?.unsubscribed ?? 0,
          stats ? stats.sent + stats.duplicateSends : (row.totalSent ?? 0),
          stats?.duplicateSends ?? 0,
          stats?.bounced ?? 0,
        )
      }),
      total: countResult[0]?.count ?? 0,
      error: null,
    }
  } catch (err) {
    console.error('getNewslettersBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getNewsletterByIdImpl(
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

    const [stats] = await db
      .select()
      .from(newsletterSourceStats)
      .where(and(
        eq(newsletterSourceStats.siteId, row.siteId),
        eq(newsletterSourceStats.sourceType, 'broadcast'),
        eq(newsletterSourceStats.sourceId, row.id),
        eq(newsletterSourceStats.stepOrder, 0),
      ))
      .limit(1)

    return {
      data: rowToNewsletter(
        stats
          ? {
              ...row,
              totalSent: stats.sent,
              totalOpened: stats.opened,
              totalClicked: stats.clicked,
            }
          : row,
        stats?.unsubscribed ?? 0,
        stats ? stats.sent + stats.duplicateSends : (row.totalSent ?? 0),
        stats?.duplicateSends ?? 0,
        stats?.bounced ?? 0,
      ),
      error: null,
    }
  } catch (err) {
    console.error('getNewsletterById error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function getNewsletterStatusEventsImpl(
  newsletterId: string,
  options?: { page?: number; pageSize?: number; eventFilter?: NewsletterStatusEventFilter },
): Promise<{ data: NewsletterStatusEvent[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(newsletterId)) return { data: null, total: 0, error: 'Invalid newsletter ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }

    const [newsletter] = await db
      .select({ id: newsletters.id, siteId: newsletters.siteId })
      .from(newsletters)
      .where(eq(newsletters.id, newsletterId))
      .limit(1)

    if (!newsletter) return { data: null, total: 0, error: 'Newsletter not found' }
    if (!await verifySiteOwnership(newsletter.siteId, user.id)) return { data: null, total: 0, error: 'Access denied' }

    const result = await queryNewsletterStatusEvents({
      eventFilter: options?.eventFilter,
      page: options?.page,
      pageSize: options?.pageSize,
      siteId: newsletter.siteId,
      sourceId: newsletterId,
      sourceType: 'broadcast',
    })

    return {
      data: result.data,
      total: result.total,
      error: null,
    }
  } catch (err) {
    console.error('getNewsletterStatusEvents error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function createNewsletterImpl(input: {
  siteId: string
  subject: string
  audience_filter?: Record<string, any>
  content_blocks?: Record<string, any>
  content?: string
  metadata?: Record<string, any>
  status?: 'draft' | 'scheduled'
}): Promise<{ data: Newsletter | null; error: string | null }> {
  try {
    const access = await checkSiteAccess(input.siteId)
    if (access.error) return { data: null, error: access.error }

    if (!input.subject?.trim()) return { data: null, error: 'Subject is required' }

    const subjectTrimmed = input.subject.trim()
    const contentBlocks = input.content_blocks || {}
    const sortedBlocks = sortNewsletterBlocks(contentBlocks)
    const maxWidth = input.metadata?.maxWidth || DEFAULT_NEWSLETTER_MAX_WIDTH
    const generatedContent = sortedBlocks.length > 0
      ? await renderNewsletterEmailHtml(input.siteId, sortedBlocks, maxWidth)
      : (input.content || '')

    const [data] = await db
      .insert(newsletters)
      .values({
        siteId: input.siteId,
        name: subjectTrimmed,
        subject: subjectTrimmed,
        audienceFilter: input.audience_filter || {},
        content: generatedContent,
        contentBlocks,
        metadata: input.metadata || {},
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

export async function updateNewsletterImpl(
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
      const sortedBlocks = sortNewsletterBlocks(updates.content_blocks)
      if (sortedBlocks.length > 0) {
        // Get maxWidth from metadata (check updates first, then existing DB metadata)
        const existingMeta = newsletter.metadata as Record<string, any> | null
        const maxWidth = updates.metadata?.maxWidth || existingMeta?.maxWidth || DEFAULT_NEWSLETTER_MAX_WIDTH
        allowedFields.content = await renderNewsletterEmailHtml(newsletter.siteId, sortedBlocks, maxWidth)
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

export async function deleteNewslettersImpl(ids: string[]): Promise<{ success: boolean; error: string | null }> {
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

export async function sendNewsletterImpl(newsletterId: string): Promise<{ success: boolean; error: string | null }> {
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
    const sortedBlocks = sortNewsletterBlocks(newsletter.content_blocks)
    if (sortedBlocks.length > 0) {
      const maxWidth = newsletter.metadata?.maxWidth || DEFAULT_NEWSLETTER_MAX_WIDTH
      newsletter.content = await renderNewsletterEmailHtml(newsletter.site_id, sortedBlocks, maxWidth)
      await db.update(newsletters).set({ content: newsletter.content }).where(eq(newsletters.id, newsletterId))
    }

    if (!newsletter.content?.trim()) {
      return { success: false, error: 'Newsletter has no content' }
    }

    const config = await getEmailConfig(newsletter.site_id)
    if (!config?.apiKey) return { success: false, error: 'Email provider not configured' }

    const filter = newsletter.audience_filter || {}
    if (!filter.audience && !filter.segment_id && !filter.tags?.length && !filter.sources?.length) {
      return { success: false, error: 'No audience selected. Choose a segment or audience before sending.' }
    }

    const baseMetadata = newsletter.metadata as Record<string, any> | null
    const lock = await acquireDeliveryLock(newsletterId, baseMetadata)
    if (!lock) {
      return { success: false, error: 'Newsletter is already being processed' }
    }

    let lockReleased = false

    try {
      await db.update(newsletters).set({ status: 'sending' }).where(eq(newsletters.id, newsletterId))

      // Resolve contacts based on filter
      let contacts: { id: string; email: string; metadata: any }[]

      if (filter.segment_id) {
        // Get contacts via join table
        contacts = await db
          .select({ id: newsletterContacts.id, email: newsletterContacts.email, metadata: newsletterContacts.metadata })
          .from(newsletterContacts)
          .innerJoin(newsletterSegmentContacts, eq(newsletterSegmentContacts.contactId, newsletterContacts.id))
          .where(and(
            eq(newsletterSegmentContacts.segmentId, filter.segment_id),
            eq(newsletterContacts.siteId, newsletter.site_id),
            eq(newsletterContacts.status, 'active')
          ))
      } else {
        // Build contact query conditions for non-segment filters
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

        contacts = await db
          .select({ id: newsletterContacts.id, email: newsletterContacts.email, metadata: newsletterContacts.metadata })
          .from(newsletterContacts)
          .where(and(...contactConditions))
      }

      if (!contacts.length) {
        await db
          .update(newsletters)
          .set({ status: 'draft', metadata: clearDeliveryLock(baseMetadata) })
          .where(eq(newsletters.id, newsletterId))
        lockReleased = true
        return { success: false, error: 'No matching contacts' }
      }

      const provider = getEmailProvider(config.apiKey, config.providerType)
      const fromEmail = config.fromEmail
      if (!fromEmail) {
        await db
          .update(newsletters)
          .set({ status: 'draft', metadata: clearDeliveryLock(baseMetadata) })
          .where(eq(newsletters.id, newsletterId))
        lockReleased = true
        return { success: false, error: 'From email not configured in Resend settings' }
      }

      const from = config.fromName ? `${config.fromName} <${fromEmail}>` : fromEmail
      const baseUrl = import.meta.env.VITE_APP_DOMAIN || import.meta.env.VITE_DIRECTORY_ORIGIN

      const dripConfig = newsletter.metadata?.drip_config
      const isDrip = dripConfig?.enabled === true

      if (isDrip && !isWithinNewsletterSendWindow(dripConfig)) {
        await db
          .update(newsletters)
          .set({
            metadata: clearDeliveryLock({
              ...newsletter.metadata,
              drip_config: {
                ...dripConfig,
                next_batch_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                batches_sent: dripConfig?.batches_sent || 0,
                total_bounced: dripConfig?.total_bounced || 0,
                paused_reason: null,
              },
            }),
          })
          .where(eq(newsletters.id, newsletterId))
        lockReleased = true
        return { success: true, error: null }
      }

      // For drip mode, only send a random-sized first batch
      const contactsToSend = isDrip
        ? contacts.slice(0, Math.floor(Math.random() * (dripConfig.batch_size_max - dripConfig.batch_size_min + 1)) + dripConfig.batch_size_min)
        : contacts

      let totalSent = 0
      const errors: string[] = []
      let pausedDuringSend = false

      for (const contact of contactsToSend) {
        try {
          if (await isNewsletterPaused(newsletterId)) {
            pausedDuringSend = true
            break
          }

          const unsubToken = generateUnsubscribeToken(newsletter.site_id, contact.email)
          const unsubUrl = `${baseUrl}/unsubscribe?site=${newsletter.site_id}&email=${encodeURIComponent(contact.email)}&token=${unsubToken}&newsletter=${newsletterId}`

          const htmlWithUnsub = newsletter.content + `
            <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;">
              <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
            </div>`

          const result = await provider.send({
            from,
            to: contact.email,
            subject: newsletter.subject,
            html: htmlWithUnsub,
            headers: {
              'List-Unsubscribe': `<${unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          })

          if (result.success && result.messageId) {
            const delivery = await recordNewsletterDeliverySent(db, {
              siteId: newsletter.site_id,
              contactId: contact.id,
              sourceType: 'broadcast',
              sourceId: newsletterId,
              providerMessageId: result.messageId,
            })
            if (delivery.inserted && !delivery.isDuplicateSend) totalSent++
          }
        } catch {
          errors.push(contact.email)
        }
      }
      if (!pausedDuringSend && await isNewsletterPaused(newsletterId)) {
        pausedDuringSend = true
      }

      if (pausedDuringSend) {
        await db
          .update(newsletters)
          .set({
            totalRecipients: contacts.length,
            totalSent,
            metadata: sql`coalesce(${newsletters.metadata}, '{}'::jsonb) - 'delivery_lock_token' - 'delivery_lock_started_at'`,
          })
          .where(eq(newsletters.id, newsletterId))
      } else if (isDrip && contacts.length > contactsToSend.length) {
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
            metadata: clearDeliveryLock({
              ...newsletter.metadata,
              send_errors: errors,
              drip_config: {
                ...dripConfig,
                next_batch_at: nextBatchAt,
                batches_sent: 1,
                total_bounced: 0,
                paused_reason: null,
              },
            }),
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
            metadata: clearDeliveryLock({ ...newsletter.metadata, send_errors: errors }),
          })
          .where(eq(newsletters.id, newsletterId))
      }

      lockReleased = true
      return { success: true, error: null }
    } finally {
      if (!lockReleased) {
        await releaseDeliveryLock(newsletterId, lock.token)
      }
    }
  } catch (err) {
    console.error('sendNewsletter error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function sendTestNewsletterImpl(
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
    const sortedBlocks = sortNewsletterBlocks(newsletter.content_blocks)

    const maxWidth = newsletter.metadata?.maxWidth || DEFAULT_NEWSLETTER_MAX_WIDTH
    const html = sortedBlocks.length > 0
      ? await renderNewsletterEmailHtml(newsletter.site_id, sortedBlocks, maxWidth)
      : newsletter.content
    if (!html?.trim()) {
      return { success: false, error: 'Newsletter has no content. Add some blocks and save first.' }
    }

    const config = await getEmailConfig(newsletter.site_id)
    if (!config?.apiKey || !config?.fromEmail) {
      return { success: false, error: 'Email provider not configured. Add your API key in site integrations.' }
    }

    const provider = getEmailProvider(config.apiKey, config.providerType)
    const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail

    // Build a real unsubscribe URL so link domain matches sending domain (avoids spam filters)
    const baseUrl = import.meta.env.VITE_APP_DOMAIN || import.meta.env.VITE_DIRECTORY_ORIGIN
    const unsubToken = generateUnsubscribeToken(newsletter.site_id, testEmail)
    const unsubUrl = `${baseUrl}/unsubscribe?site=${newsletter.site_id}&email=${encodeURIComponent(testEmail)}&token=${unsubToken}`
    const testHtml = html.replace(/\{\{unsubscribe_url\}\}/g, unsubUrl)

    const result = await provider.send({
      from,
      to: testEmail,
      subject: `[TEST] ${newsletter.subject}`,
      html: testHtml,
    })

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to send test email' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('sendTestNewsletter error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function pauseNewsletterImpl(newsletterId: string): Promise<{ success: boolean; error: string | null }> {
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
    const dripConfig = existingMeta?.drip_config as Record<string, any> | undefined
    const nextBatchAt = typeof dripConfig?.next_batch_at === 'string'
      ? new Date(dripConfig.next_batch_at)
      : null
    const pausedRemainingMs = nextBatchAt
      ? Math.max(nextBatchAt.getTime() - Date.now(), 0)
      : null

    await db
      .update(newsletters)
      .set({
        status: 'paused',
        metadata: {
          ...existingMeta,
          drip_config: {
            ...dripConfig,
            paused_reason: 'manual',
            paused_at: new Date().toISOString(),
            paused_remaining_ms: pausedRemainingMs,
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

export async function resumeNewsletterImpl(newsletterId: string): Promise<{ success: boolean; error: string | null }> {
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
    const dripConfig = existingMeta?.drip_config as Record<string, any> | undefined
    const pausedRemainingMs = typeof dripConfig?.paused_remaining_ms === 'number'
      ? dripConfig.paused_remaining_ms
      : null
    const nextBatchAt = pausedRemainingMs !== null
      ? new Date(Date.now() + pausedRemainingMs).toISOString()
      : (typeof dripConfig?.next_batch_at === 'string' ? dripConfig.next_batch_at : new Date().toISOString())

    await db
      .update(newsletters)
      .set({
        status: 'sending',
        metadata: {
          ...existingMeta,
          drip_config: {
            ...dripConfig,
            next_batch_at: nextBatchAt,
            paused_reason: null,
            paused_at: null,
            paused_remaining_ms: null,
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

export type { NewsletterStatusEventFilter }
