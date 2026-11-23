import { and, eq, inArray, ne } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { tradeBacktestGroups } from "@/server/trade/schema"

/** One database update for every selected owned row. */
export async function setBacktestFlag(
  userId: string,
  groupIds: readonly string[],
  flag: "pinned" | "archived",
  on: boolean,
  database: CustomShellDb = db
): Promise<{ changed: string[] }> {
  const ids = [...new Set(groupIds)]
  const column = tradeBacktestGroups[flag]
  const rows = await database
    .update(tradeBacktestGroups)
    .set({ [flag]: on })
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        inArray(tradeBacktestGroups.id, ids),
        ne(column, on)
      )
    )
    .returning({ id: tradeBacktestGroups.id })

  const changed = new Set(rows.map((row) => row.id))
  return { changed: ids.filter((id) => changed.has(id)) }
}

/** One ownership-scoped delete; the database cascades its per-coin rows. */
export async function deleteBacktestGroups(
  userId: string,
  groupIds: readonly string[],
  database: CustomShellDb = db
): Promise<{ deleted: string[] }> {
  const ids = [...new Set(groupIds)]
  const rows = await database
    .delete(tradeBacktestGroups)
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        inArray(tradeBacktestGroups.id, ids)
      )
    )
    .returning({ id: tradeBacktestGroups.id })

  const deleted = new Set(rows.map((row) => row.id))
  return { deleted: ids.filter((id) => deleted.has(id)) }
}
