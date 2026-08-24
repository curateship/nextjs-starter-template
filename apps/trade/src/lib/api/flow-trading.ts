import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { automationGraphSchema } from "@/lib/automations/graph"
import { parseMarketKey } from "@/lib/protocols/contracts"
import {
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
} from "@/lib/automations/nodes/trade-markets"
import { chosenWallet } from "@/lib/automations/nodes/trade-wallet"
import { describeFlowStop, type TradeFlowRunSpec } from "@/lib/trade/flow-run"
import {
  describeFlowWait,
  flowHeadline,
  flowWaitIsRetired,
  STRIKES_BEFORE_HOLD,
  type FlowWaiting,
} from "@/lib/trade/flow-waiting"
import { flowStartProblem } from "@/lib/trade/flow-words"
import { venueLabel } from "@/lib/trade/wallets"
import { getWorkspaceAutomation } from "@/server/automations/flows"
import { adminGet, adminPost } from "@/server/guards"
import { flowNodesOf } from "@/server/trade/flow-start"
import {
  pauseFlowRun,
  retryFlowRunNow,
  startFlowRun,
  stopFlowRun,
  type FlowNodes,
} from "@/server/trade/flow-run"
import { tradeFlowRuns, tradeSmartLadders } from "@/server/trade/schema"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/server/db"
import { findWallet } from "@/server/trade/wallets"
import { marketFolderForRun } from "@/server/trade/market-folders"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage, describeAuthError } from "./error-message"

/**
 * What a flow is set up to do, asked from the canvas.
 *
 * **Why this exists.** A step's card on the canvas is drawn from that step's
 * own settings and nothing else, so no single step can say what the flow as a
 * whole is for. The panel under the Run button can, because it is handed the
 * flow's id — and that is exactly where somebody is looking when they press
 * Run and wonder what just happened.
 *
 * Read-only. Nothing here starts, stops or changes anything.
 */

/** What one flow is for, and whether it could actually do it. */
export type FlowTrading =
  | { mode: "backtest" }
  | {
      mode: "trades"
      walletLabel: string
      /** True for real money, false for a practice wallet. */
      real: boolean
      /**
       * The exchange, written the way every other screen writes it — and
       * "Hyperliquid Testnet" rather than "Hyperliquid" when it is the practice
       * network, because that is the difference worth seeing at a glance.
       */
      venue: string
      capUsd: number | null
      coins: number
      /** Why it could not run as it stands, in plain words, or null. */
      problem: string | null
      /** True while this flow is switched on and watching its coins. */
      running: boolean
      /**
       * The run this flow is on, when it is switched on — the way through to
       * its dashboard.
       *
       * Null when nothing is running. Every run is its own row, so the id is
       * the only honest way to link to the one trading right now.
       */
      runId: string | null
      /** When it was switched on, epoch ms, or null. */
      startedAt: number | null
      /** How many of its coins have a ladder working right now. */
      working: number
      /**
       * True when the drawing has been changed since this flow was switched on.
       *
       * What is running is the copy frozen at the switch, so the canvas can say
       * one thing while the market holds another. Somebody who edits a live
       * flow and sees no change must be told why rather than left to conclude
       * the edit did nothing — or worse, that the change is already trading.
       */
      drawingChanged: boolean
      /**
       * True when the canvas itself is a backtest right now.
       *
       * A switched-on flow and a backtest are not rivals for this panel. The
       * flow is real and must always be visible; the drawing beside it may
       * well be a backtest somebody is still working on, and hiding its result
       * behind a running flow stops them testing at all.
       */
      drawnIsBacktest: boolean
      /**
       * Why each coin has no ladder yet, worst first.
       *
       * Empty until the flow is switched on and has looked at its coins. A
       * flow whose wallet has no free cash and a flow patiently waiting for
       * the right price both place nothing, and this is the only thing that
       * tells them apart.
       */
      waiting: FlowWaiting[]
      /**
       * The one line at the top of the chip: what is wrong, on how many coins,
       * and when it will look again. Null when there is nothing to say.
       *
       * One line because it was three — the hold, a summary and the list all
       * saying the same thing on a flow where every coin is refused the same
       * way.
       */
      headline: string | null
      /** True when at least one coin needs a person rather than more time. */
      needsAttention: boolean
      /** True while it has given up asking and is waiting to try again. */
      holding: boolean
      /** True while it has been told to stop looking for new coins. */
      paused: boolean
    }

const flowSchema = z.object({ automationId: z.string().max(36) })

const loadFlowTradingFn = createServerFn({ method: "GET" })
  // Scoped exactly like the screen it serves.
  //
  // The editor reads a flow through `adminGet` and the workspace it belongs to
  // — not by who happened to draw it. Matching that matters: a flow somebody
  // else in the workspace set up to spend real money would otherwise come back
  // as "backtest" here, and this panel is the one place that says out loud that
  // Run will not test it.
  .middleware([adminGet])
  .inputValidator(flowSchema)
  .handler(async ({ data, context }): Promise<FlowTrading> => {
    const row = await getWorkspaceAutomation(
      await workspaceIdForRequest(context.user.id),
      data.automationId
    )

    // Asked FIRST, and it wins outright.
    //
    // A switched-on flow trades the copy frozen when the switch was thrown, so
    // what the drawing says now cannot change it — and must not be able to hide
    // it either. Reading the drawing first meant taking the wallet off the step
    // made a running flow vanish from this card and come back as a backtest,
    // with real ladders still working in the market behind it.
    const live = await runningFlow(context.user.id, data.automationId)

    // The drawing, not the compiled copy.
    //
    // A flow only compiles when every step is complete, and the compiled copy
    // is simply left behind when it is not — so a flow somebody has just moved
    // onto a wallet, which clears the coin list, stops compiling and would
    // report its OLD mode here for as long as it stayed that way. That is the
    // exact moment this panel most needs to be right.
    const parsed = automationGraphSchema.safeParse(row?.graph)
    const steps = parsed.success ? parsed.data.nodes : []
    const walletStep = steps.find((one) => one.kind === "tradeWallet")
    const named = walletStep ? chosenWallet(walletStep.settings) : null
    const marketStep = steps.find((one) => one.kind === tradeMarketsNode.kind)
    const markets = marketStep
      ? tradeMarketsSettingsSchema.safeParse(marketStep.settings)
      : null
    let folderProblem: string | null = null
    let drawnKeys = markets?.success ? [...markets.data.marketKeys] : []
    if (markets?.success && markets.data.folderId) {
      try {
        const folder = await marketFolderForRun(
          context.user.id,
          markets.data.folderId
        )
        drawnKeys = folder.marketKeys
      } catch {
        folderProblem = `${markets.data.folderName ?? "That folder"} was deleted. Choose another folder on the Markets step.`
      }
    }
    const coins = drawnKeys.length

    // What is running is described by the copy it is running, not by the
    // drawing beside it — including its wallet and its coin count.
    if (live) {
      const working = await countWorkingLadders(
        context.user.id,
        live.walletId,
        live.spec.marketKeys
      )
      // Coins the flow no longer watches are dropped rather than shown: the
      // spec is frozen, so an entry outside its list could only be left over
      // from a bug, and a coin nobody chose is a confusing thing to report.
      const held = new Set(live.spec.marketKeys)
      const all = Object.entries(live.waiting)
        .filter(
          ([marketKey, reason]) =>
            held.has(marketKey) &&
            // An answer to a rule that no longer exists is not a reason to
            // wait — the coin simply has not been looked at since it changed.
            !flowWaitIsRetired(reason.code)
        )
        .map(([marketKey, reason]) => describeFlowWait(marketKey, reason))
      // A paused flow is not waiting on anything — it was told to stop, and
      // "trying again in 12 minutes" over the top of that is two answers to
      // one question.
      const holding =
        live.pausedAt === null &&
        live.hold !== null &&
        live.hold.strikes >= STRIKES_BEFORE_HOLD
      const head = flowHeadline(
        all,
        working,
        holding ? live.hold : null,
        Date.now()
      )
      // Only the coins the headline does NOT already cover. Listing six coins
      // under a line that just said a hundred of them were refused the same
      // way is the repetition this panel kept falling into.
      const waiting = head?.code
        ? all.filter(
            (one) => one.code.split(":")[0] !== head.code!.split(":")[0]
          )
        : all
            // Anything needing a person first, then whatever was seen most
            // recently. A list somebody scans from the top should start with the
            // thing they can actually act on.
            .sort((a, b) => {
              if (a.problem !== b.problem) return a.problem ? -1 : 1
              return b.at - a.at
            })

      return {
        mode: "trades",
        walletLabel: live.spec.walletLabel,
        real: live.spec.real,
        venue: venueLabel(live.spec.protocol, live.spec.network),
        capUsd: live.spec.capUsd,
        coins: live.spec.marketKeys.length,
        problem: null,
        running: true,
        runId: live.id,
        startedAt: live.startedAt.getTime(),
        working,
        waiting,
        headline: head?.words ?? null,
        needsAttention: (head?.problem ?? false) || live.hold !== null,
        holding,
        paused: live.pausedAt !== null,
        drawingChanged: drawingMovedOn(
          live.spec,
          live.walletId,
          named,
          drawnKeys
        ),
        drawnIsBacktest: named === null,
      }
    }

    if (!parsed.success) return { mode: "backtest" }
    if (!named) return { mode: "backtest" }

    // Checked against the database rather than against the copy on the step,
    // because the copy is only ever for drawing and this answer is about
    // whether the flow could really run.
    //
    // Wallets belong to a person, not to the workspace, so this is the one
    // thing still asked as "mine": somebody else's flow may name a wallet this
    // reader cannot see, and the honest answer to that is the same as for a
    // deleted one — it says so rather than guessing.
    const wallet = await findWallet(context.user.id, named.id)
    const problem = ((): string | null => {
      if (!wallet) {
        return `${named.label} has been deleted, so this flow has nothing to trade.`
      }
      if (wallet.status !== "active") {
        return `${wallet.label} is switched off. Make it active in the account panel.`
      }
      if (wallet.kind === "live" && !wallet.hasKey) {
        return `${wallet.label} has no trading key saved, so it cannot place an order.`
      }
      if (folderProblem) return folderProblem
      if (coins === 0) {
        return "No coins are chosen on the Markets step yet."
      }
      const marketRefs = drawnKeys.map(parseMarketKey)
      if (
        markets?.success &&
        (markets.data.protocol !== wallet.protocol ||
          marketRefs.some(
            (ref) =>
              !ref ||
              ref.protocol !== wallet.protocol ||
              ref.network !== wallet.network
          ))
      ) {
        const marketRef = marketRefs.find((ref) => ref !== null) ?? null
        const marketVenue = marketRef
          ? venueLabel(marketRef.protocol, marketRef.network)
          : markets.data.protocol
        const walletVenue = venueLabel(wallet.protocol, wallet.network)
        return `The Markets step names ${marketVenue}, but ${wallet.label} trades ${walletVenue}. Choose ${walletVenue} markets for this wallet.`
      }
      if (named.capUsd === null) {
        return "Say how much of the wallet this flow may use, on the Wallet step."
      }
      return null
    })()

    return {
      mode: "trades",
      walletLabel: wallet?.label ?? named.label,
      real: (wallet?.kind ?? named.kind) === "live",
      venue: wallet
        ? venueLabel(wallet.protocol, wallet.network)
        : (named.protocol ?? ""),
      capUsd: named.capUsd,
      coins,
      problem,
      running: false,
      runId: null,
      startedAt: null,
      working: 0,
      // Nothing is being looked at until it is switched on, and an empty list
      // here means exactly that rather than "everything is fine".
      waiting: [],
      headline: null,
      needsAttention: false,
      holding: false,
      paused: false,
      drawingChanged: false,
      drawnIsBacktest: false,
    }
  })

/** The switched-on copy of a flow, or nothing. */
async function runningFlow(userId: string, automationId: string) {
  const [row] = await db
    .select({
      id: tradeFlowRuns.id,
      startedAt: tradeFlowRuns.startedAt,
      walletId: tradeFlowRuns.walletId,
      spec: tradeFlowRuns.spec,
      waiting: tradeFlowRuns.waiting,
      hold: tradeFlowRuns.hold,
      pausedAt: tradeFlowRuns.pausedAt,
    })
    .from(tradeFlowRuns)
    .where(
      and(
        eq(tradeFlowRuns.userId, userId),
        eq(tradeFlowRuns.automationId, automationId),
        eq(tradeFlowRuns.status, "running")
      )
    )
    .limit(1)
  return row ?? null
}

/**
 * Whether the drawing has moved away from what is running.
 *
 * Only the things that decide what gets traded: the wallet, the money and the
 * coin list. Moving a step around the canvas is not a change worth saying
 * anything about.
 */
function drawingMovedOn(
  spec: TradeFlowRunSpec,
  walletId: string,
  named: ReturnType<typeof chosenWallet>,
  marketKeys: string[]
): boolean {
  // A canvas set back to pretend money is not a changed set of trading
  // settings — it is a backtest being drawn beside a flow that is still on.
  // Telling somebody to restart "to use the new ones" there is nonsense; that
  // case is `drawnIsBacktest` and gets its own sentence.
  if (!named) return false
  // By id, not by name. Two wallets may be called the same thing, and a rename
  // is not a change to what is being traded.
  if (named.id !== walletId) return true
  if (named.capUsd !== spec.capUsd) return true
  if (marketKeys.length !== spec.marketKeys.length) return true
  const held = new Set(spec.marketKeys)
  return marketKeys.some((key) => !held.has(key))
}

/** How many of a flow's coins have a smart order on them right now. */
async function countWorkingLadders(
  userId: string,
  walletId: string,
  marketKeys: string[]
): Promise<number> {
  if (marketKeys.length === 0) return 0
  const rows = await db
    .select({ marketKey: tradeSmartLadders.marketKey })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.status, "active"),
        inArray(tradeSmartLadders.marketKey, marketKeys)
      )
    )
  return rows.length
}

/** The saved drawing's three trade steps, for switching on. */
async function nodesForFlow(
  userId: string,
  automationId: string
): Promise<FlowNodes | null> {
  const row = await getWorkspaceAutomation(
    await workspaceIdForRequest(userId),
    automationId
  )
  const parsed = automationGraphSchema.safeParse(row?.graph)
  if (!parsed.success) return null
  return flowNodesOf({
    nodes: Object.fromEntries(
      parsed.data.nodes.map((one) => [
        one.id,
        { kind: one.kind, settings: one.settings },
      ])
    ),
  })
}

const startFlowFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(flowSchema)
  .handler(async ({ data, context }): Promise<{ summary: string }> => {
    const nodes = await nodesForFlow(context.user.id, data.automationId)
    if (!nodes) throw new Error("FLOW_NO_WALLET")
    const started = await startFlowRun(context.user.id, {
      automationId: data.automationId,
      nodes,
      now: Date.now(),
    })
    const coins = started.spec.marketKeys.length
    return {
      summary: `Switched on — watching ${coins} ${coins === 1 ? "coin" : "coins"} on ${started.spec.walletLabel}.`,
    }
  })

const stopFlowFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(flowSchema)
  .handler(async ({ data, context }): Promise<{ summary: string }> => {
    const outcome = await stopFlowRun(context.user.id, {
      automationId: data.automationId,
      now: Date.now(),
      reason: "Switched off by hand.",
      // The person pressing Stop already knows, so no bell notice for this one.
      byHand: true,
    })
    if (!outcome) return { summary: "That flow was not switched on." }
    return { summary: describeFlowStop(outcome) }
  })

const pauseFlowFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(flowSchema.extend({ paused: z.boolean() }))
  .handler(async ({ data, context }): Promise<{ summary: string }> => {
    const changed = await pauseFlowRun(context.user.id, {
      automationId: data.automationId,
      paused: data.paused,
      now: Date.now(),
    })
    if (!changed) return { summary: "That flow was not switched on." }
    return {
      summary: data.paused
        ? "Paused. Nothing already placed has been touched."
        : "Looking for coins again.",
    }
  })

const retryFlowFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(flowSchema)
  .handler(async ({ data, context }): Promise<{ summary: string }> => {
    const changed = await retryFlowRunNow(context.user.id, {
      automationId: data.automationId,
      now: Date.now(),
    })
    if (!changed) return { summary: "That flow was not switched on." }
    return { summary: "Trying again now." }
  })

export function pauseFlow(automationId: string, paused: boolean) {
  return pauseFlowFn({ data: { automationId, paused } })
}

export function retryFlowNow(automationId: string) {
  return retryFlowFn({ data: { automationId } })
}

export function startFlow(automationId: string) {
  return startFlowFn({ data: { automationId } })
}

export function stopFlow(automationId: string) {
  return stopFlowFn({ data: { automationId } })
}

/** A refusal in words. The wallet's name is filled in by the caller. */
export function flowActionProblem(error: unknown, walletLabel: string): string {
  const message = error instanceof Error ? error.message : ""
  const auth = describeAuthError(message)
  return auth ?? flowStartProblem(message, walletLabel)
}

export function loadFlowTrading(automationId: string) {
  return loadFlowTradingFn({ data: { automationId } })
}

export const getFlowTradingErrorMessage = createErrorMessage(
  {},
  "Could not read what this flow is set up to do."
)
