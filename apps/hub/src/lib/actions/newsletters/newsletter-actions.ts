'use server'

import { eq, and, sql, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletters, newsletterContacts, newsletterSegmentContacts, newsletterEvents, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { getEmailProvider } from '@/lib/actions/email/provider'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { extractNewsletterSponsorIds, generateEmailHtml } from '@/lib/actions/newsletters/render'
import { getActiveSponsorsByIdsAction } from '@/lib/actions/sponsors/sponsor-actions'
import { isWithinNewsletterSendWindow } from '@/lib/actions/newsletters/send-windows'
import { randomUUID } from 'crypto'

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

export interface NewsletterStatusEvent {
  id: string
  email: string
  event: string
  created_at: string
}

export type NewsletterStatusEventFilter =
  | 'all'
  | 'bounced'
  | 'unsubscribed'
  | 'opened'
  | 'clicked'
  | 'duplicates'

interface NewsletterBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
  display_order?: number
}


const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DELIVERY_LOCK_TIMEOUT_MS = 10 * 60 * 1000

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
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

function getSortedNewsletterBlocks(contentBlocks: Record<string, any> | null | undefined): NewsletterBlock[] {
  return Object.values(contentBlocks || {})
    .filter((block: any) => block?.id && block?.type)
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)) as NewsletterBlock[]
}

async function generateNewsletterEmailHtml(siteId: string, blocks: NewsletterBlock[], maxWidth = 600) {
  const sponsorIds = extractNewsletterSponsorIds(blocks)
  const sponsorsById = sponsorIds.length > 0
    ? await getActiveSponsorsByIdsAction(siteId, sponsorIds)
    : {}

  return generateEmailHtml(blocks, maxWidth, { sponsorsById })
}

function clearDeliveryLock(metadata: Record<string, any> | null | undefined) {
  const next = { ...(metadata || {}) }
  delete next.delivery_lock_token
  delete next.delivery_lock_started_at
  return next
}

async function acquireDeliveryLock(newsletterId: string, metadata: Record<string, any> | null | undefined) {
  const token = randomUUID()
  const startedAt = new Date().toISOString()
  const staleBefore = new Date(Date.now() - DELIVERY_LOCK_TIMEOUT_MS).toISOString()
  const [row] = await db
    .update(newsletters)
    .set({
      metadata: {
        ...(metadata || {}),
        delivery_lock_token: token,
        delivery_lock_started_at: startedAt,
      },
    })
    .where(and(
      eq(newsletters.id, newsletterId),
      sql`(
        ${newsletters.metadata}->>'delivery_lock_token' is null
        or ${newsletters.metadata}->>'delivery_lock_started_at' is null
        or (${newsletters.metadata}->>'delivery_lock_started_at')::timestamptz < ${staleBefore}::timestamptz
      )`,
    ))
    .returning({ id: newsletters.id })

  return row ? { token } : null
}

async function releaseDeliveryLock(
  newsletterId: string,
  token: string,
) {
  await db
    .update(newsletters)
    .set({ metadata: sql`coalesce(${newsletters.metadata}, '{}'::jsonb) - 'delivery_lock_token' - 'delivery_lock_started_at'` })
    .where(and(
      eq(newsletters.id, newsletterId),
      sql`${newsletters.metadata}->>'delivery_lock_token' = ${token}`,
    ))
}

async function isNewsletterPaused(newsletterId: string) {
  const [row] = await db
    .select({ status: newsletters.status })
    .from(newsletters)
    .where(eq(newsletters.id, newsletterId))
    .limit(1)

  return row?.status === 'paused'
}

async function getConfirmedDuplicateSendCounts(siteId: string, newsletterIds: string[]) {
  if (!newsletterIds.length) return new Map<string, number>()

  const rows = await db.execute<{ source_id: string; duplicate_count: number }>(sql`
    with sent_events as (
      select source_id, contact_id, provider_message_id
      from newsletter_events
      where site_id = ${siteId}
        and source_type = 'broadcast'
        and event_type = 'sent'
        and source_id in (${sql.join(newsletterIds.map((id) => sql`${id}`), sql`, `)})
    ),
    local_duplicate_rows as (
      select source_id, sum(event_count - 1)::int as duplicate_count
      from (
        select source_id, contact_id, provider_message_id, count(*)::int as event_count
        from sent_events
        where contact_id is not null
          and provider_message_id is not null
        group by source_id, contact_id, provider_message_id
        having count(*) > 1
      ) grouped
      group by source_id
    ),
    actual_duplicate_sends as (
      select source_id, sum(provider_count - 1)::int as duplicate_count
      from (
        select source_id, contact_id, count(distinct provider_message_id)::int as provider_count
        from sent_events
        where contact_id is not null
          and provider_message_id is not null
        group by source_id, contact_id
        having count(distinct provider_message_id) > 1
      ) grouped
      group by source_id
    )
    select
      ids.source_id::text,
      (
        coalesce(local_duplicate_rows.duplicate_count, 0)
        + coalesce(actual_duplicate_sends.duplicate_count, 0)
      )::int as duplicate_count
    from (select unnest(array[${sql.join(newsletterIds.map((id) => sql`${id}`), sql`, `)}]::uuid[]) as source_id) ids
    left join local_duplicate_rows on local_duplicate_rows.source_id = ids.source_id
    left join actual_duplicate_sends on actual_duplicate_sends.source_id = ids.source_id
  `)

  return new Map(rows.rows.map((row) => [row.source_id, Number(row.duplicate_count ?? 0)]))
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

    const newsletterIds = rows.map((row) => row.id)
    const [unsubscribeRows, bouncedRows, sendEventRows, duplicateSendCounts] = newsletterIds.length === 0
      ? [[], [], [], new Map<string, number>()]
      : await Promise.all([
        db
          .select({
            sourceId: newsletterEvents.sourceId,
            count: sql<number>`count(*)::int`,
          })
          .from(newsletterEvents)
          .where(and(
            eq(newsletterEvents.siteId, siteId),
            eq(newsletterEvents.sourceType, 'broadcast'),
            eq(newsletterEvents.eventType, 'unsubscribed'),
            inArray(newsletterEvents.sourceId, newsletterIds),
          ))
          .groupBy(newsletterEvents.sourceId),
        db
          .select({
            sourceId: newsletterEvents.sourceId,
            count: sql<number>`count(*)::int`,
          })
          .from(newsletterEvents)
          .where(and(
            eq(newsletterEvents.siteId, siteId),
            eq(newsletterEvents.sourceType, 'broadcast'),
            eq(newsletterEvents.eventType, 'bounced'),
            inArray(newsletterEvents.sourceId, newsletterIds),
          ))
          .groupBy(newsletterEvents.sourceId),
        db
          .select({
            sourceId: newsletterEvents.sourceId,
            count: sql<number>`count(*)::int`,
          })
          .from(newsletterEvents)
          .where(and(
            eq(newsletterEvents.siteId, siteId),
            eq(newsletterEvents.sourceType, 'broadcast'),
            eq(newsletterEvents.eventType, 'sent'),
            inArray(newsletterEvents.sourceId, newsletterIds),
          ))
          .groupBy(newsletterEvents.sourceId),
        getConfirmedDuplicateSendCounts(siteId, newsletterIds),
      ])

    const unsubscribeCounts = new Map(
      unsubscribeRows
        .filter((row) => row.sourceId)
        .map((row) => [row.sourceId as string, row.count]),
    )
    const bouncedCounts = new Map(
      bouncedRows
        .filter((row) => row.sourceId)
        .map((row) => [row.sourceId as string, row.count]),
    )
    const sendEventCounts = new Map(
      sendEventRows
        .filter((row) => row.sourceId)
        .map((row) => [row.sourceId as string, row.count]),
    )
    return {
      data: rows.map((row) => rowToNewsletter(
        row,
        unsubscribeCounts.get(row.id) ?? 0,
        sendEventCounts.get(row.id) ?? (row.totalSent ?? 0),
        duplicateSendCounts.get(row.id) ?? 0,
        bouncedCounts.get(row.id) ?? 0,
      )),
      total: countResult[0]?.count ?? 0,
      error: null,
    }
  } catch (err) {
    console.error('getNewslettersBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

/** Returns only newsletter IDs for bulk selection — lightweight alternative to full record fetch */
export async function getNewsletterIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { ids: [], error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { ids: [], error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { ids: [], error: 'Access denied' }
    }

    const rows = await db
      .select({ id: newsletters.id })
      .from(newsletters)
      .where(eq(newsletters.siteId, siteId))

    return { ids: rows.map(r => r.id), error: null }
  } catch (err) {
    return { ids: [], error: 'Server error' }
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

    const [sendEventRow, unsubscribeRow, bouncedRow, duplicateSendCounts] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterEvents)
        .where(and(
          eq(newsletterEvents.siteId, row.siteId),
          eq(newsletterEvents.sourceType, 'broadcast'),
          eq(newsletterEvents.eventType, 'sent'),
          eq(newsletterEvents.sourceId, row.id),
        ))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterEvents)
        .where(and(
          eq(newsletterEvents.siteId, row.siteId),
          eq(newsletterEvents.sourceType, 'broadcast'),
          eq(newsletterEvents.eventType, 'unsubscribed'),
          eq(newsletterEvents.sourceId, row.id),
        ))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterEvents)
        .where(and(
          eq(newsletterEvents.siteId, row.siteId),
          eq(newsletterEvents.sourceType, 'broadcast'),
          eq(newsletterEvents.eventType, 'bounced'),
          eq(newsletterEvents.sourceId, row.id),
        ))
        .limit(1),
      getConfirmedDuplicateSendCounts(row.siteId, [row.id]),
    ])

    return {
      data: rowToNewsletter(
        row,
        unsubscribeRow[0]?.count ?? 0,
        sendEventRow[0]?.count ?? (row.totalSent ?? 0),
        duplicateSendCounts.get(row.id) ?? 0,
        bouncedRow[0]?.count ?? 0,
      ),
      error: null,
    }
  } catch (err) {
    console.error('getNewsletterById error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function getNewsletterStatusEvents(
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

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(50, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize
    const allowedFilters = new Set<NewsletterStatusEventFilter>(['all', 'bounced', 'unsubscribed', 'opened', 'clicked', 'duplicates'])
    const eventFilter = allowedFilters.has(options?.eventFilter ?? 'all') ? options?.eventFilter ?? 'all' : 'all'
    const filterCondition =
      eventFilter === 'all'
        ? sql``
        : eventFilter === 'duplicates'
          ? sql`and e.is_duplicate_send = true`
          : sql`and e.event_type = ${eventFilter}`

    const eventRowsCte = sql`
      with scoped_events as (
        select *
        from newsletter_events
        where site_id = ${newsletter.siteId}
          and source_type = 'broadcast'
          and source_id = ${newsletterId}
      ),
      sent_ranked as (
        select
          id,
          contact_id,
          provider_message_id,
          created_at,
          row_number() over (
            partition by contact_id, provider_message_id
            order by created_at asc, id asc
          ) as message_row_number
        from scoped_events
        where event_type = 'sent'
          and contact_id is not null
          and provider_message_id is not null
      ),
      canonical_sent_messages as (
        select
          id,
          contact_id,
          row_number() over (
            partition by contact_id
            order by created_at asc, id asc
          ) as contact_message_number
        from sent_ranked
        where message_row_number = 1
      ),
      event_rows as (
        select
          e.*,
          (
            e.event_type = 'sent'
            and (
              coalesce(sr.message_row_number, 1) > 1
              or coalesce(csm.contact_message_number, 1) > 1
            )
          ) as is_duplicate_send
        from scoped_events e
        left join sent_ranked sr on sr.id = e.id
        left join canonical_sent_messages csm on csm.id = e.id
      )
    `

    const baseEvents = sql`
      from event_rows e
      left join newsletter_contacts c on c.id = e.contact_id
      where true
        ${filterCondition}
    `

    const [rows, countResult] = await Promise.all([
      db.execute<{
        id: string
        email: string | null
        event: string
        created_at: Date
      }>(sql`
        ${eventRowsCte}
        select
          e.id::text,
          c.email,
          case when e.is_duplicate_send then 'duplicate' else e.event_type end as event,
          e.created_at
        ${baseEvents}
        order by e.created_at desc
        limit ${pageSize}
        offset ${offset}
      `),
      db.execute<{ count: number }>(sql`
        ${eventRowsCte}
        select count(*)::int as count
        ${baseEvents}
      `),
    ])

    return {
      data: rows.rows.map((row) => ({
        id: row.id,
        email: row.email || 'Unknown contact',
        event: row.event,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
      total: countResult.rows[0]?.count ?? 0,
      error: null,
    }
  } catch (err) {
    console.error('getNewsletterStatusEvents error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function createNewsletter(input: {
  siteId: string
  subject: string
  audience_filter?: Record<string, any>
  content_blocks?: Record<string, any>
  content?: string
  metadata?: Record<string, any>
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
    const contentBlocks = input.content_blocks || {}
    const sortedBlocks = getSortedNewsletterBlocks(contentBlocks)
    const maxWidth = input.metadata?.maxWidth || 600
    const generatedContent = sortedBlocks.length > 0
      ? await generateNewsletterEmailHtml(input.siteId, sortedBlocks, maxWidth)
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
        allowedFields.content = await generateNewsletterEmailHtml(newsletter.siteId, sortedBlocks, maxWidth)
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
    const sortedBlocks = getSortedNewsletterBlocks(newsletter.content_blocks)
    if (sortedBlocks.length > 0) {
      const maxWidth = newsletter.metadata?.maxWidth || 600
      newsletter.content = await generateNewsletterEmailHtml(newsletter.site_id, sortedBlocks, maxWidth)
      await db.update(newsletters).set({ content: newsletter.content }).where(eq(newsletters.id, newsletterId))
    }

    if (!newsletter.content?.trim()) {
      return { success: false, error: 'Newsletter has no content' }
    }

    const config = await getEmailConfig(newsletter.site_id)
    if (!config?.apiKey) return { success: false, error: 'Email provider not configured' }

    let filter = newsletter.audience_filter || {}
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
      const baseUrl = process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'

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
            totalSent++
            await db.insert(newsletterEvents).values({
              siteId: newsletter.site_id,
              contactId: contact.id,
              eventType: 'sent',
              sourceType: 'broadcast',
              sourceId: newsletterId,
              providerMessageId: result.messageId,
            })
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
    const sortedBlocks = getSortedNewsletterBlocks(newsletter.content_blocks)

    const maxWidth = newsletter.metadata?.maxWidth || 600
    const html = sortedBlocks.length > 0
      ? await generateNewsletterEmailHtml(newsletter.site_id, sortedBlocks, maxWidth)
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'
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
