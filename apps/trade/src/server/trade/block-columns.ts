import { eq } from "drizzle-orm"

import {
  readHiddenBlockColumns,
  type HiddenBlockColumns,
} from "@/lib/trade/block-columns"
import { db } from "@/server/trade/db"
import { tradePrefs } from "@/server/trade/schema"

/** The columns each trade block hides for this account; none until one is hidden. */
export async function loadHiddenBlockColumns(
  userId: string
): Promise<HiddenBlockColumns> {
  const [row] = await db
    .select({ hidden: tradePrefs.hiddenBlockColumns })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readHiddenBlockColumns(row?.hidden)
}

/** Every block's hidden columns, cleaned, answered as stored. */
export async function saveHiddenBlockColumns(
  userId: string,
  value: unknown
): Promise<HiddenBlockColumns> {
  const hiddenBlockColumns = readHiddenBlockColumns(value)
  await db
    .insert(tradePrefs)
    .values({ userId, hiddenBlockColumns, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { hiddenBlockColumns, updatedAt: new Date() },
    })
  return hiddenBlockColumns
}
