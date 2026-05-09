import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { NEWSLETTER_DELIVERY_RETENTION_DAYS } from '@/lib/actions/newsletters/event-stats'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - NEWSLETTER_DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const deleted = await db.execute<{ count: number }>(sql`
    with deleted as (
      delete from newsletter_deliveries d
      where d.sent_at < ${cutoff}
        and (
          d.source_type <> 'broadcast'
          or not exists (
            select 1
            from newsletters n
            where n.id = d.source_id
              and n.status in ('sending', 'paused')
          )
        )
      returning 1
    )
    select count(*)::int as count from deleted
  `)

  return NextResponse.json({ deleted: Number(deleted.rows[0]?.count ?? 0), retentionDays: NEWSLETTER_DELIVERY_RETENTION_DAYS })
}
