import { db as receiptDb } from "@/server/db"
import { and, eq, gte, sql } from "drizzle-orm"
import { parseMarketKey, type WalletOrderFill } from "@/lib/protocols/contracts"

import {
  eligibleGridStopLines,
  matchesGridStopLine,
  type GridLineStop,
} from "@/lib/trade/grid-line-stop"
import { readDrawingAlert, readDrawingShape } from "@/lib/trade/drawings"
import { db, type CustomShellDb } from "@/server/trade/db"
import {
  tradeChartDrawings,
  tradeGridLineStops,
  tradeLiveFills,
  tradePrefs,
  tradeWorkerHeartbeats,
} from "./schema"

/** Drizzle wraps database refusals. Send only our known code across the API. */
export function rethrowGridLineStopError(error: unknown): never {
  let cause = error
  while (cause instanceof Error) {
    const code = cause.message.match(
      /^SMART_GRID_LINE_STOP_[A-Z_]+(?::[^\n]*)?/
    )
    if (code) throw new Error(code[0])
    cause = cause.cause
  }
  throw error
}

export async function lockGridLineStops(
  userId: string,
  database: CustomShellDb = db
): Promise<void> {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${"grid-line-stop:" + userId}, 0))`
  )
}

/** The caller owns the wallet transaction before taking the drawing lock. */
export async function validateGridLineStop(
  userId: string,
  marketKey: string,
  stop: GridLineStop,
  database: CustomShellDb = db
): Promise<void> {
  await lockGridLineStops(userId, database)
  const [row] = await database
    .select()
    .from(tradeChartDrawings)
    .where(
      and(
        eq(tradeChartDrawings.userId, userId),
        eq(tradeChartDrawings.id, stop.drawingId),
        eq(tradeChartDrawings.marketKey, marketKey)
      )
    )
  const [prefs] = await database
    .select({ paused: tradePrefs.lineAlertsPaused })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
  const shape = readDrawingShape(row?.shape)
  const drawing =
    shape && row
      ? { id: row.id, shape, alert: readDrawingAlert(row.alert) }
      : null
  if (
    !drawing ||
    !matchesGridStopLine(drawing, stop) ||
    !eligibleGridStopLines([drawing], prefs?.paused ?? false).length
  ) {
    throw new Error("SMART_GRID_LINE_STOP_UNAVAILABLE")
  }
}

export async function requireGridLineStopEngine(
  database: CustomShellDb = db
): Promise<void> {
  const installed = await database.execute(
    sql`select to_regclass('public.trade_grid_line_stops') is not null as installed`
  )
  const rows = Array.isArray(installed)
    ? installed
    : (installed as unknown as { rows: { installed: boolean }[] }).rows
  if (!rows[0]?.installed) throw new Error("SMART_GRID_LINE_STOP_ENGINE")
  const beats = await database
    .select()
    .from(tradeWorkerHeartbeats)
    .where(
      and(
        eq(tradeWorkerHeartbeats.kind, "ladders"),
        gte(tradeWorkerHeartbeats.lastSeenAt, new Date(Date.now() - 30_000))
      )
    )
  if (
    !beats.some((beat) => beat.role === "leader") ||
    !beats.every((beat) => beat.meta?.gridLineStop === true)
  ) {
    throw new Error("SMART_GRID_LINE_STOP_ENGINE")
  }
}

export async function readGridLineStop(
  userId: string,
  gridId: string,
  marketKey: string,
  stop: GridLineStop,
  database: CustomShellDb = db
) {
  await lockGridLineStops(userId, database)
  const [row] = await database
    .select()
    .from(tradeGridLineStops)
    .where(
      and(
        eq(tradeGridLineStops.userId, userId),
        eq(tradeGridLineStops.gridId, gridId),
        eq(tradeGridLineStops.drawingId, stop.drawingId),
        eq(tradeGridLineStops.armedAt, stop.armedAt)
      )
    )
  if (!row || (row.state !== "watching" && row.state !== "pending"))
    throw new Error("SMART_GRID_LINE_STOP_UNAVAILABLE")
  if (row.state === "watching")
    await validateGridLineStop(userId, marketKey, stop, database)
  return row
}

export async function completeGridLineStop(
  userId: string,
  gridId: string,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .update(tradeGridLineStops)
    .set({ state: "done", completedAt: new Date() })
    .where(
      and(
        eq(tradeGridLineStops.userId, userId),
        eq(tradeGridLineStops.gridId, gridId),
        eq(tradeGridLineStops.state, "pending")
      )
    )
}

/** Receipts commit independently so a process crash cannot erase a known close.
 * The wallet owner calls this before and after the external close request.
 * No wallet or drawing lock is acquired here: the caller already owns both.
 */
export async function recordGridLineStopClose(
  userId: string,
  gridId: string,
  requestedSz: number,
  confirmed: boolean
): Promise<void> {
  await receiptDb
    .update(tradeGridLineStops)
    .set({
      expectedCloseSz: sql`greatest(coalesce(${tradeGridLineStops.expectedCloseSz}, 0), ${requestedSz})`,
      ...(confirmed
        ? { closeConfirmed: true }
        : {
            closeStartedAt: sql`coalesce(${tradeGridLineStops.closeStartedAt}, ${new Date()})`,
          }),
    })
    .where(
      and(
        eq(tradeGridLineStops.userId, userId),
        eq(tradeGridLineStops.gridId, gridId),
        eq(tradeGridLineStops.state, "pending")
      )
    )
}

/** Saved fill identities make recovery independent of the feed's recent window. */
export async function gridLineStopClosedSize(input: {
  userId: string
  walletId: string
  marketKey: string
  firedAt: number
  side: "buy" | "sell"
  fills: readonly WalletOrderFill[]
}): Promise<number> {
  const saved = await db
    .select({
      fillId: tradeLiveFills.fillId,
      side: tradeLiveFills.side,
      sz: tradeLiveFills.sz,
      dir: tradeLiveFills.dir,
    })
    .from(tradeLiveFills)
    .where(
      and(
        eq(tradeLiveFills.userId, input.userId),
        eq(tradeLiveFills.walletId, input.walletId),
        eq(tradeLiveFills.marketKey, input.marketKey),
        gte(tradeLiveFills.at, input.firedAt)
      )
    )
  const marketId = parseMarketKey(input.marketKey)?.marketId
  const fills = new Map(saved.map((fill) => [fill.fillId, fill]))
  for (const fill of input.fills) {
    if (fill.marketId === marketId && fill.at >= input.firedAt) {
      fills.set(fill.fillId, fill)
    }
  }
  return [...fills.values()]
    .filter(
      (fill) =>
        fill.side === input.side && fill.dir.toLowerCase().includes("close")
    )
    .reduce((sum, fill) => sum + fill.sz, 0)
}
