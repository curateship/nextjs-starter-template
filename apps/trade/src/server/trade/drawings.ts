import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm"

import {
  DRAWINGS_FULL,
  DRAWING_ALERT_NO_PRICE,
  DRAWING_ALERT_NOT_ARMED,
  MAX_DRAWINGS_PER_MARKET,
  bufferedAlert,
  drawingAlertArmed,
  extendedRight,
  priceAtTime,
  readDrawingAlert,
  readDrawingShape,
  type Drawing,
  type DrawingAlert,
  type DrawingShape,
} from "@/lib/trade/drawings"
import { priceAlertDirection } from "@/lib/trade/price-alerts"
import { db } from "@/server/db"
import { tradeChartDrawings } from "@/server/trade/schema"

/**
 * One market's drawings, oldest first so the drawing order on screen is the
 * order they were made in.
 *
 * A row whose shape cannot be read is left out rather than drawn as something
 * it is not — the same rule the market keys follow. It stays in the table, so
 * nothing is destroyed by a build that did not understand it.
 */
export async function loadChartDrawings(
  userId: string,
  marketKey: string
): Promise<Drawing[]> {
  const rows = await db
    .select({
      id: tradeChartDrawings.id,
      shape: tradeChartDrawings.shape,
      alert: tradeChartDrawings.alert,
    })
    .from(tradeChartDrawings)
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        eq(tradeChartDrawings.marketKey, marketKey)
      )
    )
    .orderBy(asc(tradeChartDrawings.createdAt), asc(tradeChartDrawings.id))

  const drawings: Drawing[] = []
  for (const row of rows) {
    const shape = readDrawingShape(row.shape)
    if (shape) {
      drawings.push({ id: row.id, shape, alert: readDrawingAlert(row.alert) })
    }
  }
  return drawings
}

/**
 * Save a drawing, new or moved. One call for both because the screen does not
 * distinguish them either: a line that has just been dragged is the same line.
 *
 * Keyed on the person and the drawing together, so a request carrying an id
 * that belongs to somebody else writes a new row of its own instead of
 * touching theirs. The market key is only set on the way in — moving a drawing
 * cannot move it to another market, because the update never writes that
 * column.
 *
 * **A moved line keeps its alert, pointed the right way.** The alert waits for
 * the price to cross the line from one side, fixed when the switch went on.
 * Dragging the line to the other side of the price would make that side wrong
 * and fire it on the next pass for nothing, so when the screen says where the
 * price is, the direction is set again from the line's new place. Only an
 * alert still waiting is touched: one that has fired stays fired.
 */
export async function saveChartDrawing(
  userId: string,
  marketKey: string,
  drawing: { id: string; shape: DrawingShape },
  currentPrice: number | null = null,
  now = Date.now()
): Promise<void> {
  const existing = await db
    .select({ id: tradeChartDrawings.id })
    .from(tradeChartDrawings)
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        eq(tradeChartDrawings.id, drawing.id)
      )
    )
    .limit(1)

  if (existing.length === 0) {
    const [total] = await db
      .select({ total: count() })
      .from(tradeChartDrawings)
      .where(
        and(
          eq(tradeChartDrawings.userId, userId),
          eq(tradeChartDrawings.marketKey, marketKey)
        )
      )
    if ((total?.total ?? 0) >= MAX_DRAWINGS_PER_MARKET) {
      throw new Error(DRAWINGS_FULL)
    }
  }

  await db
    .insert(tradeChartDrawings)
    .values({
      userId,
      id: drawing.id,
      marketKey,
      shape: drawing.shape,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tradeChartDrawings.userId, tradeChartDrawings.id],
      set: { shape: drawing.shape, updatedAt: new Date() },
    })

  if (currentPrice === null) return
  const linePrice = priceAtTime(drawing.shape, now)
  if (linePrice === null) return
  const direction = priceAlertDirection(linePrice, currentPrice)
  await db
    .update(tradeChartDrawings)
    .set({
      alert: sql`jsonb_set(${tradeChartDrawings.alert}, '{direction}', ${JSON.stringify(direction)}::jsonb)`,
    })
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        eq(tradeChartDrawings.id, drawing.id),
        isNotNull(tradeChartDrawings.alert),
        sql`${tradeChartDrawings.alert}->>'firedAt' IS NULL`
      )
    )
}

/**
 * Switch a drawing's alert on or off.
 *
 * On: the direction is fixed from where the line is right now against the
 * live price, and the record starts fresh, so a line that fired before can be
 * armed again. A trendline is also drawn on to the right edge from then on,
 * so the place the alert will fire is on screen. Off: the record goes, fired
 * or not, and the line keeps drawing the way it was.
 *
 * **A break buffer survives a firing.** Switching a line that has already
 * fired back on is the same watch carried on, so the percentage it waits past
 * the line comes with it. Switching the alert off by hand takes the whole
 * record, buffer included, because that is somebody saying they are done
 * with this line.
 */
export async function setChartDrawingAlert(
  userId: string,
  input: {
    id: string
    on: boolean
    currentPrice: number | null
    /** The account's last choice. Left out by older internal callers. */
    buffer?: number | null
  },
  now = Date.now()
): Promise<Drawing> {
  const [row] = await db
    .select({
      id: tradeChartDrawings.id,
      shape: tradeChartDrawings.shape,
      alert: tradeChartDrawings.alert,
    })
    .from(tradeChartDrawings)
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        eq(tradeChartDrawings.id, input.id)
      )
    )
    .limit(1)
  const shape = row ? readDrawingShape(row.shape) : null
  if (!row || !shape) throw new Error("DRAWING_NOT_FOUND")

  let alert: DrawingAlert | null = null
  let saved = shape
  if (input.on) {
    const linePrice = priceAtTime(shape, now)
    if (linePrice === null || input.currentPrice === null) {
      throw new Error(DRAWING_ALERT_NO_PRICE)
    }
    const previousAlert = readDrawingAlert(row.alert)
    alert = bufferedAlert(
      {
        direction: priceAlertDirection(linePrice, input.currentPrice),
        armedAt: now,
        firedAt: null,
      },
      previousAlert ? (previousAlert.buffer ?? null) : (input.buffer ?? null)
    )
    saved = extendedRight(shape)
  }

  // The shape is only written when the switch changed it. Writing it back
  // unchanged would undo a drag that landed between the read above and here.
  await db
    .update(tradeChartDrawings)
    .set(
      saved === shape
        ? { alert, updatedAt: new Date() }
        : { alert, shape: saved, updatedAt: new Date() }
    )
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        eq(tradeChartDrawings.id, input.id)
      )
    )
  return { id: row.id, shape: saved, alert }
}

/**
 * Set or clear how far past the line an armed alert waits, as a percentage.
 *
 * Its own door rather than a second job for `setChartDrawingAlert`, because
 * that one arms and disarms: putting the buffer through it would reset the
 * direction and the armed time every time somebody corrected a number.
 *
 * Only an armed alert takes one. A window left open while the engine rang the
 * alert underneath it is refused rather than quietly writing a buffer onto a
 * record nobody is watching.
 */
export async function setChartDrawingAlertBuffer(
  userId: string,
  input: { id: string; buffer: number | null }
): Promise<Drawing> {
  const [row] = await db
    .select({
      id: tradeChartDrawings.id,
      shape: tradeChartDrawings.shape,
      alert: tradeChartDrawings.alert,
    })
    .from(tradeChartDrawings)
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        eq(tradeChartDrawings.id, input.id)
      )
    )
    .limit(1)
  const shape = row ? readDrawingShape(row.shape) : null
  if (!row || !shape) throw new Error("DRAWING_NOT_FOUND")

  const alert = readDrawingAlert(row.alert)
  if (!drawingAlertArmed(alert) || !alert) {
    throw new Error(DRAWING_ALERT_NOT_ARMED)
  }

  const saved = bufferedAlert(alert, input.buffer)
  await db
    .update(tradeChartDrawings)
    .set({ alert: saved, updatedAt: new Date() })
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        eq(tradeChartDrawings.id, input.id)
      )
    )
  return { id: row.id, shape, alert: saved }
}

/** Remove one, and say whether there was one to remove. */
export async function deleteChartDrawing(
  userId: string,
  id: string
): Promise<boolean> {
  const removed = await db
    .delete(tradeChartDrawings)
    .where(
      and(eq(tradeChartDrawings.userId, userId), eq(tradeChartDrawings.id, id))
    )
    .returning({ id: tradeChartDrawings.id })
  return removed.length > 0
}

/**
 * Clear one market's chart, and say how many went.
 *
 * One statement rather than a loop over the ids the screen happens to be
 * showing: a loop can stop half way with nothing to say about it, and it
 * cannot see a drawing another tab added meanwhile. "Everything on this
 * market" is the whole instruction, so it is the whole query.
 */
export async function clearChartDrawings(
  userId: string,
  marketKey: string
): Promise<number> {
  const removed = await db
    .delete(tradeChartDrawings)
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        eq(tradeChartDrawings.marketKey, marketKey)
      )
    )
    .returning({ id: tradeChartDrawings.id })
  return removed.length
}
