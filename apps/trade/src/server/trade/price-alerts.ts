import { and, asc, count, desc, eq, isNotNull, isNull } from "drizzle-orm"

import { marketChartHref, parseMarketKey } from "@/lib/protocols/contracts"
import {
  MAX_ARMED_PRICE_ALERTS,
  MAX_RECENT_FIRED_PRICE_ALERTS,
  PRICE_ALERTS_FULL,
  priceAlertDirection,
  type FiredPriceAlert,
  type PriceAlert,
} from "@/lib/trade/price-alerts"
import { priceAlertNoticeWords } from "@/lib/trade/trade-notice-words"
import { db, type CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import { writeTradeNotice } from "@/server/trade/notices"
import { tradePriceAlerts } from "@/server/trade/schema"

type CreatePriceAlertInput = {
  id: string
  marketKey: string
  price: number
  currentPrice: number
}

type MovePriceAlertInput = {
  id: string
  price: number
  currentPrice: number
}

function toPriceAlert(
  row: Omit<typeof tradePriceAlerts.$inferSelect, "userId" | "firedAt">
): PriceAlert {
  return {
    id: row.id,
    protocol: row.protocol,
    network: row.network,
    marketKey: row.marketKey,
    price: row.price,
    direction: row.direction,
    createdAt: row.createdAt.getTime(),
  }
}

function toFiredPriceAlert(
  row: Omit<typeof tradePriceAlerts.$inferSelect, "userId">
): FiredPriceAlert {
  if (!row.firedAt) throw new Error("PRICE_ALERT_FIRED_AT_MISSING")
  return {
    ...toPriceAlert(row),
    firedAt: row.firedAt.getTime(),
  }
}

/** Every armed alert for one account, oldest first. */
export async function loadArmedPriceAlerts(
  userId: string,
  database: CustomShellDb = db
): Promise<PriceAlert[]> {
  const rows = await database
    .select({
      id: tradePriceAlerts.id,
      protocol: tradePriceAlerts.protocol,
      network: tradePriceAlerts.network,
      marketKey: tradePriceAlerts.marketKey,
      price: tradePriceAlerts.price,
      direction: tradePriceAlerts.direction,
      createdAt: tradePriceAlerts.createdAt,
    })
    .from(tradePriceAlerts)
    .where(
      and(eq(tradePriceAlerts.userId, userId), isNull(tradePriceAlerts.firedAt))
    )
    .orderBy(asc(tradePriceAlerts.createdAt), asc(tradePriceAlerts.id))
  return rows.map(toPriceAlert)
}

/** The latest retired alerts for one account, newest fire first. */
export async function loadRecentFiredPriceAlerts(
  userId: string,
  database: CustomShellDb = db
): Promise<FiredPriceAlert[]> {
  const rows = await database
    .select({
      id: tradePriceAlerts.id,
      protocol: tradePriceAlerts.protocol,
      network: tradePriceAlerts.network,
      marketKey: tradePriceAlerts.marketKey,
      price: tradePriceAlerts.price,
      direction: tradePriceAlerts.direction,
      createdAt: tradePriceAlerts.createdAt,
      firedAt: tradePriceAlerts.firedAt,
    })
    .from(tradePriceAlerts)
    .where(
      and(
        eq(tradePriceAlerts.userId, userId),
        isNotNull(tradePriceAlerts.firedAt)
      )
    )
    .orderBy(
      desc(tradePriceAlerts.firedAt),
      desc(tradePriceAlerts.createdAt),
      asc(tradePriceAlerts.id)
    )
    .limit(MAX_RECENT_FIRED_PRICE_ALERTS)
  return rows.map(toFiredPriceAlert)
}

/** Save one line after deriving its direction from the click-time mark. */
export async function createPriceAlert(
  userId: string,
  input: CreatePriceAlertInput,
  database: CustomShellDb = db,
  createdAt = new Date()
): Promise<PriceAlert> {
  const market = parseMarketKey(input.marketKey)
  if (!market) throw new Error("PRICE_ALERT_MARKET_INVALID")
  if (
    !Number.isFinite(input.price) ||
    input.price <= 0 ||
    !Number.isFinite(input.currentPrice) ||
    input.currentPrice <= 0
  ) {
    throw new Error("PRICE_ALERT_PRICE_INVALID")
  }

  return database.transaction(async (tx) => {
    // One account row is the lock for its alert count, so two simultaneous
    // tabs cannot both see 99 and leave 101 armed rows behind.
    await tx
      .select({ id: customShellUsers.id })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, userId))
      .for("update")

    const [armed] = await tx
      .select({ value: count() })
      .from(tradePriceAlerts)
      .where(
        and(
          eq(tradePriceAlerts.userId, userId),
          isNull(tradePriceAlerts.firedAt)
        )
      )
    if ((armed?.value ?? 0) >= MAX_ARMED_PRICE_ALERTS) {
      throw new Error(PRICE_ALERTS_FULL)
    }

    const [saved] = await tx
      .insert(tradePriceAlerts)
      .values({
        userId,
        id: input.id,
        protocol: market.protocol,
        network: market.network,
        marketKey: input.marketKey,
        price: input.price,
        direction: priceAlertDirection(input.price, input.currentPrice),
        createdAt,
      })
      .returning({
        id: tradePriceAlerts.id,
        protocol: tradePriceAlerts.protocol,
        network: tradePriceAlerts.network,
        marketKey: tradePriceAlerts.marketKey,
        price: tradePriceAlerts.price,
        direction: tradePriceAlerts.direction,
        createdAt: tradePriceAlerts.createdAt,
      })
    if (!saved) throw new Error("PRICE_ALERT_NOT_SAVED")
    return toPriceAlert(saved)
  })
}

/** Re-price one account-owned alert while it is still waiting. */
export async function movePriceAlert(
  userId: string,
  input: MovePriceAlertInput,
  database: CustomShellDb = db
): Promise<PriceAlert> {
  if (
    !Number.isFinite(input.price) ||
    input.price <= 0 ||
    !Number.isFinite(input.currentPrice) ||
    input.currentPrice <= 0
  ) {
    throw new Error("PRICE_ALERT_PRICE_INVALID")
  }

  const [saved] = await database
    .update(tradePriceAlerts)
    .set({
      price: input.price,
      direction: priceAlertDirection(input.price, input.currentPrice),
    })
    .where(
      and(
        eq(tradePriceAlerts.userId, userId),
        eq(tradePriceAlerts.id, input.id),
        isNull(tradePriceAlerts.firedAt)
      )
    )
    .returning({
      id: tradePriceAlerts.id,
      protocol: tradePriceAlerts.protocol,
      network: tradePriceAlerts.network,
      marketKey: tradePriceAlerts.marketKey,
      price: tradePriceAlerts.price,
      direction: tradePriceAlerts.direction,
      createdAt: tradePriceAlerts.createdAt,
    })
  if (!saved) throw new Error("PRICE_ALERT_NOT_ACTIVE")
  return toPriceAlert(saved)
}

/** Remove one account-owned alert only while it is still waiting. */
export async function deletePriceAlert(
  userId: string,
  id: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const removed = await database
    .delete(tradePriceAlerts)
    .where(
      and(
        eq(tradePriceAlerts.userId, userId),
        eq(tradePriceAlerts.id, id),
        isNull(tradePriceAlerts.firedAt)
      )
    )
    .returning({ id: tradePriceAlerts.id })
  return removed.length > 0
}

/** Remove one account-owned fired-history row without touching armed alerts. */
export async function deleteFiredPriceAlert(
  userId: string,
  id: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const removed = await database
    .delete(tradePriceAlerts)
    .where(
      and(
        eq(tradePriceAlerts.userId, userId),
        eq(tradePriceAlerts.id, id),
        isNotNull(tradePriceAlerts.firedAt)
      )
    )
    .returning({ id: tradePriceAlerts.id })
  return removed.length > 0
}

/**
 * Retire every crossed alert from one pushed-price snapshot.
 *
 * The conditional update is the claim. Two engine containers may read the
 * same armed row, but only the one whose update changes it writes the notice.
 */
export async function checkPriceAlerts({
  pushedMarks,
  checkedAt = new Date(),
  database = db,
}: {
  pushedMarks: (marketKeys: readonly string[]) => {
    marks: ReadonlyMap<string, number>
    missing: string[]
  }
  checkedAt?: Date
  database?: CustomShellDb
}): Promise<number> {
  const alerts = await database
    .select()
    .from(tradePriceAlerts)
    .where(isNull(tradePriceAlerts.firedAt))
    .orderBy(asc(tradePriceAlerts.createdAt), asc(tradePriceAlerts.id))
  if (alerts.length === 0) return 0

  const marketKeys = [...new Set(alerts.map((alert) => alert.marketKey))]
  const { marks } = pushedMarks(marketKeys)
  let fired = 0
  for (const alert of alerts) {
    const mark = marks.get(alert.marketKey)
    if (mark === undefined) continue
    const crossed =
      alert.direction === "above" ? mark >= alert.price : mark <= alert.price
    if (!crossed) continue

    await database.transaction(async (tx) => {
      const claimed = await tx
        .update(tradePriceAlerts)
        .set({ firedAt: checkedAt })
        .where(
          and(
            eq(tradePriceAlerts.userId, alert.userId),
            eq(tradePriceAlerts.id, alert.id),
            eq(tradePriceAlerts.price, alert.price),
            eq(tradePriceAlerts.direction, alert.direction),
            isNull(tradePriceAlerts.firedAt)
          )
        )
        .returning({ id: tradePriceAlerts.id })
      if (claimed.length === 0) return

      const words = priceAlertNoticeWords(alert)
      await writeTradeNotice({
        userId: alert.userId,
        title: words.title,
        body: words.body,
        level: words.level,
        href: marketChartHref(alert.marketKey),
        soundKind: "alert",
        createdAt: checkedAt,
        database: tx,
      })
      fired += 1
    })
  }
  return fired
}
