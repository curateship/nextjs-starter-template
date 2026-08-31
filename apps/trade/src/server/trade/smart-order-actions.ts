import type { DcaParams, LadderPlan } from "@/lib/trade/dca"
import { exitLadderGapPctForPrice, ladderBaseStopOf } from "@/lib/trade/dca"
import {
  gridEndPx,
  gridStopBeyond,
  gridStopPx,
  lossEdge,
  reachedExit,
  readyWhen,
  winEdge,
  type GridPlan,
  type GridStop,
} from "@/lib/trade/grid"

/** The plan changes shared by practice and live smart-order actions. */

export function cancelGridLevelPlan(plan: GridPlan, levelIndex: number): void {
  const level = plan.levels[levelIndex]
  if (!level || level.status !== "waiting") {
    throw new Error("SMART_GRID_LEVEL_DONE")
  }
  level.status = "cancelled"
}

export function cancelGridRestPlan(plan: GridPlan): number {
  let cancelled = 0
  for (const level of plan.levels) {
    if (level.status !== "waiting") continue
    level.status = "cancelled"
    cancelled += 1
  }
  return cancelled
}

export function updateGridStopPlan(
  plan: GridPlan,
  stopLoss: GridStop,
  /** The reverse-when-stopped switch, when the window sent it. */
  reverseWhenStopped?: boolean
): void {
  if (reverseWhenStopped !== undefined) {
    plan.reverseWhenStopped = reverseWhenStopped
  }
  const followsIntoLoss =
    plan.direction === "long" ? plan.followDown : plan.follow
  plan.stopLoss = {
    mode: followsIntoLoss ? "fixed" : "percent",
    underPct: stopLoss.underPct,
    px: followsIntoLoss
      ? gridStopBeyond(plan.direction, plan, stopLoss.underPct)
      : null,
    base: stopLoss.base,
  }
}

export function setGridFollowPlan(
  plan: GridPlan,
  input: { follow: boolean; followDown?: boolean }
): void {
  const turnsIntoLossOn =
    plan.direction === "long"
      ? input.followDown === true && !plan.followDown
      : input.follow && !plan.follow
  if (turnsIntoLossOn && plan.stopLoss?.mode === "percent") {
    plan.stopLoss = { ...plan.stopLoss, mode: "fixed", px: gridStopPx(plan) }
  }
  plan.follow = input.follow
  if (input.followDown !== undefined) plan.followDown = input.followDown

  const turnsAwayOn =
    plan.direction === "long" ? input.follow : input.followDown === true
  if (turnsAwayOn) plan.entered = true
}

export function updateGridEndPlan(
  plan: GridPlan,
  abovePct: number | null,
  mark: number | null,
  roundPx: (px: number) => number
): void {
  if (abovePct === null) {
    plan.takeProfitPx = null
    plan.takeProfitPct = null
    return
  }
  if (mark === null || !(mark > 0)) throw new Error("PAPER_NO_PRICE")
  const target = roundPx(gridEndPx(plan.direction, plan, mark, abovePct))
  if (!readyWhen(plan.direction, target, winEdge(plan.direction, plan))) {
    throw new Error("SMART_GRID_TARGET_IN_RANGE")
  }
  if (reachedExit(plan.direction, mark, target)) {
    throw new Error("SMART_GRID_TARGET_PASSED")
  }
  plan.takeProfitPx = target
  plan.takeProfitPct = abovePct
}

export function moveGridExitPlan(
  plan: GridPlan,
  input: { which: "takeProfit" | "stopLoss"; px: number },
  roundPx: (px: number) => number,
  invalidPrice: string
): { px: number; movedStop: boolean } {
  const px = roundPx(input.px)
  if (!(px > 0)) throw new Error(invalidPrice)
  if (input.which === "takeProfit") {
    if (!readyWhen(plan.direction, px, winEdge(plan.direction, plan))) {
      throw new Error("SMART_GRID_TARGET_IN_RANGE")
    }
    plan.takeProfitPx = px
    plan.takeProfitPct = undefined
    return { px, movedStop: false }
  }

  if (!readyWhen(plan.direction, lossEdge(plan.direction, plan), px)) {
    throw new Error("SMART_GRID_STOP_IN_RANGE")
  }
  plan.stopLoss = {
    mode: "fixed",
    underPct: plan.stopLoss?.underPct ?? 0,
    px,
    base: null,
  }
  return { px, movedStop: true }
}

export function cancelLadderRungPlan(
  plan: LadderPlan,
  rungIndex: number
): string | null {
  const rung = plan.rungs[rungIndex]
  if (!rung || rung.status !== "waiting") throw new Error("SMART_RUNG_DONE")
  const orderId = rung.orderId
  rung.status = "cancelled"
  rung.orderId = null
  return orderId
}

export async function cancelLadderRestPlan(
  plan: LadderPlan,
  cancelOrder: (orderId: string) => Promise<void>
): Promise<{ cancelled: number }> {
  let cancelled = 0
  for (const [index, rung] of plan.rungs.entries()) {
    if (rung.status !== "waiting") continue
    if (rung.orderId) await cancelOrder(rung.orderId)
    cancelLadderRungPlan(plan, index)
    cancelled += 1
  }
  return { cancelled }
}

export async function updateLadderExitsPlan(
  plan: LadderPlan,
  input: {
    takeProfit: DcaParams["takeProfit"]
    stopLoss: DcaParams["stopLoss"]
  },
  cancelSell: (orderId: string) => Promise<void>
): Promise<void> {
  if (
    plan.takeProfit?.mode === "prevRung" &&
    input.takeProfit?.mode !== "prevRung"
  ) {
    for (const rung of plan.rungs) {
      if (!rung.sellOrderId) continue
      await cancelSell(rung.sellOrderId)
      rung.sellOrderId = null
    }
  }
  const wasExitLadder = plan.takeProfit?.mode === "exitLadder"
  const staysExitLadder = input.takeProfit?.mode === "exitLadder"
  const nextExitGapPct = input.takeProfit?.exitGapPct ?? 0
  const exitGapChanged =
    wasExitLadder &&
    staysExitLadder &&
    Math.abs((plan.takeProfit?.exitGapPct ?? 0) - nextExitGapPct) > 1e-9
  if (wasExitLadder && (!staysExitLadder || exitGapChanged)) {
    await cancelExitLadderOrders(plan, cancelSell)
    if (!staysExitLadder) plan.exitRungs = []
  }
  plan.takeProfit = input.takeProfit
    ? {
        mode: input.takeProfit.mode,
        pct: input.takeProfit.mode === "average" ? input.takeProfit.pct : null,
        exitGapPct: input.takeProfit.mode === "exitLadder" ? nextExitGapPct : 0,
      }
    : null
  plan.stopLoss = input.stopLoss
    ? {
        mode: "percent",
        pct: input.stopLoss.pct,
        base: ladderBaseStopOf(input.stopLoss.base),
      }
    : null
  if (!plan.stopLoss?.base) plan.reclaim = null
}

/** Move the complete mirrored exit shape after cancelling any funded sells. */
export async function moveExitLadderPlan(
  plan: LadderPlan,
  input: { exitIndex: number; exitPx: number },
  cancelSell: (orderId: string) => Promise<void>
): Promise<void> {
  if (plan.takeProfit?.mode !== "exitLadder") {
    throw new Error("SMART_EXIT_GAP")
  }
  const exitGapPct = exitLadderGapPctForPrice(
    plan,
    input.exitIndex,
    input.exitPx
  )
  if (exitGapPct === null) throw new Error("SMART_EXIT_GAP")

  await cancelExitLadderOrders(plan, cancelSell)
  plan.takeProfit.exitGapPct = exitGapPct
}

/** Cancellation finishes before the plan forgets any exchange order id. */
async function cancelExitLadderOrders(
  plan: LadderPlan,
  cancelSell: (orderId: string) => Promise<void>
): Promise<void> {
  for (const exit of plan.exitRungs) {
    if (!exit.orderId) continue
    await cancelSell(exit.orderId)
    exit.orderId = null
    exit.armedSz = 0
  }
}
