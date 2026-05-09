import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'

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

export interface NewsletterStatusEventStats {
  sent: number
  opened: number
  clicked: number
  unsubscribed: number
  openRate: number
  clickRate: number
  unsubscribeRate: number
}

export const emptyNewsletterStatusEventStats: NewsletterStatusEventStats = {
  sent: 0,
  opened: 0,
  clicked: 0,
  unsubscribed: 0,
  openRate: 0,
  clickRate: 0,
  unsubscribeRate: 0,
}

export async function queryNewsletterStatusEvents({
  eventFilter: rawEventFilter,
  page: rawPage,
  pageSize: rawPageSize,
  siteId,
  sourceId,
  sourceType,
  stepOrder,
}: {
  eventFilter?: NewsletterStatusEventFilter
  page?: number
  pageSize?: number
  siteId: string
  sourceId: string
  sourceType: 'broadcast' | 'automation'
  stepOrder?: number | null
}): Promise<{ data: NewsletterStatusEvent[]; total: number; stats: NewsletterStatusEventStats }> {
  const page = Math.max(1, Math.floor(rawPage ?? 1))
  const pageSize = Math.min(50, Math.max(1, Math.floor(rawPageSize ?? 50)))
  const offset = (page - 1) * pageSize
  const normalizedStepOrder = typeof stepOrder === 'number' ? stepOrder : 0
  const allowedFilters = new Set<NewsletterStatusEventFilter>(['all', 'bounced', 'unsubscribed', 'opened', 'clicked', 'duplicates'])
  const eventFilter = allowedFilters.has(rawEventFilter ?? 'all') ? rawEventFilter ?? 'all' : 'all'
  const latestEvent = sql<string>`case
    when d.complained_at is not null then 'complained'
    when d.bounced_at is not null then 'bounced'
    when d.unsubscribed_at is not null then 'unsubscribed'
    when d.first_clicked_at is not null then 'clicked'
    when d.first_opened_at is not null then 'opened'
    when d.delivered_at is not null then 'delivered'
    when d.is_duplicate_send = true then 'duplicate'
    else 'sent'
  end`
  const latestEventAt = sql<Date>`coalesce(
    d.complained_at,
    d.bounced_at,
    d.unsubscribed_at,
    d.first_clicked_at,
    d.first_opened_at,
    d.delivered_at,
    d.sent_at
  )`
  const eventLookup = {
    all: { condition: sql``, event: latestEvent, date: latestEventAt },
    bounced: { condition: sql`and d.bounced_at is not null`, event: sql`'bounced'`, date: sql`d.bounced_at` },
    unsubscribed: { condition: sql`and d.unsubscribed_at is not null`, event: sql`'unsubscribed'`, date: sql`d.unsubscribed_at` },
    opened: { condition: sql`and d.first_opened_at is not null`, event: sql`'opened'`, date: sql`d.first_opened_at` },
    clicked: { condition: sql`and d.first_clicked_at is not null`, event: sql`'clicked'`, date: sql`d.first_clicked_at` },
    duplicates: { condition: sql`and d.is_duplicate_send = true`, event: sql`'duplicate'`, date: sql`d.sent_at` },
  }
  const selectedEvent = eventLookup[eventFilter]

  const baseDeliveries = sql`
    from newsletter_deliveries d
    left join newsletter_contacts c on c.id = d.contact_id
    where d.site_id = ${siteId}
      and d.source_type = ${sourceType}
      and d.source_id = ${sourceId}
      and d.step_order = ${normalizedStepOrder}
      ${selectedEvent.condition}
  `

  const [rows, countResult, statsResult] = await Promise.all([
    db.execute<{
      id: string
      email: string | null
      event: string
      created_at: Date
    }>(sql`
      select
        d.id::text,
        c.email,
        ${selectedEvent.event} as event,
        ${selectedEvent.date} as created_at
      ${baseDeliveries}
      order by ${selectedEvent.date} desc
      limit ${pageSize}
      offset ${offset}
    `),
    db.execute<{ count: number }>(sql`
      select count(*)::int as count
      ${baseDeliveries}
    `),
    db.execute<{ sent: number; opened: number; clicked: number; unsubscribed: number }>(sql`
      select
        coalesce(sent, 0)::int as sent,
        coalesce(opened, 0)::int as opened,
        coalesce(clicked, 0)::int as clicked,
        coalesce(unsubscribed, 0)::int as unsubscribed
      from newsletter_source_stats
      where site_id = ${siteId}
        and source_type = ${sourceType}
        and source_id = ${sourceId}
        and step_order = ${normalizedStepOrder}
      limit 1
    `),
  ])

  const statsRow = statsResult.rows[0] ?? emptyNewsletterStatusEventStats
  const sent = Number(statsRow.sent ?? 0)
  const opened = Number(statsRow.opened ?? 0)
  const clicked = Number(statsRow.clicked ?? 0)
  const unsubscribed = Number(statsRow.unsubscribed ?? 0)

  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      email: row.email || 'Unknown contact',
      event: row.event,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    })),
    total: countResult.rows[0]?.count ?? 0,
    stats: {
      sent,
      opened,
      clicked,
      unsubscribed,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
      unsubscribeRate: sent > 0 ? Math.round((unsubscribed / sent) * 100) : 0,
    },
  }
}
