import { and, eq, inArray, ne } from "drizzle-orm"

import { parseMarketKey, type ProtocolId } from "@/lib/protocols/contracts"
import type { LadderPlan } from "@/lib/trade/dca"
import type { GridPlan } from "@/lib/trade/grid"
import {
  gridLadderPairingRefusal,
  type PairedStopRef,
} from "@/lib/trade/pairing"
import { readSmartPlan } from "@/lib/trade/smart-plan"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { tradeSmartLadders } from "@/server/trade/schema"

/**
 * The one-per-coin rule, narrowed to allow exactly one pairing: a grid above
 * a DCA ladder, on a live wallet, on an exchange that can hold two stops.
 *
 * Every placement path calls this twice — once up front before drawing the
 * order, for a fast refusal, and once more inside the write's transaction so
 * two tabs placing at once cannot both win. The up-front call may not have
 * the new order's plan yet; the transaction call always does, and that is
 * where the ordering rule — the grid's stop above the ladder's first buy —
 * is finally enforced.
 */
export async function assertSmartOrderPlacable(
  userId: string,
  wallet: { id: string; kind: string; protocol: string },
  marketKey: string,
  placing:
    | { kind: "grid"; plan?: GridPlan }
    | { kind: "dca"; plan?: LadderPlan },
  tx: CustomShellDb = db
): Promise<void> {
  /**
   * An exchange with no order path cannot run a strategy on real money.
   *
   * Refused at the door for the same reason a watched level is: a ladder's
   * rungs send nothing until their prices arrive, so nothing would reject it
   * today, and it would sit looking like it was working until the first rung
   * was reached. Practice wallets never reach an exchange, so they are free
   * to pretend on any venue.
   */
  if (wallet.kind === "live") {
    // `wallet.protocol` is a plain string here, so the lookup may find
    // nothing rather than an entry — reading through it without the second
    // `?.` would crash instead of refusing. An id this build does not know
    // is left to the market check further in, which names it properly.
    const entry = getProtocol(wallet.protocol as ProtocolId) as
      | ReturnType<typeof getProtocol>
      | undefined
    if (entry?.capabilities?.orders === false) {
      throw new Error(`PROTOCOL_NO_ORDERS:${entry.id}`)
    }
  }
  const rows = await tx
    .select({ kind: tradeSmartLadders.kind, plan: tradeSmartLadders.plan })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, wallet.id),
        eq(tradeSmartLadders.marketKey, marketKey),
        eq(tradeSmartLadders.status, "active"),
        // A watched price is a plain order that shares this table, not a
        // strategy — it manages no position, so it neither blocks nor is
        // blocked. Before plain orders became watches they rested on the
        // book and the one-per-coin rule never saw them; becoming a row
        // here must not change what they may do.
        ne(tradeSmartLadders.kind, "watch")
      )
    )
  if (rows.length === 0) return
  // Two smart orders already share this coin — the pair is complete, and
  // nothing else may claim coins those two already own between them.
  if (rows.length > 1) throw new Error("SMART_LADDER_EXISTS")

  const existing = rows[0]
  // The only combination that pairs is a grid and a DCA ladder, one of each.
  // A second of the same kind, or anything involving a signal trade, fights
  // over the same coins and stays refused exactly as before.
  const kinds = new Set([existing.kind, placing.kind])
  if (!(kinds.has("grid") && kinds.has("dca"))) {
    throw new Error("SMART_LADDER_EXISTS")
  }

  // The standing row's plan must be readable to judge the pairing. One that
  // is not gets the old blanket refusal rather than a benefit of the doubt.
  const refusal =
    placing.kind === "grid"
      ? (() => {
          const ladder = readSmartPlan("dca", existing.plan) as
            | LadderPlan
            | null
          if (!ladder) return "SMART_LADDER_EXISTS"
          return gridLadderPairingRefusal({
            walletKind: wallet.kind,
            protocol: wallet.protocol,
            grid: placing.plan ?? null,
            ladder,
          })
        })()
      : (() => {
          const grid = readSmartPlan("grid", existing.plan) as GridPlan | null
          if (!grid) return "SMART_LADDER_EXISTS"
          return gridLadderPairingRefusal({
            walletKind: wallet.kind,
            protocol: wallet.protocol,
            grid,
            ladder: placing.plan ?? null,
          })
        })()
  if (refusal) throw new Error(refusal)
}

/**
 * The active DCA ladder sharing this grid's coin, or null when the grid runs
 * alone. What the engine and every grid edit read to know whether the grid
 * is one half of a pairing.
 */
export async function pairedLadderPlan(
  userId: string,
  walletId: string,
  marketKey: string,
  tx: CustomShellDb = db
): Promise<LadderPlan | null> {
  const rows = await tx
    .select({ plan: tradeSmartLadders.plan })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.marketKey, marketKey),
        eq(tradeSmartLadders.kind, "dca"),
        eq(tradeSmartLadders.status, "active")
      )
    )
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return readSmartPlan("dca", row.plan) as LadderPlan | null
}

/**
 * Every paired grid stop these wallets are holding, keyed by wallet and then
 * by the exchange's market id — what a portfolio read needs to hand each
 * stop back to its owner. See `reattributePairedStops`. Wallets with no
 * pairing in play contribute nothing, which is every wallet most of the
 * time.
 */
export async function pairedStopRefs(
  userId: string,
  walletIds: readonly string[],
  tx: CustomShellDb = db
): Promise<Map<string, Map<string, PairedStopRef>>> {
  const refs = new Map<string, Map<string, PairedStopRef>>()
  if (walletIds.length === 0) return refs
  const rows = await tx
    .select({
      walletId: tradeSmartLadders.walletId,
      marketKey: tradeSmartLadders.marketKey,
      kind: tradeSmartLadders.kind,
      plan: tradeSmartLadders.plan,
    })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        inArray(tradeSmartLadders.walletId, [...walletIds]),
        eq(tradeSmartLadders.status, "active"),
        inArray(tradeSmartLadders.kind, ["grid", "dca"])
      )
    )
  for (const row of rows) {
    if (row.kind !== "grid") continue
    const plan = readSmartPlan("grid", row.plan) as GridPlan | null
    if (!plan?.pairedStop) continue
    const marketId = parseMarketKey(row.marketKey)?.marketId
    if (!marketId) continue
    const ladderRow = rows.find(
      (one) =>
        one.kind === "dca" &&
        one.walletId === row.walletId &&
        one.marketKey === row.marketKey
    )
    const ladder = ladderRow
      ? (readSmartPlan("dca", ladderRow.plan) as LadderPlan | null)
      : null
    const forWallet = refs.get(row.walletId) ?? new Map<string, PairedStopRef>()
    forWallet.set(marketId, {
      orderId: plan.pairedStop.orderId,
      px: plan.pairedStop.px,
      sz: plan.pairedStop.sz,
      ladderAimedSlPx: ladder?.aimedSlPx ?? null,
    })
    refs.set(row.walletId, forWallet)
  }
  return refs
}
