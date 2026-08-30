import { and, desc, eq, inArray } from "drizzle-orm"

import { parseMarketKey, marketSymbol } from "@/lib/protocols/contracts"
import {
  emaGridCleanBars,
  type TradeGridSettings,
} from "@/lib/automations/nodes/trade-grid"
import { ladderHeldSz } from "@/lib/trade/dca"
import {
  EMA_GRID_HISTORY_BARS,
  emaGridPlacement,
  emaGridStance,
  type EmaGridStance,
} from "@/lib/trade/ema-grid"
import {
  exitSide,
  gridHeldSz,
  holdsEntry,
  type GridPlan,
} from "@/lib/trade/grid"
import { flowRunNoticeHref } from "@/lib/trade/notice-links"
import { readSmartPlan, type SmartGrid } from "@/lib/trade/smart-plan"
import { flowWaitCode, flowWaitWords } from "@/lib/trade/flow-waiting"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { gridById, placeGridOrder } from "@/server/trade/grid-orders"
import { placeLiveGridOrder } from "@/server/trade/live-grid-orders"
import {
  liveHeldPosition,
  placeLiveOrder,
  rollbackLiveOrder,
} from "@/server/trade/live-orders"
import { reconcileLiveLaddersOnce } from "@/server/trade/live-smart-orders"
import { serializeLiveWallet } from "@/server/trade/live-wallet-queue"
import { writeTradeNotice } from "@/server/trade/notices"
import {
  marksForKeys,
  placePaperOrder,
  settleWallet,
} from "@/server/trade/paper"
import { tradeSmartLadders, tradeWallets } from "@/server/trade/schema"
import { candleReadDue, claimCandleRead } from "@/server/trade/signal-run"
import { pairedLadderPlan } from "@/server/trade/smart-pairing"

const FOUR_HOURS_MS = 4 * 60 * 60 * 1_000

export type EmaGridPassInput = {
  userId: string
  wallet: TradeWallet
  settings: TradeGridSettings
  marketKeys: readonly string[]
  flowRunId: string
  lookedAt: Readonly<Record<string, number>>
  acted: Readonly<Record<string, number>>
  now: number
}

export type EmaGridPassOutcome =
  | { did: "nothing"; marketKey: null }
  | { did: "waiting"; marketKey: string; code: string }
  | { did: "holding"; marketKey: string }
  | { did: "closing"; marketKey: string }
  | { did: "placed"; marketKey: string; at: number }
  | {
      did: "refused"
      marketKey: string
      at: number
      code: string
      flip: boolean
    }

/** The latest grid this run wrote on one coin, active or finished. */
async function latestFlowGrid(
  input: EmaGridPassInput,
  marketKey: string,
  database: CustomShellDb
): Promise<SmartGrid | null> {
  const [row] = await database
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, input.userId),
        eq(tradeSmartLadders.walletId, input.wallet.id),
        eq(tradeSmartLadders.flowRunId, input.flowRunId),
        eq(tradeSmartLadders.marketKey, marketKey),
        eq(tradeSmartLadders.kind, "grid"),
        inArray(tradeSmartLadders.status, ["active", "done"])
      )
    )
    .orderBy(
      desc(tradeSmartLadders.updatedAt),
      desc(tradeSmartLadders.createdAt)
    )
    .limit(1)
  if (!row) return null
  const plan = readSmartPlan("grid", row.plan) as GridPlan | null
  if (!plan) throw new Error("FLOW_UNKNOWN")
  return {
    id: row.id,
    walletId: row.walletId,
    marketKey: row.marketKey,
    kind: "grid",
    status: row.status === "done" ? "done" : "active",
    flowRunId: row.flowRunId ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    plan,
  }
}

/**
 * Looks at one coin and either waits, places its first grid, or closes an
 * opposite grid. Placement after that close is deliberately left to the next
 * pass.
 */
export async function advanceEmaGridFlow(
  input: EmaGridPassInput,
  database: CustomShellDb = db
): Promise<EmaGridPassOutcome> {
  if (!candleReadDue(input.now)) return { did: "nothing", marketKey: null }
  if (input.marketKeys.length === 0) return { did: "nothing", marketKey: null }

  const marketKey = input.marketKeys.reduce((oldest, key) =>
    (input.lookedAt[key] ?? 0) < (input.lookedAt[oldest] ?? 0) ? key : oldest
  )
  const ref = parseMarketKey(marketKey)
  if (!ref) return { did: "waiting", marketKey, code: "PAPER_MARKET" }
  if (!claimCandleRead(input.now)) return { did: "nothing", marketKey: null }

  const bars = await getProtocol(input.wallet.protocol).markets.candles(
    input.wallet.network,
    ref.marketId,
    "4h",
    input.now - (EMA_GRID_HISTORY_BARS + 1) * FOUR_HOURS_MS
  )
  const closed = bars.filter(
    (candle) => candle.openTime + FOUR_HOURS_MS <= input.now
  )
  if (closed.length < EMA_GRID_HISTORY_BARS) {
    return { did: "waiting", marketKey, code: "EMA_GRID_HISTORY" }
  }

  const stance = emaGridStance(closed, {
    emaPeriod: input.settings.emaPeriod,
    cleanBars: emaGridCleanBars(input.settings),
  })
  if (stance === "none") {
    return { did: "waiting", marketKey, code: "EMA_GRID_NONE" }
  }

  const latest = await latestFlowGrid(input, marketKey, database)
  if (latest?.status === "active") {
    if (latest.plan.direction === stance) return { did: "holding", marketKey }
    await closeGridForFlip(input, latest, database)
    return { did: "closing", marketKey }
  }

  const candleAt = closed.at(-1)?.openTime ?? 0
  if (candleAt <= (input.acted[marketKey] ?? 0)) {
    return { did: "waiting", marketKey, code: "EMA_GRID_NEW_CANDLE" }
  }

  const flip = latest !== null && latest.plan.direction !== stance
  try {
    await placeFlowGrid(input, marketKey, stance)
  } catch (error) {
    const code = flowWaitCode(error)
    if (flip) await refusedFlipNotice(input, marketKey, code, database)
    return { did: "refused", marketKey, at: candleAt, code, flip }
  }
  if (flip) await completedFlipNotice(input, marketKey, stance, database)
  return { did: "placed", marketKey, at: candleAt }
}

async function placeFlowGrid(
  input: EmaGridPassInput,
  marketKey: string,
  direction: Exclude<EmaGridStance, "none">
): Promise<void> {
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error("PAPER_MARKET")
  const marks = await getProtocol(input.wallet.protocol).markets.prices(
    input.wallet.network,
    [ref.marketId],
    { forOrder: true }
  )
  const mark = marks.get(ref.marketId)
  if (mark === undefined || !(mark > 0)) {
    throw new Error(
      input.wallet.kind === "live" ? "LIVE_NO_PRICE" : "PAPER_NO_PRICE"
    )
  }
  const drafted = emaGridPlacement(input.settings, direction, mark)
  if (!drafted) throw new Error("SMART_GRID_RANGE")
  const placement = {
    marketKey,
    ...drafted,
    flowRunId: input.flowRunId,
  }
  if (input.wallet.kind === "live") {
    await placeLiveGridOrder(input.userId, input.wallet, placement)
    return
  }
  await placeGridOrder(input.userId, input.wallet, placement)
}

function endGridPlan(plan: GridPlan): void {
  for (const level of [...plan.levels, ...plan.carriedLevels]) {
    if (level.status === "waiting") level.status = "cancelled"
    level.heldSz = 0
  }
  plan.closedReason = "cancelled"
}

async function closeGridForFlip(
  input: EmaGridPassInput,
  grid: SmartGrid,
  database: CustomShellDb
): Promise<void> {
  if (input.wallet.kind === "live") {
    await serializeLiveWallet(input.userId, input.wallet, async () => {
      const current = await gridById(input.userId, input.wallet.id, grid.id)
      const heldSz = gridHeldSz(current.plan)
      const [position, pairedLadder] = await Promise.all([
        liveHeldPosition(input.userId, input.wallet.id, grid.marketKey),
        pairedLadderPlan(input.userId, input.wallet.id, grid.marketKey),
      ])
      const otherHeldSz = pairedLadder ? ladderHeldSz(pairedLadder) : 0
      const positionSz =
        position && holdsEntry(current.plan.direction, position.szi)
          ? Math.abs(position.szi)
          : 0
      // The exchange has one position for the coin. Subtract the paired DCA
      // ladder's filled rungs so a repeated pass after a server interruption
      // cannot sell those coins as if the old Grid close had never happened.
      const closeSz = Math.min(heldSz, Math.max(0, positionSz - otherHeldSz))

      // A grid sharing the coin with a DCA ladder owns a separate stop sized
      // to the grid's coins. Take that order off before selling the grid, or it
      // could fire after the grid is gone and sell the ladder's coins instead.
      if (current.plan.pairedStop) {
        const cancelled = await rollbackLiveOrder(input.userId, {
          walletId: input.wallet.id,
          marketKey: grid.marketKey,
          orderId: current.plan.pairedStop.orderId,
        })
        if (!cancelled) throw new Error("LIVE_GRID_STOP_CANCEL")
        current.plan.pairedStop = null
        await database
          .update(tradeSmartLadders)
          .set({ plan: current.plan, updatedAt: new Date(input.now) })
          .where(
            and(
              eq(tradeSmartLadders.userId, input.userId),
              eq(tradeSmartLadders.id, current.id),
              eq(tradeSmartLadders.status, "active")
            )
          )
      }

      if (closeSz > 0) {
        try {
          // The exchange has one position for the coin, and a DCA ladder may
          // own the rest of it. Sell only what this grid's levels hold.
          await placeLiveOrder(input.userId, {
            walletId: input.wallet.id,
            marketKey: grid.marketKey,
            side: exitSide(current.plan.direction),
            px: current.plan.levels[0]?.buyPx ?? 1,
            sz: closeSz,
            leverage: current.plan.leverage,
            reduceOnly: true,
            tpPx: null,
            slPx: null,
            marketOnly: true,
          })
        } catch (error) {
          // The paired stop was already confirmed cancelled. Leave its saved
          // reference clear so the live engine can put protection back while
          // this grid remains active.
          await reconcileLiveLaddersOnce(
            input.userId,
            input.wallet,
            undefined,
            true
          ).catch(() => undefined)
          throw error
        }
      }
      endGridPlan(current.plan)
      await database.transaction(async (tx) => {
        await tx
          .select({ id: tradeWallets.id })
          .from(tradeWallets)
          .where(
            and(
              eq(tradeWallets.userId, input.userId),
              eq(tradeWallets.id, input.wallet.id)
            )
          )
          .for("update")
        await tx
          .update(tradeSmartLadders)
          .set({
            plan: current.plan,
            status: "done",
            updatedAt: new Date(input.now),
          })
          .where(
            and(
              eq(tradeSmartLadders.userId, input.userId),
              eq(tradeSmartLadders.id, grid.id),
              eq(tradeSmartLadders.status, "active")
            )
          )
      })
    })
    return
  }

  const book = await settleWallet(input.userId, input.wallet)
  const current = await gridById(input.userId, input.wallet.id, grid.id)
  const marks = await marksForKeys([grid.marketKey])
  const mark = marks.get(grid.marketKey)
  if (mark === undefined || !(mark > 0)) throw new Error("PAPER_NO_PRICE")
  const position = book.positions.get(grid.marketKey) ?? null
  const heldSz = gridHeldSz(current.plan)
  if (
    heldSz > 0 &&
    position &&
    holdsEntry(current.plan.direction, position.szi)
  ) {
    await placePaperOrder(input.userId, input.wallet, {
      marketKey: grid.marketKey,
      side: exitSide(current.plan.direction),
      px: mark,
      // A hand-added position can share the paper coin too. The EMA flip owns
      // only the amount recorded on this grid's active and carried levels.
      sz: Math.min(heldSz, Math.abs(position.szi)),
      leverage: position.leverage,
      reduceOnly: true,
      tpPx: null,
      slPx: null,
    })
  }
  endGridPlan(current.plan)
  await database.transaction(async (tx) => {
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(
          eq(tradeWallets.userId, input.userId),
          eq(tradeWallets.id, input.wallet.id)
        )
      )
      .for("update")
    await tx
      .update(tradeSmartLadders)
      .set({
        plan: current.plan,
        status: "done",
        updatedAt: new Date(input.now),
      })
      .where(
        and(
          eq(tradeSmartLadders.userId, input.userId),
          eq(tradeSmartLadders.id, current.id),
          eq(tradeSmartLadders.status, "active")
        )
      )
  })
  await settleWallet(input.userId, input.wallet)
}

async function completedFlipNotice(
  input: EmaGridPassInput,
  marketKey: string,
  direction: Exclude<EmaGridStance, "none">,
  database: CustomShellDb
): Promise<void> {
  await writeTradeNotice({
    userId: input.userId,
    title: `The ${marketSymbol(marketKey)} flow grid flipped`,
    body: `The 4-hour EMA confirmed the other side. The old grid closed, and a fresh ${direction === "long" ? "buying" : "selling"} grid now works from the current price.`,
    level: "info",
    href: flowRunNoticeHref(input.flowRunId),
    database,
  }).catch(() => undefined)
}

async function refusedFlipNotice(
  input: EmaGridPassInput,
  marketKey: string,
  code: string,
  database: CustomShellDb
): Promise<void> {
  await writeTradeNotice({
    userId: input.userId,
    title: `The ${marketSymbol(marketKey)} flow grid could not flip`,
    body: `${flowWaitWords(code)}. The old grid closed as normal and nothing new was placed.`,
    level: "warning",
    href: flowRunNoticeHref(input.flowRunId),
    database,
  }).catch(() => undefined)
}
