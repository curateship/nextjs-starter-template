import { and, asc, count, eq } from "drizzle-orm"

import {
  DRAWINGS_FULL,
  MAX_DRAWINGS_PER_MARKET,
  readDrawingShape,
  type Drawing,
  type DrawingShape,
} from "@/lib/trade/drawings"
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
    if (shape) drawings.push({ id: row.id, shape })
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
 */
export async function saveChartDrawing(
  userId: string,
  marketKey: string,
  drawing: { id: string; shape: DrawingShape }
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
