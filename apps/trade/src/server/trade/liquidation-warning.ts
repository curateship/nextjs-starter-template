import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm"

import {
  marketChartHref,
  marketSymbol,
  protocolLabel,
} from "@/lib/protocols/contracts"
import { formatAway, formatUsd } from "@/lib/trade/format"
import { isInsideLiquidationWarning } from "@/lib/trade/liquidation-warning"
import { liquidationDistance, type TradePosition } from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/db"
import { loadLiquidationWarning } from "@/server/trade/prefs"
import { tradeLiquidationWarnings } from "@/server/trade/schema"
import { writeTradeNotice } from "@/server/trade/notices"

export async function checkLiquidationWarnings({
  userId,
  wallet,
  positions,
  marks,
  checkedAt = new Date(),
  database = db,
}: {
  userId: string
  wallet: TradeWallet
  positions: readonly TradePosition[]
  marks: ReadonlyMap<string, number>
  checkedAt?: Date
  database?: CustomShellDb
}): Promise<void> {
  const openKeys = new Set(positions.map((position) => position.marketKey))
  // The setting and the remembered rows do not depend on each other.
  const [warning, remembered] = await Promise.all([
    loadLiquidationWarning(userId, database),
    database
      .select()
      .from(tradeLiquidationWarnings)
      .where(
        and(
          eq(tradeLiquidationWarnings.userId, userId),
          eq(tradeLiquidationWarnings.walletId, wallet.id)
        )
      ),
  ])

  // This runs on every poll, for every live wallet. The usual pass has
  // nothing to write, and it must cost nothing then: rows are only deleted
  // or updated when a row that needs it is actually there.
  const staleKeys = remembered
    .filter((row) => !openKeys.has(row.marketKey))
    .map((row) => row.marketKey)
  if (staleKeys.length > 0) {
    await database
      .delete(tradeLiquidationWarnings)
      .where(
        and(
          eq(tradeLiquidationWarnings.userId, userId),
          eq(tradeLiquidationWarnings.walletId, wallet.id),
          inArray(tradeLiquidationWarnings.marketKey, staleKeys)
        )
      )
  }

  if (warning.usd === null && warning.pct === null) {
    if (remembered.length > staleKeys.length) {
      await database
        .delete(tradeLiquidationWarnings)
        .where(
          and(
            eq(tradeLiquidationWarnings.userId, userId),
            eq(tradeLiquidationWarnings.walletId, wallet.id)
          )
        )
    }
    return
  }

  const byMarket = new Map(remembered.map((row) => [row.marketKey, row]))
  // Positions that have moved back out of the warning band: one update for
  // all of them, and only for the ones whose row still says "warned".
  const clearedKeys: string[] = []
  const inside: {
    position: TradePosition
    mark: number
    distance: NonNullable<ReturnType<typeof liquidationDistance>>
  }[] = []
  for (const position of positions) {
    const mark = marks.get(position.marketKey)
    if (mark === undefined) continue
    const distance = liquidationDistance(position, mark)
    if (!distance) continue
    if (isInsideLiquidationWarning(distance, warning)) {
      inside.push({ position, mark, distance })
      continue
    }
    const row = byMarket.get(position.marketKey)
    if (row && row.clearedAt === null) clearedKeys.push(position.marketKey)
  }
  if (clearedKeys.length > 0) {
    await database
      .update(tradeLiquidationWarnings)
      .set({ clearedAt: checkedAt })
      .where(
        and(
          eq(tradeLiquidationWarnings.userId, userId),
          eq(tradeLiquidationWarnings.walletId, wallet.id),
          inArray(tradeLiquidationWarnings.marketKey, clearedKeys),
          isNull(tradeLiquidationWarnings.clearedAt)
        )
      )
  }

  for (const { position, mark, distance } of inside) {
    const keyWhere = and(
      eq(tradeLiquidationWarnings.userId, userId),
      eq(tradeLiquidationWarnings.walletId, wallet.id),
      eq(tradeLiquidationWarnings.marketKey, position.marketKey)
    )
    const existing = byMarket.get(position.marketKey)
    // A row already warned and not yet cleared has nothing to claim; the
    // transaction below would only confirm that with a round trip.
    if (existing && existing.clearedAt === null) continue
    await database.transaction(async (tx) => {
      const claimed = existing
        ? await tx
            .update(tradeLiquidationWarnings)
            .set({ warnedAt: checkedAt, clearedAt: null })
            .where(and(keyWhere, isNotNull(tradeLiquidationWarnings.clearedAt)))
            .returning({ marketKey: tradeLiquidationWarnings.marketKey })
        : await tx
            .insert(tradeLiquidationWarnings)
            .values({
              userId,
              walletId: wallet.id,
              marketKey: position.marketKey,
              warnedAt: checkedAt,
            })
            .onConflictDoNothing()
            .returning({ marketKey: tradeLiquidationWarnings.marketKey })
      if (!claimed.length) return

      const venue = `${protocolLabel(wallet.protocol)} ${wallet.network === "mainnet" ? "main" : "test"}`
      const words = `${marketSymbol(position.marketKey)} on ${venue} is ${formatAway(distance.fraction)} from liquidation at ${formatUsd(distance.liquidationPx)}. Price is ${formatUsd(mark)}.`
      await writeTradeNotice({
        userId,
        href: marketChartHref(position.marketKey),
        title: words,
        body: "The exchange liquidates the account at this price.",
        level: "critical",
        createdAt: checkedAt,
        database: tx,
      })
    })
  }
}
