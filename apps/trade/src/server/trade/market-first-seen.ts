import { inArray } from "drizzle-orm"
import { db } from "@/server/db"
import { tradeMarketFirstSeen } from "./schema"

/** Conflict handling preserves the first timestamp across processes and retries. */
export async function recordMarketFirstSeen(
  keys: readonly string[],
  at = new Date()
) {
  const unique = [...new Set(keys)]
  if (!unique.length) return {}
  await db
    .insert(tradeMarketFirstSeen)
    .values(unique.map((marketKey) => ({ marketKey, firstSeenAt: at })))
    .onConflictDoNothing()
  const rows = await db
    .select()
    .from(tradeMarketFirstSeen)
    .where(inArray(tradeMarketFirstSeen.marketKey, unique))
  return Object.fromEntries(
    rows.map((row) => [row.marketKey, row.firstSeenAt.getTime()])
  )
}
