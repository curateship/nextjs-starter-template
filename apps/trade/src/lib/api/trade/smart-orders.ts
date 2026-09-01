import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { CANDLE_INTERVALS, parseMarketKey } from "@/lib/protocols/contracts"
import {
  baseStopDetection,
  dcaLadderSettingsSchema,
  dcaParamsSchema,
  type DcaParams,
} from "@/lib/trade/dca"
import {
  placeGridParamsSchema,
  MAX_GRID_LEVELS,
  MIN_GRID_LEVELS,
  type GridParams,
} from "@/lib/trade/grid"
import { userGet, userPost } from "@/server/guards"
import { marketBaseInForce } from "@/server/trade/base-level"
import { tryBecomeLeaderForOnePass } from "@/server/trade/leadership"
import {
  cancelLiveGridLevel,
  cancelLiveGridRest,
  moveLiveGridExit,
  moveLiveGridRange,
  reshapeLiveGrid,
  reverseLiveGrid,
  placeLiveGridOrder,
  setLiveGridFollow,
  updateLiveGridEnd,
  updateLiveGridStop,
} from "@/server/trade/live-grid-orders"
import { reverseGridOrder as reverseGridOrderRows } from "@/server/trade/grid-reversal"
import {
  cancelLiveLadderRest,
  cancelLiveLadderRung,
  placeLiveDcaLadder,
  reconcileLiveLadders,
  reshapeLiveLadder,
  updateLiveLadderExits,
} from "@/server/trade/live-smart-orders"
import {
  cancelGridLevel as cancelGridLevelRow,
  cancelGridRest as cancelGridRestRows,
  moveGridExit as moveGridExitRows,
  moveGridRange as moveGridRangeRows,
  reshapeGrid as reshapeGridRows,
  placeGridOrder as placeGridRows,
  setGridFollow as setGridFollowRows,
  updateGridEnd as updateGridEndRows,
  updateGridStop as updateGridStopRows,
  type MovedGrid,
  type PlacedGrid,
} from "@/server/trade/grid-orders"
import {
  loadSmartDca,
  loadSmartGrid,
  saveSmartDca,
  saveSmartGrid,
} from "@/server/trade/prefs"
import { openPartClose, type PartCloseOutcome } from "@/server/trade/part-close"
import { runLiveOrderAction } from "@/server/trade/order-rate-limit"

export type { PartCloseOutcome }
import {
  flattenWallet,
  type FlattenOutcome,
} from "@/server/trade/flatten-wallet"
import {
  standDownWallet,
  type RefusedSmartOrder,
  type StoodDownSmartOrder,
} from "@/server/trade/stand-down"
import {
  cancelLadderRest as cancelRestRows,
  cancelWatchOrder as cancelWatchRow,
  editWatchOrder as editWatchRow,
  moveWatchOrder as moveWatchRow,
  cancelLadderRung as cancelRungRow,
  placeDcaLadder as placeLadderRows,
  resumeSmartOrder as resumeSmartOrderRow,
  reshapeLadder as reshapeLadderRows,
  updateLadderExits as updateExitsRows,
  type PlacedLadder,
} from "@/server/trade/smart-orders"
import {
  findTradingWallet,
  findWallet,
  listWallets,
} from "@/server/trade/wallets"

import { createErrorMessage } from "../error-message"

/**
 * Smart orders: one right-click places a whole plan, and these are the actions
 * behind them — place, call off one part, call off the rest, change the exits,
 * and remember each window's settings. Two kinds today, the DCA ladder and the
 * grid.
 *
 * Every function starts by finding the wallet the request names, scoped to
 * whoever is asking. The browser never sends a size or a rung price — the
 * server derives every number — so a wrong one cannot be sent.
 */

const marketKeySchema = z
  .string()
  .max(120)
  .refine((key) => parseMarketKey(key) !== null, { message: "PAPER_MARKET" })

const placeSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
  clickPx: z.number().positive().finite(),
  interval: z.enum(CANDLE_INTERVALS),
  params: dcaParamsSchema,
})

const rungSchema = z.object({
  walletId: z.string().max(36),
  ladderId: z.string().max(36),
  rungIndex: z.number().int().min(0).max(19),
})

const ladderSchema = z.object({
  walletId: z.string().max(36),
  ladderId: z.string().max(36),
})

const reshapeLadderSchema = ladderSchema
  .extend({
    anchorPx: z.number().positive().finite().optional(),
    deepestPx: z.number().positive().finite().optional(),
    exitIndex: z.number().int().min(0).max(19).optional(),
    exitPx: z.number().positive().finite().optional(),
    settings: dcaLadderSettingsSchema.optional(),
    greenInterval: z.enum(CANDLE_INTERVALS).optional(),
  })
  .refine(
    (input) => {
      const entryMove =
        (input.anchorPx === undefined) !== (input.deepestPx === undefined)
      const anyExitField =
        input.exitIndex !== undefined || input.exitPx !== undefined
      const exitMove =
        input.exitIndex !== undefined && input.exitPx !== undefined
      const settingsChange =
        input.settings !== undefined && input.greenInterval !== undefined
      const anySettingsField =
        input.settings !== undefined || input.greenInterval !== undefined
      return (
        Number(entryMove && !anyExitField && !anySettingsField) +
          Number(exitMove && !entryMove && !anySettingsField) +
          Number(settingsChange && !entryMove && !anyExitField) ===
        1
      )
    },
    { message: "SMART_LADDER_RANGE" }
  )

const exitsSchema = z.object({
  walletId: z.string().max(36),
  ladderId: z.string().max(36),
  takeProfit: dcaParamsSchema.shape.takeProfit,
  stopLoss: dcaParamsSchema.shape.stopLoss,
})

/** The wallet, or a refusal — the same first step as the rest of trading. */
async function tradingWallet(
  userId: string,
  walletId: string,
  receivingOrder = false
) {
  const wallet = await (receivingOrder ? findTradingWallet : findWallet)(
    userId,
    walletId
  )
  if (!wallet) throw new Error("PAPER_WALLET_NOT_FOUND")
  return wallet
}

/** Practice actions do not spend an exchange allowance. */
async function runWalletOrderAction<T>(
  userId: string,
  wallet: { kind: "live" | "paper" },
  direction: "order" | "cancel",
  action: () => Promise<T>
): Promise<T> {
  return wallet.kind === "live"
    ? await runLiveOrderAction(userId, direction, action)
    : await action()
}

/**
 * The base a ladder would hang from right now.
 *
 * The window asks before it draws anything: the rungs it previews are stepped
 * down from this, and so are the rungs the server writes, so what is shown is
 * what is placed. Null when no base has confirmed, which is a ladder that
 * cannot be placed and a window that says so.
 */
const loadLadderBaseFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ marketKey: marketKeySchema }))
  .handler(async ({ data }): Promise<{ basePx: number | null }> => {
    const ref = parseMarketKey(data.marketKey)
    if (!ref) return { basePx: null }
    return {
      // Nobody has asked for a ladder yet, so there are no ladder settings to
      // read. The indicator's own numbers are what the chart drew with, which
      // is what this preview is pointing at.
      basePx: await marketBaseInForce(
        ref.protocol,
        ref.network,
        ref.marketId,
        Date.now(),
        baseStopDetection()
      ),
    }
  })

export function loadLadderBase(
  marketKey: string
): Promise<{ basePx: number | null }> {
  return loadLadderBaseFn({ data: { marketKey } })
}

const placeDcaLadderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(placeSchema)
  .handler(async ({ data, context }): Promise<PlacedLadder> => {
    const wallet = await tradingWallet(context.user.id, data.walletId, true)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () => {
        const input = {
          marketKey: data.marketKey,
          clickPx: data.clickPx,
          interval: data.interval,
          params: data.params,
        }
        const placed =
          wallet.kind === "live"
            ? await placeLiveDcaLadder(context.user.id, wallet, input)
            : await placeLadderRows(context.user.id, wallet, input)
        // Remembered only once a ladder was really placed with them.
        await saveSmartDca(context.user.id, data.params)
        return placed
      }
    )
  })

const cancelLadderRungFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(rungSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "cancel",
      async () => {
        if (wallet.kind === "live") {
          await cancelLiveLadderRung(context.user.id, wallet, data)
        } else {
          await cancelRungRow(context.user.id, wallet, data)
        }
        return { cancelled: true }
      }
    )
  })

const cancelLadderRestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(ladderSchema)
  .handler(async ({ data, context }) => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "cancel",
      async () =>
        wallet.kind === "live"
          ? await cancelLiveLadderRest(context.user.id, wallet, data)
          : await cancelRestRows(context.user.id, wallet, data)
    )
  })

const reshapeLadderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reshapeLadderSchema)
  .handler(async ({ data, context }) => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    const input =
      data.settings !== undefined && data.greenInterval !== undefined
        ? {
            ladderId: data.ladderId,
            settings: data.settings,
            greenInterval: data.greenInterval,
          }
        : data.anchorPx !== undefined
          ? { ladderId: data.ladderId, anchorPx: data.anchorPx }
          : data.deepestPx !== undefined
            ? { ladderId: data.ladderId, deepestPx: data.deepestPx }
            : {
                ladderId: data.ladderId,
                exitIndex: data.exitIndex as number,
                exitPx: data.exitPx as number,
              }
    return wallet.kind === "live"
      ? await reshapeLiveLadder(context.user.id, wallet, input)
      : await reshapeLadderRows(context.user.id, wallet, input)
  })

const resumeSmartOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(ladderSchema)
  .handler(async ({ data, context }): Promise<{ resumed: true }> => {
    await tradingWallet(context.user.id, data.walletId)
    await resumeSmartOrderRow(context.user.id, data.walletId, data.ladderId)
    return { resumed: true }
  })

const cancelAllSmartOrdersSchema = z.object({
  walletId: z.string().max(36),
})

/**
 * Every ladder and grid on one wallet, stood down in one call.
 *
 * The loop itself is `standDownWallet`, shared with emptying a wallet so the
 * two presses can never call an order off differently. What this one adds is
 * that **a refusal stops nothing else**: four off and two refused is a real
 * answer and the caller is told which two and why, so the two that are still
 * running can stay on screen where somebody can see them.
 */
const cancelAllSmartOrdersFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(cancelAllSmartOrdersSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      stood: StoodDownSmartOrder[]
      refused: RefusedSmartOrder[]
    }> => {
      const wallet = await tradingWallet(context.user.id, data.walletId)
      return await runWalletOrderAction(
        context.user.id,
        wallet,
        "cancel",
        async () =>
          await standDownWallet(
            context.user.id,
            wallet,
            getSmartOrderErrorMessage
          )
      )
    }
  )

/**
 * Emptying one wallet: its ladders and grids called off, then everything it
 * holds sold with limits that follow the price.
 *
 * See `flatten-wallet.ts` for the order of operations and why a refused cancel
 * stops the whole thing.
 */
const flattenWalletFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(cancelAllSmartOrdersSchema)
  .handler(async ({ data, context }): Promise<FlattenOutcome> => {
    const wallet = await tradingWallet(context.user.id, data.walletId, true)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () =>
        await flattenWallet(context.user.id, wallet, getSmartOrderErrorMessage)
    )
  })

/**
 * Sells part of a position, through a reduce-only limit that chases the price.
 *
 * One door for both kinds of wallet, because the chase itself belongs to the
 * engine and the engine already knows how to place an order in either lane —
 * see `part-close.ts` for why a part close is not the close button with a
 * number on it.
 *
 * The answer says which road it took. `whole` means the size covered the
 * position, so the browser sends the ordinary whole close instead: two
 * mechanisms with one obvious meaning between them, decided on the server
 * where the held size is known for certain.
 */
const closePartOfPositionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      walletId: z.string().max(36),
      marketKey: marketKeySchema,
      /** Coins, or dollars at the price the exchange is quoting on arrival. */
      unit: z.enum(["coins", "usd"]),
      amount: z.number().positive().finite(),
    })
  )
  .handler(async ({ data, context }): Promise<PartCloseOutcome> => {
    const wallet = await tradingWallet(context.user.id, data.walletId, true)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () =>
        await openPartClose(context.user.id, wallet, {
          marketKey: data.marketKey,
          size: { unit: data.unit, amount: data.amount },
        })
    )
  })

/**
 * Calls off a watched price. One door for both kinds of wallet: nothing is on
 * an exchange until the level is touched, and after that it is the engine that
 * takes the order back either way.
 */
const cancelWatchFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(ladderSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    await tradingWallet(context.user.id, data.walletId)
    return await cancelWatchRow(context.user.id, data.walletId, data.ladderId)
  })

/** Changes a watched price's size, leverage, stop and target while it waits. */
const editWatchFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    ladderSchema.extend({
      sz: z.number().positive().finite(),
      leverage: z.number().min(1).max(100),
      tpPx: z.number().positive().finite().nullable(),
      slPx: z.number().positive().finite().nullable(),
    })
  )
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await tradingWallet(context.user.id, data.walletId)
    return await editWatchRow(context.user.id, data.walletId, data.ladderId, {
      sz: data.sz,
      leverage: data.leverage,
      tpPx: data.tpPx,
      slPx: data.slPx,
    })
  })

/** Drags a watched price to a new level, while it is still watching. */
const moveWatchFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(ladderSchema.extend({ px: z.number().positive().finite() }))
  .handler(async ({ data, context }): Promise<{ moved: true }> => {
    await tradingWallet(context.user.id, data.walletId)
    return await moveWatchRow(
      context.user.id,
      data.walletId,
      data.ladderId,
      data.px
    )
  })

const updateLadderExitsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(exitsSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () => {
        if (wallet.kind === "live") {
          await updateLiveLadderExits(context.user.id, wallet, data)
        } else {
          await updateExitsRows(context.user.id, wallet, data)
        }
        return { saved: true }
      }
    )
  })

/**
 * The browser asking for the smart orders to be looked at now.
 *
 * **It takes the engine's own lock, or it does nothing.** Only one thing may
 * ever advance a smart order: two that both see a level reached will both
 * place its order, and the account ends up in double the position. The engine
 * holds an advisory lock for exactly this reason — but this door never went
 * near it, so a dashboard left open advanced the same ladders the server was
 * advancing. On 20 Aug 2026 that put the same real order on six times in
 * sixteen seconds, twice inside the same second, and a later fix that checked
 * the engine's HEARTBEAT still left a thirty-second window where a freshly
 * dead engine read as alive. The lock has no window: while any engine holds
 * it this cannot take it, and the moment none does, this becomes the engine
 * for one pass — which is the whole reason the door exists, for a laptop
 * with no worker running beside it.
 */
const reconcileLiveLaddersFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }): Promise<{ checked: true }> => {
    // The wallet list comes first, so an account with nothing that could
    // trade never touches the lock at all.
    const wallets = (await listWallets(context.user.id)).filter(
      (wallet) => wallet.kind === "live" && wallet.hasKey
    )
    if (wallets.length === 0) return { checked: true }
    const leadership = await tryBecomeLeaderForOnePass()
    if (!leadership.held) return { checked: true }
    try {
      await Promise.allSettled(
        wallets.map((wallet) => reconcileLiveLadders(context.user.id, wallet))
      )
    } finally {
      await leadership.release()
    }
    return { checked: true }
  })

/** The window's remembered settings, or null the first time it opens. */
const loadSmartDcaFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ params: DcaParams | null }> => {
    return { params: await loadSmartDca(context.user.id) }
  })

export function placeDcaLadder(input: z.infer<typeof placeSchema>) {
  return placeDcaLadderFn({ data: input })
}

export function cancelLadderRung(input: z.infer<typeof rungSchema>) {
  return cancelLadderRungFn({ data: input })
}

/** Empties one wallet: everything called off, then everything sold. */
export function flattenWalletApi(input: { walletId: string }) {
  return flattenWalletFn({ data: input })
}

/** Sells part of a position, or says the ask was really all of it. */
export function closePartOfPosition(input: {
  walletId: string
  marketKey: string
  unit: "coins" | "usd"
  amount: number
}) {
  return closePartOfPositionFn({ data: input })
}

export function cancelWatch(input: z.infer<typeof ladderSchema>) {
  return cancelWatchFn({ data: input })
}

export function editWatch(input: {
  walletId: string
  ladderId: string
  sz: number
  leverage: number
  tpPx: number | null
  slPx: number | null
}) {
  return editWatchFn({ data: input })
}

export function moveWatch(input: {
  walletId: string
  ladderId: string
  px: number
}) {
  return moveWatchFn({ data: input })
}

export function cancelLadderRest(input: z.infer<typeof ladderSchema>) {
  return cancelLadderRestFn({ data: input })
}

export function reshapeLadder(input: z.infer<typeof reshapeLadderSchema>) {
  return reshapeLadderFn({ data: input })
}

export function resumeSmartOrder(input: z.infer<typeof ladderSchema>) {
  return resumeSmartOrderFn({ data: input })
}

export function cancelAllSmartOrders(
  input: z.infer<typeof cancelAllSmartOrdersSchema>
) {
  return cancelAllSmartOrdersFn({ data: input })
}

export function updateLadderExits(input: z.infer<typeof exitsSchema>) {
  return updateLadderExitsFn({ data: input })
}

export function loadSmartDcaParams() {
  return loadSmartDcaFn()
}

export function reconcileLiveSmartOrders() {
  return reconcileLiveLaddersFn()
}

// ----- The grid ------------------------------------------------------------

const placeGridSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
  topPx: z.number().positive().finite(),
  bottomPx: z.number().positive().finite(),
  params: placeGridParamsSchema,
})

const gridLevelSchema = z.object({
  walletId: z.string().max(36),
  gridId: z.string().max(36),
  levelIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_GRID_LEVELS - 1),
})

const gridSchema = z.object({
  walletId: z.string().max(36),
  gridId: z.string().max(36),
})

const gridStopUpdateSchema = z.object({
  walletId: z.string().max(36),
  gridId: z.string().max(36),
  stopLoss: placeGridParamsSchema.shape.stopLoss,
  /** The reverse-when-stopped switch, only when the window changed it. */
  reverseWhenStopped: z.boolean().optional(),
})

const placeGridOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(placeGridSchema)
  .handler(async ({ data, context }): Promise<PlacedGrid> => {
    const wallet = await tradingWallet(context.user.id, data.walletId, true)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () => {
        const input = {
          marketKey: data.marketKey,
          topPx: data.topPx,
          bottomPx: data.bottomPx,
          params: data.params,
        }
        const placed =
          wallet.kind === "live"
            ? await placeLiveGridOrder(context.user.id, wallet, input)
            : await placeGridRows(context.user.id, wallet, input)
        // Remembered only once a grid was really placed with them.
        await saveSmartGrid(context.user.id, data.params)
        return placed
      }
    )
  })

const cancelGridLevelFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(gridLevelSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "cancel",
      async () => {
        if (wallet.kind === "live") {
          await cancelLiveGridLevel(context.user.id, wallet, data)
        } else {
          await cancelGridLevelRow(context.user.id, wallet, data)
        }
        return { cancelled: true }
      }
    )
  })

const cancelGridRestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(gridSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: number }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "cancel",
      async () =>
        wallet.kind === "live"
          ? await cancelLiveGridRest(context.user.id, wallet, data)
          : await cancelGridRestRows(context.user.id, wallet, data)
    )
  })

const reverseGridFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(gridSchema)
  .handler(async ({ data, context }): Promise<{ reversed: true }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId, true)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () => {
        if (wallet.kind === "live") {
          await reverseLiveGrid(context.user.id, wallet, data)
        } else {
          await reverseGridOrderRows(context.user.id, wallet, data)
        }
        return { reversed: true }
      }
    )
  })

const moveGridRangeSchema = z.object({
  walletId: z.string().max(36),
  gridId: z.string().max(36),
  end: z.enum(["top", "bottom"]),
  px: z.number().positive().finite(),
})

const moveGridRangeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(moveGridRangeSchema)
  .handler(async ({ data, context }): Promise<MovedGrid> => {
    const wallet = await tradingWallet(context.user.id, data.walletId, true)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () =>
        wallet.kind === "live"
          ? await moveLiveGridRange(context.user.id, wallet, data)
          : await moveGridRangeRows(context.user.id, wallet, data)
    )
  })

const reshapeGridSchema = z.object({
  walletId: z.string().max(36),
  gridId: z.string().max(36),
  levels: z.number().int().min(MIN_GRID_LEVELS).max(MAX_GRID_LEVELS).optional(),
  potPct: z.number().positive().max(100).optional(),
  leverage: z.number().int().min(1).max(50).optional(),
  /** Switch the hand-set split on or off. Left out, the grid keeps what it had. */
  manualSizing: z.boolean().optional(),
  /** The typed shares in the card's row order, top of the range first. */
  manualRungPcts: z
    .array(z.number().positive().max(100))
    .min(MIN_GRID_LEVELS)
    .max(MAX_GRID_LEVELS)
    .optional(),
})

const reshapeGridFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reshapeGridSchema)
  .handler(async ({ data, context }): Promise<MovedGrid> => {
    // A re-shape can buy, so it needs a wallet that may receive orders.
    const wallet = await tradingWallet(context.user.id, data.walletId, true)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () =>
        wallet.kind === "live"
          ? await reshapeLiveGrid(context.user.id, wallet, data)
          : await reshapeGridRows(context.user.id, wallet, data)
    )
  })

const moveGridExitSchema = z.object({
  walletId: z.string().max(36),
  gridId: z.string().max(36),
  which: z.enum(["takeProfit", "stopLoss"]),
  px: z.number().positive().finite(),
})

const moveGridExitFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(moveGridExitSchema)
  .handler(async ({ data, context }): Promise<MovedGrid> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () =>
        wallet.kind === "live"
          ? await moveLiveGridExit(context.user.id, wallet, data)
          : await moveGridExitRows(context.user.id, wallet, data)
    )
  })

const updateGridStopFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(gridStopUpdateSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () => {
        if (wallet.kind === "live") {
          await updateLiveGridStop(context.user.id, wallet, data)
        } else {
          await updateGridStopRows(context.user.id, wallet, data)
        }
        return { saved: true }
      }
    )
  })

const gridFollowSchema = z.object({
  walletId: z.string().max(36),
  gridId: z.string().max(36),
  follow: z.boolean(),
  followDown: z.boolean().optional(),
})

const setGridFollowFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(gridFollowSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () => {
        if (wallet.kind === "live") {
          await setLiveGridFollow(context.user.id, wallet, data)
        } else {
          await setGridFollowRows(context.user.id, wallet, data)
        }
        return { saved: true }
      }
    )
  })

const gridEndSchema = z.object({
  walletId: z.string().max(36),
  gridId: z.string().max(36),
  abovePct: z.number().positive().max(999).nullable(),
})

const updateGridEndFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(gridEndSchema)
  .handler(async ({ data, context }): Promise<MovedGrid> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return await runWalletOrderAction(
      context.user.id,
      wallet,
      "order",
      async () =>
        wallet.kind === "live"
          ? await updateLiveGridEnd(context.user.id, wallet, data)
          : await updateGridEndRows(context.user.id, wallet, data)
    )
  })

/** The grid window's remembered settings, or null the first time it opens. */
const loadSmartGridFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ params: GridParams | null }> => {
    return { params: await loadSmartGrid(context.user.id) }
  })

export function placeGridOrder(input: z.infer<typeof placeGridSchema>) {
  return placeGridOrderFn({ data: input })
}

export function cancelGridLevel(input: z.infer<typeof gridLevelSchema>) {
  return cancelGridLevelFn({ data: input })
}

export function cancelGridRest(input: z.infer<typeof gridSchema>) {
  return cancelGridRestFn({ data: input })
}

export function moveGridRange(input: z.infer<typeof moveGridRangeSchema>) {
  return moveGridRangeFn({ data: input })
}

export function reshapeGrid(input: z.infer<typeof reshapeGridSchema>) {
  return reshapeGridFn({ data: input })
}

export function moveGridExit(input: z.infer<typeof moveGridExitSchema>) {
  return moveGridExitFn({ data: input })
}

export function updateGridStop(input: z.infer<typeof gridStopUpdateSchema>) {
  return updateGridStopFn({ data: input })
}

export function setGridFollow(input: z.infer<typeof gridFollowSchema>) {
  return setGridFollowFn({ data: input })
}

export function updateGridEnd(input: z.infer<typeof gridEndSchema>) {
  return updateGridEndFn({ data: input })
}

export function loadSmartGridParams() {
  return loadSmartGridFn()
}

const baseSmartOrderErrorMessage = createErrorMessage(
  {
    TRADE_ORDER_RATE_LIMITED:
      "The app is sending orders too fast. Try again in a moment.",
    PAPER_WALLET_NOT_FOUND:
      "That wallet is not there any more — it may have been deleted in another tab.",
    PAPER_WALLET_KIND: "Only a practice wallet trades this way.",
    WALLET_INACTIVE: "Make this wallet active before placing a Smart order.",
    LIVE_WALLET_KEY:
      "This live wallet needs a trading key before it can place a Smart order.",
    LIVE_MARKET: "That market is not one this live wallet can trade.",
    LIVE_NO_PRICE:
      "The exchange would not give a price for that market, so nothing was placed.",
    EXCHANGE_BUSY:
      "The exchange is asking us to slow down, so it would not give a price. Nothing was placed. Try again in a minute — it clears on its own.",
    LIVE_MAINNET_OFF:
      "Real-money trading is switched off. Turn it on in Settings before placing a live Smart order.",
    LIVE_ORDER_GONE:
      "A ladder order is no longer on the exchange. The ladder will reconcile before the next action.",
    LIVE_POSITION_GONE:
      "The ladder's position is no longer on the exchange. Its remaining orders will be reconciled.",
    LIVE_BRACKETS_GONE:
      "The exchange removed the old protection but refused its replacement. Check the position now.",
    LIVE_SMART_ORDER_NOT_RESTING:
      "A Smart-order rung did not rest as expected, so the ladder was rolled back.",
    LIVE_SMART_ROLLBACK_FAILED:
      "The exchange accepted part of the ladder and would not cancel all of it. Check the open orders now.",
    PAPER_MARKET: "That market is not one this wallet can trade.",
    PAPER_NO_PRICE:
      "The exchange would not give a price for that market, so nothing was placed.",
    PAPER_PRICE: "That price cannot be used. Pick a level on the chart again.",
    PAPER_ORDER_LIMIT:
      "That many rungs would pass the fifty-order cap. Cancel some orders or use fewer rungs.",
    SMART_LADDER_EXISTS:
      "This market already has a live ladder in that wallet — cancel it before placing another.",
    SMART_PAIR_LIVE_ONLY:
      "A grid and a ladder can share a coin on a live wallet only — a practice wallet can hold one stop per position and cannot play the handoff honestly.",
    SMART_PAIR_PROTOCOL:
      "This exchange cannot hold the grid's own part-size stop beside the ladder's, so the pairing is refused here. It works on Hyperliquid, Aster and KuCoin.",
    SMART_PAIR_LEVERAGE:
      "The grid and ladder share one position, so they must use the same borrowing. Change this order to match the one already working.",
    SMART_PAIR_GRID_STOP_REQUIRED:
      "To share a coin with a ladder the grid needs a stop — the stop is what hands the coin over to the ladder on the way down.",
    SMART_PAIR_GRID_STOP_BASE:
      "A stop riding the 4h base can move down later, below where the ladder starts buying. Give the grid a plain percent or fixed stop to pair it with a ladder.",
    SMART_PAIR_STOP_BELOW_BASE:
      "The grid's stop must sit above the price where the ladder starts buying — that ordering is what makes the pairing safe, so it is refused, not warned about.",
    SMART_PAIR_SHORT_GRID:
      "A selling grid and a DCA ladder cannot share a coin. The ladder buys and the grid sells, and the exchange holds one position for the coin, so the ladder's buys would close the grid's short instead of building anything.",
    SMART_SHORT_HELD:
      "This wallet is short this market, and a buy ladder would just shrink the short. Close it first.",
    SMART_LONG_HELD:
      "This wallet holds this coin, and a selling grid would just shrink what you hold. Close it first, or place a buying grid instead.",
    SMART_GRID_STOP_PAST_LIQUIDATION:
      "The exchange would close this short out before the stop was reached, so the stop would never fire. Move the stop closer to the range, use less borrowing, use a smaller share of the account, or use fewer levels.",
    SMART_RUNG_TOO_SMALL:
      "A rung is too small to be an order at this market's size step — nothing was placed. Use fewer rungs, a gentler ramp, or a bigger share.",
    SMART_RUNG_DOLLAR_FLOOR:
      "A rung is below this market's smallest dollar order, so nothing was placed.",
    SMART_LADDER_ABOVE_MARKET:
      "Every rung sits above the price right now, so there is nothing left to wait for — nothing was placed.",
    SMART_LADDER_NO_BASE:
      "This market has no confirmed base yet, and the ladder hangs from one — nothing was placed. Wait for the chart to mark a base.",
    SMART_LADDER_NOT_FOUND:
      "That ladder is not there any more — it may have finished or been cancelled.",
    SMART_LADDER_STARTED:
      "That ladder has already started buying, so its rung prices can no longer be changed. Cancel the waiting rungs and place a new ladder for a different shape.",
    SMART_LADDER_RANGE:
      "Those rung prices no longer make a valid ladder. Keep every rung below the one above it.",
    SMART_EXIT_GAP:
      "The exit ladder must stay at or above its starting prices. Drag the exits upward to add a gap, or back to where they started for no extra gap.",
    SMART_EXIT_MIGRATING:
      "This ladder still has a sell at the old exit prices. The app will move it after price is below the corrected Exit 1, then the exits can be changed.",
    SMART_LADDER_FLOW:
      "A ladder controlled by an automation cannot be moved by hand. Change the automation or stop its run first.",
    SMART_ORDER_NOT_FOUND:
      "That smart order is not there any more. The account will refresh now.",
    SMART_ORDER_NOT_PAUSED: "That smart order is already running.",
    SMART_RUNG_DONE: "That rung already bought or was already called off.",
    SMART_GRID_RANGE:
      "The bottom of the grid has to be below the top. Check the two prices and try again.",
    SMART_GRID_STEP_TOO_THIN:
      "Those levels sit too close together to clear the trading fee — each round trip would lose money. Use a wider range or fewer levels.",
    SMART_GRID_LEVEL_TOO_SMALL:
      "A level is too small to be an order at this market's size step — nothing was placed. Use fewer levels, a bigger share, or the same size at every level.",
    SMART_GRID_RUNG_COUNT:
      "The rungs no longer match the grid's levels, so nothing was changed. Close the window and open it again.",
    SMART_GRID_NOT_FOUND:
      "That grid is not there any more — it may have finished or been cancelled.",
    SMART_GRID_FINISHED:
      "That grid has already finished, so nothing was changed.",
    SMART_GRID_LEVEL_DONE:
      "That level already bought or was already called off.",
    SMART_GRID_ADJUST_BUSY:
      "The exchange is asking Trade to slow down, so your grid changes were not saved. The existing grid is still running. Try again in a minute.",
    SMART_GRID_ADJUST_NO_PRICE:
      "The exchange would not give a current price, so your grid changes were not saved. The existing grid is still running.",
    SMART_GRID_TARGET_IN_RANGE:
      "The End Grid line has to sit above the top of the range — inside it is where the grid is working, so a line in there would close it on an ordinary swing.",
    SMART_GRID_STOP_IN_RANGE:
      "The exchange would not give a current price, so the stop could only be put past the losing end of the range. Try again in a moment for a stop inside it.",
    SMART_GRID_STOP_PASSED:
      "The price is already past there, so that stop would close the grid the moment it was set. Put it on the far side of the current price.",
    SMART_GRID_TARGET_PASSED:
      "The End Grid line sits below the price already, so the grid would close the moment it was placed. Put it above the price, or switch it off.",
    PART_CLOSE_MARKET: "That market is not one this wallet can trade.",
    PART_CLOSE_NO_PRICE:
      "The exchange would not give a price for that market, so nothing was placed.",
    PART_CLOSE_POSITION_GONE:
      "That position is not there any more, so there was nothing to sell part of.",
    // The practice lane's word for the same thing. Reachable from here because
    // an amount covering the whole position falls back to the ordinary close.
    PAPER_POSITION_NOT_FOUND:
      "That position is not there any more, so there was nothing to sell.",
    PART_CLOSE_SIZE:
      "How much to sell has to be a number above zero. Nothing was placed.",
    SMART_GRID_STARTED:
      "This grid is holding coin, so its level count, account share, borrowing and rung split cannot change. With one open entry, the range lines can still compress or expand around it.",
    SMART_GRID_RANGE_FIXED:
      "That range edge cannot move without moving an entry the grid already opened. If only one entry is open, try the other edge. Otherwise, wait until an open level closes.",
  },
  "That did not go through. Try it again."
)

export function reverseGridOrder(input: z.infer<typeof gridSchema>) {
  return reverseGridFn({ data: input })
}

export function getSmartOrderErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  // A part close smaller than the venue will take. It carries its whole
  // sentence because it names two figures — this market's floor and what the
  // piece came to — and a fixed sentence could say neither.
  // A reversal refusal carries its whole sentence — it names lines and
  // distances a fixed sentence could not.
  const reversal = message.match(/SMART_GRID_REVERSE:(.*)$/s)
  if (reversal) return reversal[1].trim()
  const tooSmall = message.match(/PART_CLOSE_TOO_SMALL:(.*)$/s)
  if (tooSmall) return tooSmall[1].trim()
  // A hand-set grid's refusals name the ROW that was typed, which a fixed
  // sentence cannot do.
  const rungTooSmall = message.match(/SMART_GRID_RUNG_TOO_SMALL:(\d+)/)
  if (rungTooSmall) {
    return `Rung ${rungTooSmall[1]} is too small to be an order on this market, so nothing was placed. Give it a bigger share, or raise the share of the account the whole grid uses.`
  }
  const floor = message.match(
    /SMART_RUNG_DOLLAR_FLOOR:([\d.]+):([\d.]+):(\d+):(\d+)/
  )
  if (floor) {
    const dollars = (value: string) =>
      Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })
    return `$${dollars(floor[2])} across this coin's $${dollars(floor[1])} floor reaches ${floor[3]} rungs, not ${floor[4]}. Nothing was placed.`
  }
  return baseSmartOrderErrorMessage(error)
}
