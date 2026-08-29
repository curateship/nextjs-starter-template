import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import {
  DEFAULT_GRID_ABOVE_PCT,
  DEFAULT_GRID_BELOW_PCT,
  gridEndAfterRangeMove,
  gridRangeMovable,
  gridStopPx,
  type GridPlan,
  type GridStop,
} from "@/lib/trade/grid"
import { gridLadderPairingRefusal } from "@/lib/trade/pairing"
import { defaultPaperCosts } from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { accountOf, getProtocol, ordersOf } from "@/server/protocols/registry"
import {
  draftGridOrder,
  gridById,
  movedGrid,
  saveGridPlan,
  type MovedGrid,
  type PlaceGridInput,
  type PlacedGrid,
} from "@/server/trade/grid-orders"
import { rollbackLiveOrder, setLiveBrackets } from "@/server/trade/live-orders"
import { reconcileLiveLaddersOnce } from "@/server/trade/live-smart-orders"
import { serializeLiveWallet } from "@/server/trade/live-wallet-queue"
import { marketRules } from "@/server/trade/market-rules"
import {
  cancelGridLevelPlan,
  cancelGridRestPlan,
  moveGridExitPlan,
  setGridFollowPlan,
  updateGridEndPlan,
  updateGridStopPlan,
} from "@/server/trade/smart-order-actions"
import { tradeSmartLadders, tradeWallets } from "@/server/trade/schema"
import {
  assertSmartOrderPlacable,
  pairedLadderPlan,
} from "@/server/trade/smart-pairing"
import { walletCredential } from "@/server/trade/wallet-auth"

// ----- The grid's live half ------------------------------------------------

/**
 * A current price needed to change an existing live grid.
 *
 * Changing levels, money or End Grid changes what the engine may trade next,
 * so this read uses the requests kept back for order work. A refused read must
 * also say that the requested change was not saved. The placement wording is
 * wrong here because the grid already exists and keeps running.
 */
async function liveGridAdjustmentMark(
  protocol: ReturnType<typeof getProtocol>,
  wallet: TradeWallet,
  marketId: string
): Promise<number> {
  let prices: Map<string, number>
  try {
    prices = await protocol.markets.prices(wallet.network, [marketId], {
      forOrder: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("EXCHANGE_BUSY")) {
      throw new Error("SMART_GRID_ADJUST_BUSY")
    }
    throw error
  }

  const mark = prices.get(marketId)
  if (mark !== undefined && mark > 0) return mark
  if (
    protocol.markets.pricesWereRationed?.(wallet.network, marketId) ??
    false
  ) {
    throw new Error("SMART_GRID_ADJUST_BUSY")
  }
  throw new Error("SMART_GRID_ADJUST_NO_PRICE")
}

/** Places the live exchange half of a grid order atomically. */
export async function placeLiveGridOrder(
  userId: string,
  wallet: TradeWallet,
  input: PlaceGridInput
): Promise<PlacedGrid> {
  return await serializeLiveWallet(userId, wallet, () =>
    placeLiveGridOrderOnce(userId, wallet, input)
  )
}

async function placeLiveGridOrderOnce(
  userId: string,
  wallet: TradeWallet,
  input: PlaceGridInput
): Promise<PlacedGrid> {
  if (wallet.kind !== "live" || !wallet.address || !wallet.hasKey) {
    throw new Error("LIVE_WALLET_KEY")
  }
  const ref = parseMarketKey(input.marketKey)
  if (
    !ref ||
    ref.protocol !== wallet.protocol ||
    ref.network !== wallet.network
  ) {
    throw new Error("LIVE_MARKET")
  }
  // Coarse first, for a fast refusal — the full pairing rules run again
  // inside the write once the grid and its stop are drawn.
  await assertSmartOrderPlacable(userId, wallet, input.marketKey, {
    kind: "grid",
  })

  const protocol = getProtocol(wallet.protocol)
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("LIVE_MARKET")
  const mark = (
    await protocol.markets.prices(wallet.network, [ref.marketId], {
      forOrder: true,
    })
  ).get(ref.marketId)
  if (mark === undefined || !(mark > 0)) {
    // Two different things arrive here as the same silence. "The exchange is
    // rationing us" clears on its own and is nobody's fault; "this market has
    // no price" is permanent and worth looking at. Saying the second when it
    // was the first sent somebody hunting for a delisted coin that was
    // trading perfectly well.
    throw new Error(
      (protocol.markets.pricesWereRationed?.(wallet.network, ref.marketId) ??
        false)
        ? "EXCHANGE_BUSY"
        : "LIVE_NO_PRICE"
    )
  }

  const credential = await walletCredential(userId, wallet.id)
  const [account, portfolio] = await Promise.all([
    accountOf(protocol).fetch(wallet.network, wallet.address, credential),
    ordersOf(protocol).portfolio(wallet.network, wallet.address, credential),
  ])
  const held = portfolio.positions.find((one) => one.marketId === ref.marketId)

  // Through the SAME draft the practice wallet uses. The ladder's live path
  // re-implements its draft by hand and has drifted from it — a hardcoded order
  // cap among other things — and there is no reason to repeat that here.
  const now = Date.now()
  const id = randomUUID()
  const { plan, levels, totalCost } = draftGridOrder({
    marketKey: input.marketKey,
    params: input.params,
    topPx: input.topPx,
    bottomPx: input.bottomPx,
    mark,
    rules,
    roundPx: (px: number) =>
      protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick),
    equity: input.params.compound ? account.equity : wallet.startingBalance,
    takerFeeRate: defaultPaperCosts().takerFeeRate,
    startedAt: now,
    held: held ? { szi: held.szi, leverage: held.leverage } : null,
  })

  const accepted: string[] = []
  try {
    // **Nothing at all is sent here.** A grid's levels are prices it WATCHES,
    // and the engine buys when one is actually reached, at that level's own
    // price. This used to send one market buy covering every level above the
    // price, which is the lump the whole order type exists to avoid.
    const stamp = new Date(now)
    await db.transaction(async (tx) => {
      await tx
        .select({ id: tradeWallets.id })
        .from(tradeWallets)
        .where(
          and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
        )
        .for("update")
      // Under the lock, with the grid's stop drawn — the full pairing rules
      // run here.
      await assertSmartOrderPlacable(
        userId,
        wallet,
        input.marketKey,
        { kind: "grid", plan },
        tx
      )
      await tx.insert(tradeSmartLadders).values({
        userId,
        id,
        walletId: wallet.id,
        marketKey: input.marketKey,
        kind: "grid",
        status: "active",
        plan,
        createdAt: stamp,
        updatedAt: stamp,
      })
    })
  } catch (error) {
    const failures: unknown[] = []
    for (const orderId of accepted.reverse()) {
      await rollbackLiveOrder(userId, {
        walletId: wallet.id,
        marketKey: input.marketKey,
        orderId,
      }).catch((rollbackError) => failures.push(rollbackError))
    }
    if (failures.length > 0) throw new Error("LIVE_SMART_ROLLBACK_FAILED")
    throw error
  }

  // The grid itself travels back, so the chart draws it in the same frame the
  // window closes. See `PlacedGrid`.
  return {
    levels: levels.length,
    totalCost,
    grid: {
      id,
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "grid" as const,
      status: "active" as const,
      flowRunId: null,
      createdAt: now,
      updatedAt: now,
      plan,
    },
  }
}

/** Calling off one waiting level of a live grid. */
export async function cancelLiveGridLevel(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; levelIndex: number }
): Promise<void> {
  await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    cancelGridLevelPlan(grid.plan, input.levelIndex)
    await saveGridPlan(userId, grid.id, grid.plan, "active")
  })
}

/** Stop a live grid buying: every waiting level is called off. */
export async function cancelLiveGridRest(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string }
): Promise<{ cancelled: number }> {
  return await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const cancelled = cancelGridRestPlan(grid.plan)
    await saveGridPlan(userId, grid.id, grid.plan, "active")
    return { cancelled }
  })
}

/** Switching following on or off for a live grid. See `setGridFollow`. */
export async function setLiveGridFollow(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; follow: boolean; followDown?: boolean }
): Promise<void> {
  await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    setGridFollowPlan(grid.plan, input)
    await saveGridPlan(userId, grid.id, grid.plan, "active")
  })
}

/** Switch End Grid on or off on a live grid. See `updateGridEnd`. */
export async function updateLiveGridEnd(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; abovePct: number | null }
): Promise<MovedGrid> {
  return await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const plan = grid.plan

    let mark: number | null = null
    if (input.abovePct !== null) {
      const ref = parseMarketKey(grid.marketKey)
      if (!ref) throw new Error("LIVE_MARKET")
      const protocol = getProtocol(wallet.protocol)
      mark = await liveGridAdjustmentMark(protocol, wallet, ref.marketId)
    }
    const protocol = getProtocol(wallet.protocol)
    updateGridEndPlan(plan, input.abovePct, mark, (px) =>
      protocol.markets.roundPx(px, plan.sizeDecimals, plan.priceTick)
    )

    const at = Date.now()
    await saveGridPlan(userId, grid.id, plan, "active", at)
    return movedGrid(wallet.id, grid, plan, at)
  })
}

/**
 * Coins held in this market on the exchange right now, or zero.
 *
 * A grid holds nothing for most of its life. Between one cycle and the next
 * every level is waiting and the position is closed, and that is the ordinary
 * state, not a broken one. The stop a grid carries is then a PLAN for later
 * rather than protection on something open.
 *
 * `setLiveBrackets` refuses outright when there is no position, so asking it
 * anyway did not merely waste a call: it threw `LIVE_POSITION_GONE`, the drag
 * was rejected, the stop the hand had just moved was never saved, and a
 * "refused" row went into the Journal for something nobody had done wrong. The
 * paper path has always checked for a position first; this is the live path
 * catching up.
 */
async function heldOnExchange(
  userId: string,
  wallet: TradeWallet,
  marketKey: string
): Promise<number> {
  const ref = parseMarketKey(marketKey)
  if (!ref) return 0
  const protocol = getProtocol(wallet.protocol)
  const portfolio = await ordersOf(protocol).portfolio(
    wallet.network,
    wallet.address as string,
    await walletCredential(userId, wallet.id)
  )
  return (
    portfolio.positions.find((one) => one.marketId === ref.marketId)?.szi ?? 0
  )
}

/**
 * Moves a paired grid's own stop order to a new price, keeping its size,
 * and records what now stands. No stop on the exchange yet — the grid is
 * flat — means nothing to move: the engine places one the moment a level
 * buys, at the price the plan now says.
 */
async function movePairedGridStop(
  userId: string,
  walletId: string,
  marketKey: string,
  plan: GridPlan,
  px: number
): Promise<void> {
  if (!plan.pairedStop) return
  const placed = await setLiveBrackets(userId, {
    walletId,
    marketKey,
    targets: [],
    slPx: px,
    slSz: plan.pairedStop.sz,
    replaceOrderIds: [plan.pairedStop.orderId],
  })
  plan.pairedStop = placed.slOrderId
    ? {
        orderId: placed.slOrderId,
        px,
        sz: plan.pairedStop.sz,
        placedAt: Date.now(),
      }
    : null
}

/** Changing a live grid's stop. */
export async function updateLiveGridStop(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; stopLoss: GridStop }
): Promise<void> {
  await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const protocol = getProtocol(wallet.protocol)
    const plan = grid.plan

    // The follow that walks INTO the loss freezes the stop where it stands:
    // following down on a buying grid, following up on a selling one.
    updateGridStopPlan(plan, input.stopLoss)

    // While a ladder shares the coin, the stop is the handoff line: it must
    // exist and sit above the ladder's first buy, or the pairing's whole
    // safety ordering is gone. Checked before anything reaches the exchange.
    const ladder = await pairedLadderPlan(userId, wallet.id, grid.marketKey)
    if (ladder) {
      const refusal = gridLadderPairingRefusal({
        walletKind: wallet.kind,
        protocol: wallet.protocol,
        grid: plan,
        ladder,
      })
      if (refusal) throw new Error(refusal)
    }

    const wanted = gridStopPx(plan)
    const slPx =
      wanted === null
        ? null
        : protocol.markets.roundPx(wanted, plan.sizeDecimals, plan.priceTick)
    if (protocol.capabilities.gridStop === "watched") {
      // The price stays in the plan. Nothing is placed on Lighter.
      plan.aimedSlPx = null
    } else if (ladder) {
      // Paired, the grid's stop is its own order — the position's stop
      // belongs to the ladder and is not touched.
      plan.aimedSlPx = null
      if (slPx !== null) {
        await movePairedGridStop(userId, wallet.id, grid.marketKey, plan, slPx)
      }
    } else if ((await heldOnExchange(userId, wallet, grid.marketKey)) > 0) {
      // Only onto the exchange when there is something to protect. Flat, the
      // plan is the whole record, and `advanceGrid` writes the stop onto the
      // position the moment a level buys.
      await setLiveBrackets(userId, {
        walletId: wallet.id,
        marketKey: grid.marketKey,
        // A grid never writes a target: its exits are its resting sells.
        targets: [],
        slPx,
      })
      plan.aimedSlPx = slPx
    } else {
      // Nothing was written, so nothing is remembered as written. Claiming
      // otherwise would make the next pass read a stop it never wrote as one a
      // hand had moved, and leave it alone for good.
      plan.aimedSlPx = null
    }
    await saveGridPlan(userId, grid.id, plan, "active")
  })
}

/** Re-shaping a live grid — see `reshapeGrid` for what it does and why. */
export async function reshapeLiveGrid(
  userId: string,
  wallet: TradeWallet,
  input: {
    gridId: string
    topPx?: number
    bottomPx?: number
    levels?: number
    potPct?: number
    leverage?: number
  }
): Promise<MovedGrid> {
  return await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const plan = grid.plan
    if (!gridRangeMovable(plan)) throw new Error("SMART_GRID_STARTED")

    const ref = parseMarketKey(grid.marketKey)
    if (!ref) throw new Error("LIVE_MARKET")
    const protocol = getProtocol(wallet.protocol)
    const rules = await marketRules(
      wallet.protocol,
      wallet.network,
      ref.marketId
    )
    if (!rules) throw new Error("LIVE_MARKET")
    const mark = await liveGridAdjustmentMark(protocol, wallet, ref.marketId)
    const roundPx = (px: number) =>
      protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick)

    const credential = await walletCredential(userId, wallet.id)
    const [account, portfolio] = await Promise.all([
      accountOf(protocol).fetch(
        wallet.network,
        wallet.address as string,
        credential
      ),
      ordersOf(protocol).portfolio(
        wallet.network,
        wallet.address as string,
        credential
      ),
    ])
    // Drawn and fully checked BEFORE a single order is cancelled, so a refused
    // move leaves the grid resting exactly where it was.
    const draft = draftGridOrder({
      marketKey: grid.marketKey,
      params: {
        // Frozen at placement — a re-shape redraws prices, never the side.
        direction: plan.direction,
        levels: input.levels ?? plan.levels.length,
        potPct: input.potPct ?? plan.potPct,
        compound: true,
        leverage: input.leverage ?? plan.leverage,
        maxOrderVolPct: plan.maxOrderVolPct,
        spacing: plan.spacing,
        sizing: plan.sizing,
        follow: plan.follow,
        followDown: plan.followDown,
        // Only read when the window pre-fills; a re-shape has its own prices.
        anchor: "price",
        abovePct: DEFAULT_GRID_ABOVE_PCT,
        rangePct: DEFAULT_GRID_BELOW_PCT,
        baseDetection: plan.baseDetection,
        stopLoss: plan.stopLoss
          ? { underPct: plan.stopLoss.underPct, base: plan.stopLoss.base }
          : null,
        takeProfitPct: null,
      },
      topPx: input.topPx ?? plan.topPx,
      bottomPx: input.bottomPx ?? plan.bottomPx,
      mark,
      rules,
      roundPx,
      equity: account.equity,
      takerFeeRate: defaultPaperCosts().takerFeeRate,
      startedAt: plan.startedAt,
      held: (() => {
        const position = portfolio.positions.find(
          (one) => one.marketId === ref.marketId
        )
        return position
          ? { szi: position.szi, leverage: position.leverage }
          : null
      })(),
    })

    // No orders to cancel, none to place, and no position to settle: every
    // redrawn level starts waiting and owns nothing, and `gridRangeMovable`
    // refused this while anything was held.
    const next = {
      ...draft.plan,
      stopLoss: plan.stopLoss,
      takeProfitPx: (() => {
        const px = gridEndAfterRangeMove(plan, draft.plan, mark)
        return px === null ? null : roundPx(px)
      })(),
      takeProfitPct: plan.takeProfitPct,
      baseWatch: plan.baseWatch,
      aimedSlPx: plan.aimedSlPx,
      pairedStop: plan.pairedStop,
      seenFillsTo: plan.seenFillsTo,
      // A move re-prices the levels; it does not reset the grid's history.
      cycles: plan.cycles,
      shifts: plan.shifts,
      downShifts: plan.downShifts,
      carriedLevels: plan.carriedLevels,
    }
    // A percent-mode stop rides the bottom of the range, so moving the range
    // moves the stop — and while a ladder shares the coin the stop may not
    // come down to the ladder's first buy. Checked on the redrawn plan
    // before anything is saved.
    const ladder = await pairedLadderPlan(userId, wallet.id, grid.marketKey)
    if (ladder) {
      const refusal = gridLadderPairingRefusal({
        walletKind: wallet.kind,
        protocol: wallet.protocol,
        grid: next,
        ladder,
      })
      if (refusal) throw new Error(refusal)
    }
    const at = Date.now()
    await saveGridPlan(userId, grid.id, next, "active", at)
    return movedGrid(wallet.id, grid, next, at)
  })
}

/** Dragging a live grid's take profit or stop loss — see `moveGridExit`. */
export async function moveLiveGridExit(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; which: "takeProfit" | "stopLoss"; px: number }
): Promise<MovedGrid> {
  return await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const plan = grid.plan
    const protocol = getProtocol(wallet.protocol)
    const { px, movedStop } = moveGridExitPlan(
      plan,
      input,
      (value) =>
        protocol.markets.roundPx(value, plan.sizeDecimals, plan.priceTick),
      "LIVE_PRICE"
    )

    if (movedStop) {
      // While a ladder shares the coin the stop is the handoff line — it
      // may move, but never to or below the ladder's first buy.
      const ladder = await pairedLadderPlan(userId, wallet.id, grid.marketKey)
      if (ladder) {
        const refusal = gridLadderPairingRefusal({
          walletKind: wallet.kind,
          protocol: wallet.protocol,
          grid: plan,
          ladder,
        })
        if (refusal) throw new Error(refusal)
        // Paired, the grid's stop is its own order; the position's stop is
        // the ladder's and stays where the ladder put it.
        plan.aimedSlPx = null
        await movePairedGridStop(userId, wallet.id, grid.marketKey, plan, px)
      } else if (protocol.capabilities.gridStop === "watched") {
        // Lighter grid stops are watched here, not sent to the exchange.
        plan.aimedSlPx = null
      } else if ((await heldOnExchange(userId, wallet, grid.marketKey)) > 0) {
        // See `updateLiveGridStop`: a grid with nothing open has no brackets
        // to set, and asking anyway threw the drag away along with the new
        // stop.
        await setLiveBrackets(userId, {
          walletId: wallet.id,
          marketKey: grid.marketKey,
          targets: [],
          slPx: px,
        })
        plan.aimedSlPx = px
      } else {
        plan.aimedSlPx = null
      }
    }

    const at = Date.now()
    await saveGridPlan(userId, grid.id, plan, "active", at)
    return movedGrid(wallet.id, grid, plan, at)
  })
}

/** Dragging an end of a live grid's range — one shape of `reshapeLiveGrid`. */
export function moveLiveGridRange(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; topPx: number; bottomPx: number }
): Promise<MovedGrid> {
  return reshapeLiveGrid(userId, wallet, input)
}
