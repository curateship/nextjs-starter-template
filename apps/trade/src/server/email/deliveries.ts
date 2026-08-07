import { and, desc, eq } from "drizzle-orm"

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
