import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm"

import {
  MAX_RECENT_FIRED_LINE_ALERTS,
  type LineAlert,
  type LineAlertList,
} from "@/lib/trade/line-alerts"

import { marketChartHref } from "@/lib/protocols/contracts"
import { priceAlertDirection } from "@/lib/trade/price-alerts"
import {
  drawingAlertArmed,
  priceAtTime,
  readDrawingAlert,
  readDrawingShape,
} from "@/lib/trade/drawings"
import { drawingAlertNoticeWords } from "@/lib/trade/trade-notice-words"
import { db, type CustomShellDb } from "@/server/db"
import { writeTradeNotice } from "@/server/trade/notices"
import { loadLineAlertsPaused } from "@/server/trade/prefs"
import { tradeChartDrawings, tradePrefs } from "@/server/trade/schema"

/**
 * Every line alert one account has, armed ones oldest first and fired ones
 * newest first, for the Alerts panel to list beside the price alerts.
 */
export async function loadDrawingAlerts(
  userId: string,
  now = Date.now(),
  database: CustomShellDb = db
): Promise<LineAlertList> {
  const [rows, paused] = await Promise.all([
    database
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
      ),
    loadLineAlertsPaused(userId, database),
  ])

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
      price: alert.firedPrice ?? priceAtTime(shape, alert.firedAt ?? now),
      direction: alert.direction,
      armedAt: alert.armedAt,
      firedAt: alert.firedAt,
      name: shape.name ?? null,
    }
    if (alert.firedAt === null) armed.push(listed)
    else fired.push(listed)
  }
  armed.sort((a, b) => a.armedAt - b.armedAt || a.id.localeCompare(b.id))
  fired.sort(
    (a, b) => (b.firedAt ?? 0) - (a.firedAt ?? 0) || a.id.localeCompare(b.id)
  )
  return { armed, fired: fired.slice(0, MAX_RECENT_FIRED_LINE_ALERTS), paused }
}

/**
 * Ring the bell for every armed drawn line the price has crossed.
 *
 * The same shape as `checkPriceAlerts`, and run beside it once per engine
 * pass. A level is the same price at every moment. A trendline's price at
 * "now" is its slope carried on, so a line drawn through last week is
 * compared at today's point on it. A market with no pushed price waits.
 *
 * The conditional update is the claim, and it names the line's points as well
 * as the alert: a line dragged somewhere else after the engine read it, or an
 * alert switched off meanwhile, changes the row and the claim misses. Two
 * engine containers can both read the row, but only the one whose update
 * changes it writes the notice.
 *
 * An account whose master switch in Settings is off is read too, but a cross
 * on one of its lines rings nothing. Instead the alert is turned to face the
 * price again, so it waits for the price to come back across. That is what
 * makes a cross that happened while paused stay silent after the switch goes
 * back on: the line has to be crossed once more, and then it rings once.
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

  const armed = rows.flatMap((row) => {
    const alert = readDrawingAlert(row.alert)
    const shape = readDrawingShape(row.shape)
    return drawingAlertArmed(alert) && alert && shape
      ? [{ ...row, alert, shape }]
      : []
  })
  if (armed.length === 0) return 0

  const marketKeys = [...new Set(armed.map((row) => row.marketKey))]
  const userIds = [...new Set(armed.map((row) => row.userId))]
  const { marks } = pushedMarks(marketKeys)
  const pausedRows = await database
    .select({ userId: tradePrefs.userId })
    .from(tradePrefs)
    .where(
      and(
        inArray(tradePrefs.userId, userIds),
        eq(tradePrefs.lineAlertsPaused, true)
      )
    )
  const paused = new Set(pausedRows.map((row) => row.userId))
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

    // The same guarded write either way, so a line moved or switched off
    // after the read is never touched.
    const claim = and(
      eq(tradeChartDrawings.userId, row.userId),
      eq(tradeChartDrawings.id, row.id),
      eq(tradeChartDrawings.shape, row.shape),
      eq(tradeChartDrawings.alert, row.alert)
    )

    if (paused.has(row.userId)) {
      // Turned to face the price again, the same rule a dragged line follows.
      // That is what makes this cross stay silent after the switch goes back
      // on: the line now waits for the price to come back across it.
      const direction = priceAlertDirection(linePrice, mark)
      if (direction === row.alert.direction) continue
      await database
        .update(tradeChartDrawings)
        .set({ alert: { ...row.alert, direction } })
        .where(claim)
      continue
    }

    await database.transaction(async (tx) => {
      const claimed = await tx
        .update(tradeChartDrawings)
        .set({ alert: { ...row.alert, firedAt: now, firedPrice: linePrice } })
        .where(claim)
        .returning({ id: tradeChartDrawings.id })
      if (claimed.length === 0) return

      const words = drawingAlertNoticeWords({
        marketKey: row.marketKey,
        kind: row.shape.kind,
        price: linePrice,
        direction: row.alert.direction,
        name: row.shape.name ?? null,
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
