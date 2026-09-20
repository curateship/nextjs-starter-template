import { and, asc, desc, eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { customShellDeliveries } from "@/server/schema"

/**
 * Who a newsletter actually reached, newest first.
 *
 * One row over the asked-for page is fetched and then dropped, which is how
 * "there is more below" is answered without a second counting query.
 */
export async function listBroadcastDeliveries(
  workspaceId: string,
  broadcastId: string,
  options: { limit?: number; offset?: number } = {},
  database: CustomShellDb = db
) {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const rows = await database
    .select()
    .from(customShellDeliveries)
    .where(
      and(
        eq(customShellDeliveries.workspaceId, workspaceId),
        eq(customShellDeliveries.broadcastId, broadcastId)
      )
    )
    .orderBy(desc(customShellDeliveries.createdAt))
    .limit(limit + 1)
    .offset(offset)

  return { deliveries: rows.slice(0, limit), hasMore: rows.length > limit }
}

/**
 * Everything one person has been sent, newest first.
 *
 * The answer to "did you email me?", which the app has been recording all along
 * and never showed anybody. Same one-row-over trick as above for "there is more
 * below", and the same `set null` on `broadcast_id` means a send whose
 * newsletter was later deleted is still here — it happened, so it is reported,
 * just without anywhere to link to.
 *
 * The id breaks ties on the timestamp. Two automations can post to the same
 * person in the same instant, and without a tiebreak a page boundary landing
 * mid-tie shows one of them twice and hides the other.
 */
export async function listContactDeliveries(
  workspaceId: string,
  contactId: string,
  options: { limit?: number; offset?: number } = {},
  database: CustomShellDb = db
) {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const rows = await database
    .select({
      id: customShellDeliveries.id,
      broadcastId: customShellDeliveries.broadcastId,
      subject: customShellDeliveries.subject,
      status: customShellDeliveries.status,
      bouncedAt: customShellDeliveries.bouncedAt,
      error: customShellDeliveries.error,
      createdAt: customShellDeliveries.createdAt,
    })
    .from(customShellDeliveries)
    .where(
      and(
        eq(customShellDeliveries.workspaceId, workspaceId),
        eq(customShellDeliveries.contactId, contactId)
      )
    )
    .orderBy(desc(customShellDeliveries.createdAt), asc(customShellDeliveries.id))
    .limit(limit + 1)
    .offset(offset)

  return { deliveries: rows.slice(0, limit), hasMore: rows.length > limit }
}
