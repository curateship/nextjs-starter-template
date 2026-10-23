import { eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { productOrders } from '@/lib/db/schema'

const MAX_TOKEN_LENGTH = 256

export async function recordOrderLinkClick(token: string) {
  const normalizedToken = typeof token === 'string' ? token.trim() : ''
  if (!normalizedToken || normalizedToken.length > MAX_TOKEN_LENGTH) return false

  const now = new Date()

  try {
    const result = await db.execute(
      sql`SELECT * FROM increment_click_count(${normalizedToken}, ${now.toISOString()}::timestamptz)`
    )
    if (result.rows?.length) return true
  } catch {
    // Older databases may not have the helper function; use an atomic update.
  }

  const [updated] = await db
    .update(productOrders)
    .set({
      clickCount: sql`${productOrders.clickCount} + 1`,
      clickedAt: sql`coalesce(${productOrders.clickedAt}, ${now})`,
      updatedAt: now,
    })
    .where(eq(productOrders.accessToken, normalizedToken))
    .returning({ id: productOrders.id })

  return Boolean(updated)
}
