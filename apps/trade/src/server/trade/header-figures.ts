import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/trade/db"
import { tradeHeaderFigures } from "@/server/trade/schema"
import type { ActiveTradesFigures } from "@/lib/trade/dashboard/active-trades"

/**
 * The last two figures the header button was able to say.
 *
 * **It is remembered so a reload does not start on two dashes.** The button
 * reads several exchanges, and a read where one of them stays quiet has no
 * total in it — which is the honest answer for that read, but it left the
 * button blank for 26 seconds after every reload while two reads merged into
 * one complete picture. Tyler, 4 October 2026: "Just show the old numbers
 * until theres a new one."
 *
 * Only a real total is ever written here, so what comes back was true at the
 * moment it was measured. It is never a partial sum, and the moment a fresh
 * total lands the button draws that instead.
 */
export async function readHeaderFigures(
  userId: string,
  database: CustomShellDb = db
): Promise<ActiveTradesFigures | null> {
  const [row] = await database
    .select()
    .from(tradeHeaderFigures)
    .where(eq(tradeHeaderFigures.userId, userId))
    .limit(1)
  if (!row) return null
  return { value: row.value, profit: row.profit, profitValue: row.profitValue }
}

/** Remember a total that came out whole. A read with a gap in it writes nothing. */
export async function saveHeaderFigures(
  userId: string,
  figures: ActiveTradesFigures,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .insert(tradeHeaderFigures)
    .values({
      userId,
      value: figures.value,
      profit: figures.profit,
      profitValue: figures.profitValue,
      measuredAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tradeHeaderFigures.userId,
      set: {
        value: figures.value,
        profit: figures.profit,
        profitValue: figures.profitValue,
        measuredAt: new Date(),
      },
    })
}
