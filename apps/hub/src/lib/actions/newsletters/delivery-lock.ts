import { randomUUID } from 'crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletters } from '@/lib/db/schema'

const DELIVERY_LOCK_TIMEOUT_MS = 10 * 60 * 1000

export function clearDeliveryLock(metadata: Record<string, any> | null | undefined) {
  const next = { ...(metadata || {}) }
  delete next.delivery_lock_token
  delete next.delivery_lock_started_at
  return next
}

export async function acquireDeliveryLock(newsletterId: string, metadata: Record<string, any> | null | undefined) {
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

export async function releaseDeliveryLock(
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

export async function isNewsletterPaused(newsletterId: string) {
  const [row] = await db
    .select({ status: newsletters.status })
    .from(newsletters)
    .where(eq(newsletters.id, newsletterId))
    .limit(1)

  return row?.status === 'paused'
}
