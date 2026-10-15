import { exitSide } from "@/lib/trade/grid"
import type { TradeWallet } from "@/lib/trade/wallets"
import { hasWalletPlanWrite, withWalletPlanWrite } from "@/server/trade/db"
import { gridById, saveGridPlan } from "@/server/trade/grid-orders"
import { rollbackLiveOrder } from "@/server/trade/live-orders"
import { reconcileLiveLaddersOnce } from "@/server/trade/live-smart-orders"
import { serializeLiveWallet } from "@/server/trade/live-wallet-queue"
import { settleWallet } from "@/server/trade/paper"
import {
  endGridByHandPlan,
  type GridHandedSell,
} from "@/server/trade/smart-order-actions"
import { placeWatchOrder } from "@/server/trade/smart-orders"

/**
 * What ending a grid by hand did: how many waiting levels were called off,
 * how many sells became manual orders, and how many could not, because the
 * exchange would not take an order that small.
 */
export type EndedGrid = { cancelled: number; kept: number; dropped: number }

/**
 * Ending a grid by hand, its × on the chart, for both kinds of wallet.
 *
 * **The grid is written down as done before any manual order exists.** Two
 * owners selling one coin is the thing to avoid, so the grid lets go first.
 * A sell that then fails to save leaves coin with one exit fewer, never with
 * two exits, and the answer counts it so the person is told.
 *
 * A grid whose stop rests on the exchange (Lighter's fixed-size stop, or the
 * stop of a grid paired above a ladder) has that stop taken back first. The
 * position now belongs to the person, and a stop sized to the grid's coins
 * would otherwise be left standing with nothing recording it. A stop the
 * exchange will not cancel refuses the whole action, so nothing changes.
 */
export async function endGridByHand(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string }
): Promise<EndedGrid> {
  if (wallet.kind === "live") {
    return await serializeLiveWallet(userId, wallet, async () => {
      await reconcileLiveLaddersOnce(userId, wallet)
      return await endLoaded(userId, wallet, input.gridId)
    })
  }
  if (!hasWalletPlanWrite(userId, wallet.id)) {
    return await withWalletPlanWrite(userId, wallet.id, () =>
      endGridByHand(userId, wallet, input)
    )
  }
  await settleWallet(userId, wallet)
  const ended = await endLoaded(userId, wallet, input.gridId)
  await settleWallet(userId, wallet)
  return ended
}

async function endLoaded(
  userId: string,
  wallet: TradeWallet,
  gridId: string
): Promise<EndedGrid> {
  const grid = await gridById(userId, wallet.id, gridId)
  const plan = grid.plan

  for (const orderId of [plan.fixedStopOrderId, plan.pairedStop?.orderId]) {
    if (!orderId || wallet.kind !== "live") continue
    const removed = await rollbackLiveOrder(userId, {
      walletId: wallet.id,
      marketKey: grid.marketKey,
      orderId,
      goneIsCancelled: true,
    })
    if (!removed) throw new Error("SMART_GRID_STOP_NOT_CANCELLED")
  }
  plan.fixedStopOrderId = null
  plan.pairedStop = null

  const { cancelled, sells } = endGridByHandPlan(plan)
  await saveGridPlan(userId, grid.id, plan, "done")

  let kept = 0
  for (const sell of sells) {
    if (await placeHandedSell(userId, wallet, grid.marketKey, plan, sell)) {
      kept += 1
    }
  }
  return { cancelled, kept, dropped: sells.length - kept }
}

async function placeHandedSell(
  userId: string,
  wallet: TradeWallet,
  marketKey: string,
  plan: { direction: "long" | "short"; leverage: number },
  sell: GridHandedSell
): Promise<boolean> {
  try {
    await placeWatchOrder(userId, wallet, {
      marketKey,
      side: exitSide(plan.direction),
      px: sell.px,
      sz: sell.sz,
      leverage: plan.leverage,
      reduceOnly: true,
      tpPx: null,
      slPx: null,
    })
    return true
  } catch (error) {
    console.error("[trade] a grid's sell could not become a manual order", {
      marketKey,
      px: sell.px,
      sz: sell.sz,
      error,
    })
    return false
  }
}
