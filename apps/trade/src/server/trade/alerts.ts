import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { tradeChartDrawings, tradePriceAlerts } from "@/server/trade/schema"

export type AlertListKind = "active" | "fired"

/** Clear one account's active alerts or fired history in one transaction. */
export async function clearAlerts(
  userId: string,
  kind: AlertListKind,
  database: CustomShellDb = db
): Promise<number> {
  return database.transaction(async (tx) => {
    const prices = await tx
      .delete(tradePriceAlerts)
      .where(
        and(
          eq(tradePriceAlerts.userId, userId),
          kind === "active"
            ? isNull(tradePriceAlerts.firedAt)
            : isNotNull(tradePriceAlerts.firedAt)
        )
      )
      .returning({ id: tradePriceAlerts.id })

    const lines = await tx
      .update(tradeChartDrawings)
      .set({ alert: null })
      .where(
        and(
          eq(tradeChartDrawings.userId, userId),
          isNotNull(tradeChartDrawings.alert),
          kind === "active"
            ? sql`${tradeChartDrawings.alert}->>'firedAt' IS NULL`
            : sql`${tradeChartDrawings.alert}->>'firedAt' IS NOT NULL`
        )
      )
      .returning({ id: tradeChartDrawings.id })

    return prices.length + lines.length
  })
}
