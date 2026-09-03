import { and, asc, eq, isNotNull, sql } from "drizzle-orm"

import {
  MAX_RECENT_FIRED_LINE_ALERTS,
  type LineAlert,
  type LineAlertList,
} from "@/lib/trade/line-alerts"

import { marketChartHref } from "@/lib/protocols/contracts"
import {
  drawingAlertArmed,
  priceAtTime,
  readDrawingAlert,
  readDrawingShape,
} from "@/lib/trade/drawings"
import { drawingAlertNoticeWords } from "@/lib/trade/trade-notice-words"
import { db, type CustomShellDb } from "@/server/db"
import { writeTradeNotice } from "@/server/trade/notices"
import { tradeChartDrawings } from "@/server/trade/schema"

/**
 * Every line alert one account has, armed ones oldest first and fired ones
 * newest first, for the Alerts panel to list beside the price alerts.
 */
export async function loadDrawingAlerts(
  userId: string,
  now = Date.now(),
  database: CustomShellDb = db
): Promise<LineAlertList> {
  const rows = await database
    .select({
      id: tradeChartDrawings.id,
      marketKey: tradeChartDrawings.marketKey,
      shape: tradeChartDrawings.shape,
      alert: tradeChartDrawings.alert,
    })
    .from(tradeChartDrawings)
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        isNotNull(tradeChartDrawings.alert)
      )
    )

  const armed: LineAlert[] = []
  const fired: LineAlert[] = []
  for (const row of rows) {
    const alert = readDrawingAlert(row.alert)
    const shape = readDrawingShape(row.shape)
    if (!alert || !shape) continue
    const listed: LineAlert = {
      id: row.id,
      marketKey: row.marketKey,
      kind: shape.kind,
      price: priceAtTime(shape, alert.firedAt ?? now),
      direction: alert.direction,
      armedAt: alert.armedAt,
      firedAt: alert.firedAt,
    }
    if (alert.firedAt === null) armed.push(listed)
    else fired.push(listed)
  }
  armed.sort((a, b) => a.armedAt - b.armedAt || a.id.localeCompare(b.id))
  fired.sort(
    (a, b) => (b.firedAt ?? 0) - (a.firedAt ?? 0) || a.id.localeCompare(b.id)
  )
  return { armed, fired: fired.slice(0, MAX_RECENT_FIRED_LINE_ALERTS) }
}

/**
 * Ring the bell for every armed drawn line the price has crossed.
 *
 * The same shape as `checkPriceAlerts`, and run beside it once per engine
 * pass. A trendline's price at "now" is its slope carried on, so a line drawn
 * through last week is compared at today's point on it. A market with no
 * pushed price waits.
 *
 * The conditional update is the claim, and it names the line's points as well
 * as the alert: a line dragged somewhere else after the engine read it, or an
 * alert switched off meanwhile, changes the row and the claim misses. Two
 * engine containers can both read the row, but only the one whose update
 * changes it writes the notice.
 */
export async function checkDrawingAlerts({
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
  const rows = await database
    .select({
      userId: tradeChartDrawings.userId,
      id: tradeChartDrawings.id,
      marketKey: tradeChartDrawings.marketKey,
      shape: tradeChartDrawings.shape,
      alert: tradeChartDrawings.alert,
    })
    .from(tradeChartDrawings)
    // Armed only. A fired record stays on its row for the popover to read,
    // and the engine has no business with it.
    .where(
      and(
        isNotNull(tradeChartDrawings.alert),
        sql`${tradeChartDrawings.alert}->>'firedAt' IS NULL`
      )
    )
    .orderBy(asc(tradeChartDrawings.createdAt), asc(tradeChartDrawings.id))

  // Only a trendline carries an alert today. A level's alert is its own task,
  // with its own words, so a level row is left alone rather than announced as
  // a line it is not.
  const armed = rows.flatMap((row) => {
    const alert = readDrawingAlert(row.alert)
    const shape = readDrawingShape(row.shape)
    return drawingAlertArmed(alert) && alert && shape?.kind === "trendline"
      ? [{ ...row, alert, shape }]
      : []
  })
  if (armed.length === 0) return 0

  const marketKeys = [...new Set(armed.map((row) => row.marketKey))]
  const { marks } = pushedMarks(marketKeys)
  const now = checkedAt.getTime()
  let fired = 0
  for (const row of armed) {
    const mark = marks.get(row.marketKey)
    if (mark === undefined) continue
    const linePrice = priceAtTime(row.shape, now)
    if (linePrice === null) continue
    const crossed =
      row.alert.direction === "above" ? mark >= linePrice : mark <= linePrice
    if (!crossed) continue

    await database.transaction(async (tx) => {
      const claimed = await tx
        .update(tradeChartDrawings)
        .set({ alert: { ...row.alert, firedAt: now } })
        .where(
          and(
            eq(tradeChartDrawings.userId, row.userId),
            eq(tradeChartDrawings.id, row.id),
            eq(tradeChartDrawings.shape, row.shape),
            eq(tradeChartDrawings.alert, row.alert)
          )
        )
        .returning({ id: tradeChartDrawings.id })
      if (claimed.length === 0) return

      const words = drawingAlertNoticeWords({
        marketKey: row.marketKey,
        price: linePrice,
        direction: row.alert.direction,
      })
      await writeTradeNotice({
        userId: row.userId,
        title: words.title,
        body: words.body,
        level: words.level,
        href: marketChartHref(row.marketKey),
        soundKind: "alert",
        createdAt: checkedAt,
        database: tx,
      })
      fired += 1
    })
  }
  return fired
}
