import { and, eq, inArray } from "drizzle-orm"

import {
  gridRungNumber,
  readGridPlan,
  type GridPlan,
} from "@/lib/trade/grid"
import type { LiveFill } from "@/lib/trade/live-trades"
import { db, type CustomShellDb } from "@/server/db"
import {
  tradeGridOrderRungs,
  tradeSmartLadders,
} from "@/server/trade/schema"

type GridFillLevel = Pick<
  GridPlan["levels"][number],
  "budget" | "sz" | "buyPx"
>
type GridFillPlan = {
  direction: GridPlan["direction"]
  levels: readonly GridFillLevel[]
  carriedLevels: readonly GridFillLevel[]
}

/**
 * Adds the rung carried by each grid entry.
 *
 * The exchange does not return the rung. The saved grid does retain each
 * rung's dollar budget, which stays with that rung when the range moves. One
 * exchange order can arrive in several pieces, so the match uses the whole
 * order rather than trying to name each piece by itself.
 */
export function stampGridRungs(
  fills: readonly LiveFill[],
  plan: GridFillPlan
): LiveFill[] {
  const opens = plan.direction === "long" ? "buy" : "sell"
  const candidates = [
    ...plan.levels.map((level, index) => ({
      level,
      rung: gridRungNumber(index, plan.levels.length, plan.direction),
    })),
    ...plan.carriedLevels.map((level) => ({ level, rung: 1 })),
  ]
  const entries = new Map<string, LiveFill[]>()
  for (const fill of fills) {
    if (fill.side !== opens) continue
    const key = `${fill.walletId} ${fill.marketKey} ${fill.orderId}`
    const pieces = entries.get(key)
    if (pieces) pieces.push(fill)
    else entries.set(key, [fill])
  }

  const rungByFill = new Map<string, number>()
  for (const pieces of entries.values()) {
    const sz = pieces.reduce((sum, fill) => sum + fill.sz, 0)
    const dollars = pieces.reduce((sum, fill) => sum + fill.px * fill.sz, 0)
    const px = sz > 0 ? dollars / sz : 0
    const closest = candidates.reduce<
      { rung: number; score: number } | undefined
    >((best, candidate) => {
      const budgetScore = relativeDistance(dollars, candidate.level.budget)
      const sizeScore = relativeDistance(sz, candidate.level.sz)
      const priceScore = relativeDistance(px, candidate.level.buyPx)
      const score = budgetScore * 4 + sizeScore + priceScore * 0.01
      return !best || score < best.score
        ? { rung: candidate.rung, score }
        : best
    }, undefined)
    if (!closest) continue
    for (const fill of pieces) rungByFill.set(fill.fillId, closest.rung)
  }

  return fills.map((fill) => {
    const rung = rungByFill.get(fill.fillId)
    return {
      ...fill,
      grid: true,
      gridDirection: plan.direction,
      ...(rung === undefined ? {} : { gridRung: rung }),
    }
  })
}

function relativeDistance(actual: number, expected: number): number {
  if (!(actual > 0) || !(expected > 0)) return Infinity
  return Math.abs(Math.log(actual / expected))
}

export type GridOrderRungInput = {
  userId: string
  walletId: string
  orderId: string
  ladderId: string
  marketKey: string
  direction: "long" | "short"
  /** Counted from one, as shown on the grid. */
  rung: number
}

type GridOrderRungStamp = Pick<
  GridOrderRungInput,
  "walletId" | "orderId" | "direction" | "rung"
>

/** Exact engine records outrank the size match kept for older fills. */
export function stampExactGridRungs(
  fills: readonly LiveFill[],
  rows: readonly GridOrderRungStamp[]
): LiveFill[] {
  const byOrder = new Map(
    rows.map((row) => [`${row.walletId} ${row.orderId}`, row])
  )
  return fills.map((fill) => {
    const exact = byOrder.get(`${fill.walletId} ${fill.orderId}`)
    return exact
      ? {
          ...fill,
          grid: true,
          gridDirection: exact.direction,
          gridRung: exact.rung,
        }
      : fill
  })
}

/** Records the exact rung before the exchange fill is read back. */
export async function recordGridOrderRung(
  database: CustomShellDb,
  input: GridOrderRungInput
): Promise<void> {
  await database
    .insert(tradeGridOrderRungs)
    .values(input)
    .onConflictDoNothing()
}

/** A record failure cannot take down an order the exchange already filled. */
export async function rememberGridOrderRung(
  input: GridOrderRungInput
): Promise<void> {
  try {
    await recordGridOrderRung(db, input)
  } catch (error) {
    console.error("trade_grid_order_rungs write failed", error)
  }
}

/**
 * Marks the fills a grid level made, so the chart can say what that level made.
 *
 * **Why the fill has to be told and cannot work it out.** An exchange reports a
 * fill and nothing else: a coin, a price, a size and what it booked. Whether a
 * grid or a ladder sent it is something only this app knows, and it matters,
 * because the two want different money written on the same sell. A ladder's
 * part-close is a share of one blended position and the exchange's own figure
 * is right for it. A grid's sell is one level closing the coins that same level
 * bought, and the exchange's figure is wrong for it every time. `gridRoundTrips`
 * in `live-trades.ts` has the arithmetic and the case it was found on.
 *
 * **Matched on when, not just on which coin.** A market can carry a ladder one
 * week and a grid the next, and the fills sit in one table together. So each
 * grid row is read as a span — from when it was placed, until it flipped to
 * done — and only a fill inside a span is a grid's. A grid still working has no
 * end to its span yet.
 *
 * Done rows are read as well as working ones, deliberately. They are kept for
 * the record, and without them every finished grid's arrows would quietly go
 * back to the exchange's figures the moment the grid closed, so the same sell
 * would be worth two different amounts depending on when you looked at it.
 */
export async function stampGridFills(
  userId: string,
  walletIds: readonly string[],
  fills: LiveFill[]
): Promise<LiveFill[]> {
  if (walletIds.length === 0 || fills.length === 0) return fills
  const marketKeys = [...new Set(fills.map((fill) => fill.marketKey))]

  const orderIds = [...new Set(fills.map((fill) => fill.orderId))]
  const [rows, exactRows] = await Promise.all([
    db
      .select({
        walletId: tradeSmartLadders.walletId,
        marketKey: tradeSmartLadders.marketKey,
        status: tradeSmartLadders.status,
        plan: tradeSmartLadders.plan,
        createdAt: tradeSmartLadders.createdAt,
        updatedAt: tradeSmartLadders.updatedAt,
      })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          inArray(tradeSmartLadders.walletId, [...walletIds]),
          inArray(tradeSmartLadders.marketKey, marketKeys),
          eq(tradeSmartLadders.kind, "grid")
        )
      ),
    db
      .select({
        walletId: tradeGridOrderRungs.walletId,
        orderId: tradeGridOrderRungs.orderId,
        direction: tradeGridOrderRungs.direction,
        rung: tradeGridOrderRungs.rung,
      })
      .from(tradeGridOrderRungs)
      .where(
        and(
          eq(tradeGridOrderRungs.userId, userId),
          inArray(tradeGridOrderRungs.walletId, [...walletIds]),
          inArray(tradeGridOrderRungs.orderId, orderIds)
        )
      ),
  ])
  if (rows.length === 0) return fills

  const spans = new Map<
    string,
    { from: number; to: number; plan: GridPlan | null }[]
  >()
  for (const row of rows) {
    const key = `${row.walletId} ${row.marketKey}`
    const list = spans.get(key)
    const span = {
      from: row.createdAt.getTime(),
      // A grid still working has not finished, so its span has no end. A
      // finished one ends when it was written down as finished, which is
      // always after its last fill.
      to: row.status === "done" ? row.updatedAt.getTime() : Infinity,
      plan: readGridPlan(row.plan),
    }
    if (list) list.push(span)
    else spans.set(key, [span])
  }

  const stamped = new Map<string, LiveFill>()
  for (const [key, list] of spans) {
    for (const span of list) {
      const inside = fills.filter(
        (fill) =>
          `${fill.walletId} ${fill.marketKey}` === key &&
          fill.at >= span.from &&
          fill.at <= span.to
      )
      const inferred = span.plan
        ? stampGridRungs(inside, span.plan)
        : inside.map((fill) => ({ ...fill, grid: true }))
      const marked = stampExactGridRungs(inferred, exactRows)
      for (const fill of marked) {
        stamped.set(`${fill.walletId} ${fill.fillId}`, fill)
      }
    }
  }

  return fills.map(
    (fill) => stamped.get(`${fill.walletId} ${fill.fillId}`) ?? fill
  )
}
