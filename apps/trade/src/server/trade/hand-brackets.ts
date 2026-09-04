import { and, eq } from "drizzle-orm"

import type { GridPlan } from "@/lib/trade/grid"
import type { LadderPlan } from "@/lib/trade/dca"
import { readSmartPlan } from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import { getProtocol } from "@/server/protocols/registry"
import { db } from "@/server/db"
import { serializeLiveWallet } from "@/server/trade/live-wallet-queue"
import { setLiveBrackets } from "@/server/trade/live-orders"
import { tradeSmartLadders } from "@/server/trade/schema"
import { saveLadderPlan } from "@/server/trade/smart-orders"
import { nearNullable } from "@/server/trade/smart-engine"

/**
 * Setting a position's stop and targets by hand — the drag on the chart, the ×
 * on a pill, the take-profit window.
 *
 * **Why this is not just `setLiveBrackets`.** A coin worked by a grid or a
 * ladder has a plan that says where its stop belongs, and the engine puts the
 * stop back whenever the exchange disagrees with that plan. The drag used to
 * write the exchange and tell the plan nothing, so the engine found a price it
 * had not written and had to work out what had happened by comparing its last
 * reading with this one. That guess is wrong whenever the reading is a few
 * seconds old, and on the live server it usually is: the engine runs in its own
 * container, holds a wallet's answer for five seconds, and never hears about a
 * drag made on the website.
 *
 * What it cost, measured on the real account on 3 Sep 2026: every stop dragged
 * on kSHIB, TAO and HYPE was cancelled five to six seconds later and the grid's
 * own price re-placed. Four times in one evening, and the fourth is still on
 * the exchange.
 *
 * So the hand writes both. The exchange gets the order, and the plan gets the
 * price, in that order and in one call. From then on the plan and the exchange
 * already agree, and there is nothing for the engine to put back.
 */
export async function setBracketsByHand(
  userId: string,
  wallet: TradeWallet,
  input: {
    walletId: string
    marketKey: string
    targets: Array<{ px: number; sz: number | null }>
    slPx: number | null
  }
): Promise<void> {
  await serializeLiveWallet(userId, wallet, async () => {
    await setLiveBrackets(userId, input)
    await recordHandProtection(userId, wallet, input)
  })
}

/**
 * Writes what the hand just set onto every smart order working this coin.
 *
 * **Never before the exchange has taken it.** A plan that recorded a stop the
 * venue refused would leave the engine believing a price that is not there, and
 * a refused drag already throws before this runs.
 *
 * A failure here is logged and swallowed. The stop is on the exchange either
 * way, and a database write that did not land must not read back to the person
 * dragging as a stop that did not move.
 */
async function recordHandProtection(
  userId: string,
  wallet: TradeWallet,
  input: {
    marketKey: string
    targets: Array<{ px: number; sz: number | null }>
    slPx: number | null
  }
): Promise<void> {
  try {
    const rows = await db
      .select({
        id: tradeSmartLadders.id,
        kind: tradeSmartLadders.kind,
        plan: tradeSmartLadders.plan,
      })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          eq(tradeSmartLadders.walletId, wallet.id),
          eq(tradeSmartLadders.marketKey, input.marketKey),
          eq(tradeSmartLadders.status, "active")
        )
      )
    if (rows.length === 0) return

    // A ladder sharing the coin owns the position's one stop; the grid above it
    // owns a separate order of its own and must not read this drag as its own
    // stop moving. See `grid-above-ladder.md`.
    const paired = rows.some((row) => row.kind === "dca")
    const at = Date.now()
    const tpPx = input.targets[0]?.px ?? null

    for (const row of rows) {
      if (row.kind === "dca") {
        const plan = readSmartPlan("dca", row.plan) as LadderPlan | null
        if (!plan) continue
        aimLadderByHand(plan, input.slPx, tpPx)
        plan.handSetAt = at
        await saveLadderPlan(userId, row.id, plan, "active")
        continue
      }
      if (row.kind === "grid") {
        const plan = readSmartPlan("grid", row.plan) as GridPlan | null
        if (!plan) continue
        if (!paired && gridStopsLiveOnTheExchange(wallet)) {
          aimGridByHand(plan, input.slPx)
        }
        plan.handSetAt = at
        await saveLadderPlan(userId, row.id, plan, "active")
      }
    }
  } catch (error) {
    console.error(
      `Could not record a hand-set stop on ${input.marketKey}`,
      error
    )
  }
}

/** Whether this venue keeps a grid's stop as a real order rather than a watched price. */
function gridStopsLiveOnTheExchange(wallet: TradeWallet): boolean {
  return getProtocol(wallet.protocol).capabilities.gridStop === "exchange"
}

/**
 * The ladder's own hand-moved rule, applied at the moment of the drag instead
 * of worked out from a later reading.
 *
 * **Only the line that actually moved is touched.** A drag sends the whole set
 * back, stop and targets together, so treating all of it as hand-set would
 * freeze a take profit that is still meant to follow the average buy price
 * every time somebody moved the stop. Each side is compared with what the
 * ladder last aimed there, which is the same comparison `aimBrackets` makes —
 * the difference is that this one is made against a reading that cannot be
 * stale, because the exchange has just been told.
 *
 * Every other line here is what `aimBrackets` in `smart-ladders.ts` would have
 * done with a perfectly fresh reading, including which modes it refuses to
 * freeze: a ladder selling back up its own rungs has no single target to move,
 * so a dragged target leaves those modes alone.
 */
function aimLadderByHand(
  plan: LadderPlan,
  slPx: number | null,
  tpPx: number | null
): void {
  const tp = plan.takeProfit
  if (
    tp &&
    tp.mode !== "fixed" &&
    tp.mode !== "prevRung" &&
    tp.mode !== "exitLadder" &&
    !nearNullable(plan.aimedTpPx, tpPx)
  ) {
    tp.mode = "fixed"
    tp.pct = null
    plan.aimedTpPx = tpPx
  }

  const sl = plan.stopLoss
  if (sl && sl.mode === "percent" && !nearNullable(plan.aimedSlPx, slPx)) {
    // A ladder's stop is optional, so clearing it by hand is a choice it keeps
    // — the same answer `aimStop` gives a ladder, which passes `"honour"`.
    if (slPx !== null) {
      sl.mode = "fixed"
      sl.pct = null
    }
    plan.aimedSlPx = slPx
  }
}

/**
 * The grid's own hand-moved rule, applied at the moment of the drag.
 *
 * **A hand may move a grid's stop; it cannot take it away.** Only a real price
 * is written down, so a grid whose stop is pulled off keeps the price it had
 * and puts the stop back on the next pass — which is what `aimStop` does for a
 * grid, and why it is given `"replace"` rather than `"honour"`.
 *
 * A stop that is already where the grid put it is not a hand move at all. A
 * drag on the take-profit line sends the stop back unchanged beside it, and
 * freezing the grid's stop on the strength of that would stop it following the
 * range for a move nobody made.
 */
function aimGridByHand(plan: GridPlan, slPx: number | null): void {
  if (nearNullable(plan.aimedSlPx, slPx)) return
  if (plan.stopLoss && slPx !== null && slPx > 0) {
    plan.stopLoss.mode = "fixed"
    plan.stopLoss.px = slPx
    plan.aimedSlPx = slPx
    return
  }
  plan.aimedSlPx = null
}
