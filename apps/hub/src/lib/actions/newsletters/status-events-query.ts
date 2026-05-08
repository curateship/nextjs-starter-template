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
  const allowedFilters = new Set<NewsletterStatusEventFilter>(['all', 'bounced', 'unsubscribed', 'opened', 'clicked', 'duplicates'])
  const eventFilter = allowedFilters.has(rawEventFilter ?? 'all') ? rawEventFilter ?? 'all' : 'all'
  const filterCondition =
    eventFilter === 'all'
      ? sql``
      : eventFilter === 'duplicates'
        ? sql`and e.is_duplicate_send = true`
        : sql`and e.event_type = ${eventFilter}`
  const stepCondition = typeof stepOrder === 'number'
    ? sql`and e.event_step_order = ${stepOrder}`
    : sql``

  const eventRowsCte = sql`
    with scoped_events as (
      select *
      from newsletter_events
      where site_id = ${siteId}
        and source_type = ${sourceType}
        and source_id = ${sourceId}
    ),
    sent_with_step as (
      select
        *,
        case
          when metadata->>'step_order' ~ '^[0-9]+$' then (metadata->>'step_order')::int
          else null
        end as sent_step_order
      from scoped_events
      where event_type = 'sent'
    ),
    sent_ranked as (
      select
        id,
        contact_id,
        provider_message_id,
        sent_step_order,
        created_at,
        row_number() over (
          partition by contact_id, provider_message_id
          order by created_at asc, id asc
        ) as message_row_number
      from sent_with_step
      where contact_id is not null
        and provider_message_id is not null
    ),
    canonical_sent_messages as (
      select
        id,
        contact_id,
        provider_message_id,
        sent_step_order,
        row_number() over (
          partition by contact_id, coalesce(sent_step_order, 0)
          order by created_at asc, id asc
        ) as contact_message_number
      from sent_ranked
      where message_row_number = 1
    ),
    event_rows as (
      select
        e.*,
        coalesce(
          case
            when e.metadata->>'step_order' ~ '^[0-9]+$' then (e.metadata->>'step_order')::int
            else null
          end,
          csm.sent_step_order
        ) as event_step_order,
        (
          e.event_type = 'sent'
          and (
            coalesce(sr.message_row_number, 1) > 1
            or coalesce(csm.contact_message_number, 1) > 1
          )
        ) as is_duplicate_send
      from scoped_events e
      left join sent_ranked sr on sr.id = e.id
      left join canonical_sent_messages csm on (
        csm.id = e.id
        or (
          e.event_type <> 'sent'
          and csm.provider_message_id = e.provider_message_id
          and csm.contact_id is not distinct from e.contact_id
        )
      )
    )
  `

  const baseEvents = sql`
    from event_rows e
    left join newsletter_contacts c on c.id = e.contact_id
    where true
      ${stepCondition}
      ${filterCondition}
  `

  const [rows, countResult, statsResult] = await Promise.all([
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
    db.execute<{ sent: number; opened: number; clicked: number; unsubscribed: number }>(sql`
      ${eventRowsCte}
      select
        count(*) filter (where e.event_type = 'sent' and e.is_duplicate_send = false)::int as sent,
        count(*) filter (where e.event_type = 'opened')::int as opened,
        count(*) filter (where e.event_type = 'clicked')::int as clicked,
        count(*) filter (where e.event_type = 'unsubscribed')::int as unsubscribed
      from event_rows e
      where true
        ${stepCondition}
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
