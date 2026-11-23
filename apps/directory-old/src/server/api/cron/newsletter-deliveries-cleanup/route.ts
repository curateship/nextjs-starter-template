import { NextRequest, NextResponse } from '@/lib/web-response'
import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { NEWSLETTER_DELIVERY_WEBHOOK_WINDOW_DAYS } from '@/lib/actions/newsletters/event-stats'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - NEWSLETTER_DELIVERY_WEBHOOK_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const deleted = await db.execute<{ source_type: string; count: number }>(sql`
    with broadcast_candidates as (
      select d.id, d.source_type
      from newsletters n
      join newsletter_deliveries d
        on d.source_type = 'broadcast'
        and d.source_id = n.id
      where n.status not in ('sending', 'paused')
        and n.sent_at is not null
        and n.sent_at < ${cutoff}
    ),
    orphan_broadcast_candidates as (
      select d.id, d.source_type
      from newsletter_deliveries d
      where d.source_type = 'broadcast'
        and d.sent_at < ${cutoff}
        and not exists (
          select 1
          from newsletters n
          where n.id = d.source_id
        )
    ),
    automation_candidates as (
      select d.id, d.source_type
      from email_automation_enrollments e
      join newsletter_deliveries d
        on d.source_type = 'automation'
        and d.source_id = e.automation_id
        and d.contact_id = e.contact_id
      where e.status <> 'active'
        and e.ended_at is not null
        and e.ended_at < ${cutoff}
    ),
    orphan_automation_candidates as (
      select d.id, d.source_type
      from newsletter_deliveries d
      where d.source_type = 'automation'
        and d.sent_at < ${cutoff}
        and not exists (
          select 1
          from email_automation_enrollments e
          where e.automation_id = d.source_id
            and e.contact_id = d.contact_id
        )
    ),
    candidates as (
      select * from broadcast_candidates
      union all
      select * from orphan_broadcast_candidates
      union all
      select * from automation_candidates
      union all
      select * from orphan_automation_candidates
    ),
    deleted as (
      delete from newsletter_deliveries d
      using candidates c
      where d.id = c.id
      returning d.source_type
    )
    select source_type, count(*)::int as count
    from deleted
    group by source_type
  `)

  const deletedBySourceType = Object.fromEntries(
    deleted.rows.map((row) => [row.source_type, Number(row.count ?? 0)]),
  )

  return NextResponse.json({
    deleted: Object.values(deletedBySourceType).reduce((total, count) => total + count, 0),
    deletedBySourceType,
    webhookWindowDays: NEWSLETTER_DELIVERY_WEBHOOK_WINDOW_DAYS,
  })
}
