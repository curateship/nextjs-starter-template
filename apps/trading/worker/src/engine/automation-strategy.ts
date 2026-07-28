import {
  AUTOMATION_MAX_WINDOW_BARS,
  automationCapabilities,
  automationHtfInterval,
  type AutomationCondition,
  type AutomationConfig,
  type AutomationRule,
  type ResolvedAutomationAction,
} from "@/lib/automations/automation"
import type { IndicatorCandle } from "@/lib/indicators/contract"
import { evaluateAutomation } from "@/lib/automations/evaluate"
import {
  automationHtfWindowBars,
  automationWarmupBars,
} from "@/lib/strategies/kinds/automation"
import { onePriceStep } from "@/server/hyperliquid/rounding"
import { baseLevels, ceilingLevels } from "@/lib/strategies/indicators"
import { sessionOpenPrice } from "@/lib/trading/sessions"

import type {
  DesiredOrder,
  Strategy,
  StrategyCtx,
} from "../strategies/contract"
import { nextTrailState, type TrailState } from "@/lib/strategies/trailing-stop"
import { exitLevels, tickExit } from "./trade-manager"
import { closestBookWalls, type BookWall } from "../scanner/book-metrics"
import { createDcaAutomationStrategy } from "./dca-automation"

const WALL_ENTRY_PURPOSE = "auto:wall-entry"
const WALL_EXIT_PURPOSE = "auto:wall-forced-exit"
const WALL_ENTRY_STALE_MS = 2_000
const WALL_POSITION_STALE_MS = 5_000
const WALL_EXIT_RETRY_MS = 1_000

type LiveWallCondition = Extract<AutomationCondition, { kind: "liveWall" }>
type WallRoute = {
  key: string
  ruleId: string
  action: "buy" | "short"
  targetEquityPct: number
  condition: LiveWallCondition
}

type WallCandidate = WallRoute & {
  wall: BookWall
  bestBid: number
  bestAsk: number
  firstSeenAt: number
  confirmed: boolean
}

type ActiveWall = WallCandidate & {
  entryPx: number
  entrySz: number
  remainingSz: number
  filledSz: number
  ownsPosition: boolean
  entryComplete: boolean
  invalidated: boolean
  invalidatedAt: number | null
  invalidReason: string | null
  rejectedBookSequence: number | null
  lastCloseAttemptAt: number | null
}

type WallRuntime = {
  lastBookAt: number | null
  waitingForBookSince: number | null
  bookSequence: number
  bidCandidate: WallCandidate | null
  askCandidate: WallCandidate | null
  active: ActiveWall | null
  blockedWall: { side: "bid" | "ask"; px: number } | null
}

export type AutomationState = {
  pendingAction: ResolvedAutomationAction | null
  exitRequested: boolean
  lastEvaluatedCandleTime: number | null
  /** Trailing-stop extreme for the open position; null while flat. */
  trail?: TrailState | null
  /**
   * The price the session opened at, for a stop anchored to a session open.
   * Read ONCE when the position appears and held until it closes, so the stop
   * cannot wander onto the next session mid-trade. 0 records "no session was
   * running when this trade opened", which leaves the configured percent in
   * charge. Null/absent while flat.
   */
  stopLevelPx?: number | null
  wall?: WallRuntime
}

function wallRoutes(config: AutomationConfig): WallRoute[] {
  const collect = (
    rule: AutomationRule,
    condition: AutomationCondition
  ): WallRoute[] => {
    if (condition.kind === "trigger") return []
    if (condition.kind !== "liveWall") {
      return condition.children.flatMap((child) => collect(rule, child))
    }
    if (
      (rule.action !== "buy" && rule.action !== "short") ||
      !rule.targetEquityPct
    ) {
      return []
    }
    return [
      {
        key: `${rule.id}:${condition.nodeId}:${condition.side}`,
        ruleId: rule.id,
        action: rule.action,
        targetEquityPct: rule.targetEquityPct,
        condition,
      },
    ]
  }
  return config.rules.flatMap((rule) => collect(rule, rule.condition))
}

function hasCandleCondition(condition: AutomationCondition): boolean {
  if (condition.kind === "trigger") return true
  if (condition.kind === "liveWall") return false
  return condition.children.some(hasCandleCondition)
}

function emptyWallRuntime(): WallRuntime {
  return {
    lastBookAt: null,
    waitingForBookSince: null,
    bookSequence: 0,
    bidCandidate: null,
    askCandidate: null,
    active: null,
    blockedWall: null,
  }
}

function sameWall(
  left: { side: "bid" | "ask"; px: number } | null,
  right: { side: "bid" | "ask"; px: number } | null
) {
  return left?.side === right?.side && left?.px === right?.px
}

function wallEventData(active: ActiveWall, reason?: string) {
  return {
    side: active.wall.side,
    wallPrice: active.wall.px,
    wallValueUsd: active.wall.usd,
    entryPrice: active.entryPx,
    ...(reason ? { reason } : {}),
  }
}

function marketOrder(
  purpose: string,
  side: "buy" | "sell",
  sz: number,
  reduceOnly: boolean
): DesiredOrder {
  return {
    purpose,
    side,
    orderType: "market",
    sz: String(sz),
    tif: "Ioc",
    reduceOnly,
  }
}

/** One-time target adjustment produced by a completed-candle Automation action. */
export function automationTargetOrders(input: {
  mid: number
  equity: number
  positionSzi: number
  action: ResolvedAutomationAction
}): DesiredOrder[] {
  const { mid, equity, positionSzi, action } = input
  if (!(mid > 0) || !(equity > 0)) return []
  if (action.action === "close") {
    if (positionSzi === 0) return []
    return [
      marketOrder(
        "auto:close",
        positionSzi > 0 ? "sell" : "buy",
        Math.abs(positionSzi),
        true
      ),
    ]
  }

  if (action.action === "reverse") {
    // Flip whatever is held to the opposite side in one step. With no open
    // position there is nothing to reverse.
    if (positionSzi === 0) return []
    const side = positionSzi > 0 ? "sell" : "buy"
    const reversedSz = (equity * action.targetEquityPct) / 100 / mid
    return [
      marketOrder("auto:flip-close", side, Math.abs(positionSzi), true),
      marketOrder("auto:target-entry", side, reversedSz, false),
    ]
  }

  const targetSzi =
    ((equity * action.targetEquityPct) / 100 / mid) *
    (action.action === "buy" ? 1 : -1)
  if (positionSzi !== 0 && Math.sign(positionSzi) !== Math.sign(targetSzi)) {
    const side = targetSzi > 0 ? "buy" : "sell"
    return [
      marketOrder("auto:flip-close", side, Math.abs(positionSzi), true),
      marketOrder("auto:target-entry", side, Math.abs(targetSzi), false),
    ]
  }

  const delta = targetSzi - positionSzi
  if (Math.abs(delta * mid) < 0.01) return []
  const reducing =
    positionSzi !== 0 && Math.abs(targetSzi) < Math.abs(positionSzi)
  return [
    marketOrder(
      reducing ? "auto:target-reduce" : "auto:target-entry",
      delta > 0 ? "buy" : "sell",
      Math.abs(delta),
      reducing
    ),
  ]
}

export function createAutomationStrategy(
  config: AutomationConfig
): Strategy<never, AutomationState> {
  if (config.dca) {
    return createDcaAutomationStrategy(config) as unknown as Strategy<
      never,
      AutomationState
    >
  }
  const capabilities = automationCapabilities(config)
  const routes = wallRoutes(config)
  const window = Math.min(
    automationWarmupBars(config),
    AUTOMATION_MAX_WINDOW_BARS
  )
  const htfInterval = automationHtfInterval(config)
  const htfWindow = automationHtfWindowBars(config)
  const initialState = (): AutomationState => ({
    pendingAction: null,
    exitRequested: false,
    lastEvaluatedCandleTime: null,
    ...(capabilities.requiresLiveBook ? { wall: emptyWallRuntime() } : {}),
  })
  const position = (ctx: StrategyCtx<AutomationState>) => ({
    szi: Number(ctx.position?.szi ?? 0),
    entryPx: Number(ctx.position?.entryPx ?? 0),
  })
  // Per-side protection: a long position exits on the long levels, a short on
  // the short levels. The trade-manager math itself stays side-agnostic.
  const protectionFor = (szi: number) =>
    (szi > 0 ? config.protection.long : config.protection.short) ?? {}
  const anchorsToLevel = Boolean(
    config.protection.long?.stopLossLevel ||
    config.protection.short?.stopLossLevel
  )
  /**
   * The session's opening price for the open position: looked up the first
   * time we see the position and kept from then on (0 = the trade opened
   * outside the session, so its percent stop stands). Returns the stored value
   * unchanged in every other case, so callers can compare by identity.
   *
   * A worker restarted mid-trade has no stored value and reads it again from
   * the session running NOW: the same answer while the trade is still inside
   * its own session (the case this is built for), and 0 — the percent stop —
   * once that session has closed. Deterministic either way, and never a level
   * borrowed from a session the trade was not opened in.
   */
  const stopLevelPxFor = (
    ctx: StrategyCtx<AutomationState>,
    pos: { szi: number; entryPx: number }
  ): number | null => {
    const stored = ctx.state.stopLevelPx ?? null
    if (pos.szi === 0) return null
    const level = protectionFor(pos.szi).stopLossLevel
    if (!level) return stored
    if (stored !== null) return stored
    if (level.kind === "sessionOpen") {
      const candles = ctx
        .candles(config.interval, window)
        .map((candle) => ({ t: candle.t, o: Number(candle.o) }))
      return sessionOpenPrice(level.session, candles, ctx.now) ?? 0
    }
    // The confirmed base in force right now — the same dash the chart paints,
    // because it comes from the same detection settings the wired-in Base node
    // carries. A long sits at the base under it; a short sits at the ceiling
    // above it, which is that side's mirror of the level.
    const candles = ctx
      .candles(config.interval, window)
      .filter((candle) => candle.T <= ctx.now)
      .map((candle) => ({
        t: candle.t,
        o: Number(candle.o),
        h: Number(candle.h),
        l: Number(candle.l),
        c: Number(candle.c),
        v: Number(candle.v),
      }))
    const levels =
      pos.szi > 0
        ? baseLevels(candles, level.basePeriods, level.pumpPeriods)
        : ceilingLevels(candles, level.basePeriods, level.pumpPeriods)
    const current = levels.raw.at(-1)
    return current !== undefined && Number.isFinite(current) ? current : 0
  }
  const emitWallFillEvidence = (
    ctx: StrategyCtx<AutomationState>,
    previous: ActiveWall,
    active: ActiveWall
  ) => {
    const progressed =
      active.filledSz > previous.filledSz + 1e-12 ||
      (active.entryComplete && !previous.entryComplete)
    if (!progressed) return
    ctx.emit(
      active.entryComplete ? "wall_entry_filled" : "wall_entry_partial_fill",
      active.entryComplete
        ? "Whale Wall entry filled."
        : "Whale Wall entry partially filled.",
      wallEventData(active, active.entryComplete ? "filled" : "partial_fill")
    )
    if (active.invalidated) {
      ctx.emit(
        "wall_cancellation_race_fill",
        "The entry filled while cancellation was in progress; forcing an exit.",
        wallEventData(active, "cancellation_race")
      )
    }
  }

  const detect = (
    route: WallRoute,
    book: Parameters<
      NonNullable<Strategy<never, AutomationState>["onBook"]>
    >[2],
    previous: WallCandidate | null,
    time: number
  ): WallCandidate | null => {
    const found = closestBookWalls(book.levels[0], book.levels[1], {
      wallMinUsd: route.condition.minUsd,
      wallMultiple: route.condition.relativeSize,
      wallMaxDistance: route.condition.maxDistancePct / 100,
    })
    const wall = found?.[route.condition.side]
    if (!found || !wall) return null
    const unchanged =
      previous?.key === route.key && sameWall(previous.wall, wall)
    return {
      ...route,
      wall,
      bestBid: found.bestBid,
      bestAsk: found.bestAsk,
      firstSeenAt: unchanged ? previous.firstSeenAt : time,
      confirmed: unchanged ? previous.confirmed : false,
    }
  }

  const chooseSide = (
    side: "bid" | "ask",
    book: Parameters<
      NonNullable<Strategy<never, AutomationState>["onBook"]>
    >[2],
    previous: WallCandidate | null,
    time: number
  ): WallCandidate | null =>
    routes
      .filter((route) => route.condition.side === side)
      .map((route) => detect(route, book, previous, time))
      .filter((candidate): candidate is WallCandidate => candidate !== null)
      .sort((a, b) => a.wall.distance - b.wall.distance)[0] ?? null

  return {
    type: "automation",
    warmup: () => ({
      candleIntervals:
        // A session-anchored stop needs the candles too, even in a graph whose
        // entries come from the order book rather than a candle rule.
        config.rules.some((rule) => hasCandleCondition(rule.condition)) ||
        anchorsToLevel
          ? [config.interval, ...(htfInterval ? [htfInterval] : [])]
          : [],
      requiresLiveBook: capabilities.requiresLiveBook,
    }),
    init: initialState,
    onStart: (ctx) => {
      if (!ctx.state.wall) return
      const wall = {
        ...ctx.state.wall,
        lastBookAt: null,
        waitingForBookSince:
          ctx.position && ctx.state.wall.active?.ownsPosition ? ctx.now : null,
        bidCandidate: null,
        askCandidate: null,
      }
      if (ctx.position && !wall.active?.ownsPosition) {
        throw new Error(
          "Whale Wall bots must start flat so they cannot manage another position."
        )
      }
      if (!ctx.position && wall.active) {
        wall.blockedWall = wall.active.ownsPosition
          ? { side: wall.active.wall.side, px: wall.active.wall.px }
          : wall.blockedWall
        wall.active = null
      } else if (wall.active) {
        wall.active = {
          ...wall.active,
          entryComplete: true,
          rejectedBookSequence: null,
        }
      }
      ctx.setState({ ...ctx.state, wall })
    },
    onBook: (ctx, _params, book, precision) => {
      const current = ctx.state.wall
      if (!current) return
      let wall: WallRuntime = {
        ...current,
        lastBookAt: ctx.now,
        waitingForBookSince: null,
        bookSequence: current.bookSequence + 1,
      }

      if (wall.active && !wall.active.invalidated) {
        const matched = detect(wall.active, book, wall.active, ctx.now)
        if (!matched || !sameWall(matched.wall, wall.active.wall)) {
          const active = {
            ...wall.active,
            invalidated: true,
            invalidatedAt: ctx.now,
            invalidReason: "wall_invalid",
          }
          ctx.emit(
            "wall_invalidated",
            "The tracked wall weakened, moved, or disappeared.",
            wallEventData(active, "wall_invalid")
          )
          wall = {
            ...wall,
            active,
            bidCandidate: null,
            askCandidate: null,
          }
        } else {
          wall.active = {
            ...wall.active,
            wall: matched.wall,
            bestBid: matched.bestBid,
            bestAsk: matched.bestAsk,
            rejectedBookSequence: null,
          }
        }
      }

      if (!wall.active) {
        let bid = chooseSide("bid", book, wall.bidCandidate, ctx.now)
        let ask = chooseSide("ask", book, wall.askCandidate, ctx.now)

        if (wall.blockedWall) {
          const blockedCandidate = wall.blockedWall.side === "bid" ? bid : ask
          if (
            blockedCandidate &&
            sameWall(blockedCandidate.wall, wall.blockedWall)
          ) {
            if (wall.blockedWall.side === "bid") bid = null
            else ask = null
          } else {
            wall.blockedWall = null
          }
        }

        for (const candidate of [bid, ask]) {
          const previous =
            candidate?.wall.side === "bid"
              ? wall.bidCandidate
              : wall.askCandidate
          if (candidate && !sameWall(candidate.wall, previous?.wall ?? null)) {
            ctx.emit(
              "wall_detected",
              `Detected a qualifying ${candidate.wall.side} wall.`,
              {
                side: candidate.wall.side,
                wallPrice: candidate.wall.px,
                wallValueUsd: candidate.wall.usd,
                entryPrice: Number(
                  onePriceStep(
                    candidate.wall.px,
                    precision.szDecimals,
                    candidate.wall.side === "bid" ? 1 : -1
                  )
                ),
                reason: "thresholds_met",
              }
            )
          }
          if (
            candidate &&
            !candidate.confirmed &&
            ctx.now - candidate.firstSeenAt >=
              candidate.condition.confirmationMs
          ) {
            candidate.confirmed = true
            ctx.emit(
              "wall_confirmed",
              `Confirmed the ${candidate.wall.side} wall.`,
              {
                side: candidate.wall.side,
                wallPrice: candidate.wall.px,
                wallValueUsd: candidate.wall.usd,
                entryPrice: Number(
                  onePriceStep(
                    candidate.wall.px,
                    precision.szDecimals,
                    candidate.wall.side === "bid" ? 1 : -1
                  )
                ),
                reason: "confirmation_elapsed",
              }
            )
          }
        }
        wall.bidCandidate = bid
        wall.askCandidate = ask

        const chosen = bid && ask ? null : (bid ?? ask)
        if (chosen?.confirmed && !ctx.position) {
          const entryPx = Number(
            onePriceStep(
              chosen.wall.px,
              precision.szDecimals,
              chosen.wall.side === "bid" ? 1 : -1
            )
          )
          const staysPassive =
            chosen.wall.side === "bid"
              ? entryPx < chosen.bestAsk
              : entryPx > chosen.bestBid
          const entrySz =
            (Number(ctx.equity) * chosen.targetEquityPct) / 100 / entryPx
          if (staysPassive && entrySz > 0) {
            wall.active = {
              ...chosen,
              entryPx,
              entrySz,
              remainingSz: entrySz,
              filledSz: 0,
              ownsPosition: false,
              entryComplete: false,
              invalidated: false,
              invalidatedAt: null,
              invalidReason: null,
              rejectedBookSequence: null,
              lastCloseAttemptAt: null,
            }
          }
        }
      }
      ctx.setState({ ...ctx.state, wall })
    },
    onCandleClose: (ctx) => {
      const raw = ctx
        .candles(config.interval, window)
        .filter((candle) => candle.T <= ctx.now)
      if (raw.length < 3) return
      const candles: IndicatorCandle[] = raw.map((candle) => ({
        t: candle.t,
        o: Number(candle.o),
        h: Number(candle.h),
        l: Number(candle.l),
        c: Number(candle.c),
        v: Number(candle.v),
      }))
      const lastTime = candles[candles.length - 1].t
      if (ctx.state.lastEvaluatedCandleTime === lastTime) return
      // The engine always hands the REAL closed higher-timeframe candles to
      // the evaluator (never the paint-side resample). An empty series just
      // blocks HTF-gated entries — fail-safe, not fail-open.
      const htfCandles: IndicatorCandle[] | undefined = htfInterval
        ? ctx
            .candles(htfInterval, htfWindow)
            .filter((candle) => candle.T <= ctx.now)
            .map((candle) => ({
              t: candle.t,
              o: Number(candle.o),
              h: Number(candle.h),
              l: Number(candle.l),
              c: Number(candle.c),
              v: Number(candle.v),
            }))
        : undefined
      const evaluated = evaluateAutomation(candles, config, htfCandles)
      const actionEvent =
        evaluated.actions.find((action) => action.time === lastTime) ?? null
      const pendingAction: ResolvedAutomationAction | null = actionEvent
        ? actionEvent.action === "close"
          ? { action: "close" }
          : {
              action: actionEvent.action,
              targetEquityPct: actionEvent.targetEquityPct,
            }
        : null
      const warning = evaluated.warnings.find((item) => item.time === lastTime)
      ctx.setState({
        ...ctx.state,
        pendingAction,
        lastEvaluatedCandleTime: lastTime,
      })
      if (warning) ctx.emit("automation_conflict", warning.message)
      if (pendingAction) {
        const label =
          pendingAction.action === "close"
            ? "Close position"
            : pendingAction.action === "reverse"
              ? `Reverse ${pendingAction.targetEquityPct}%`
              : `${pendingAction.action === "buy" ? "Buy" : "Short"} ${pendingAction.targetEquityPct}%`
        ctx.emit(
          "automation_action",
          `${label} matched at ${candles[candles.length - 1].c}.`
        )
      }
    },
    onTick: (ctx) => {
      // Ratchet the trailing-stop extreme FIRST so the exit checks below (and
      // any exitTriggers read after this tick) see the freshest stop level.
      // Every later setState in this handler spreads `state`, not ctx.state
      // (a stale snapshot), so no branch can drop the ratchet.
      const pos = position(ctx)
      const prevTrail = ctx.state.trail ?? null
      const trail = nextTrailState(prevTrail, pos, Number(ctx.mid))
      // The level-anchored stop's price is read here for the same reason: the
      // exit checks below and any exitTriggers read after this tick must see it.
      const prevStopLevelPx = ctx.state.stopLevelPx ?? null
      const stopLevelPx = stopLevelPxFor(ctx, pos)
      const state: AutomationState =
        trail === prevTrail && stopLevelPx === prevStopLevelPx
          ? ctx.state
          : { ...ctx.state, trail, stopLevelPx }
      if (state !== ctx.state) ctx.setState(state)
      const wall = state.wall
      if (
        wall?.active?.invalidated &&
        !wall.active.ownsPosition &&
        wall.active.invalidatedAt !== null &&
        ctx.now - wall.active.invalidatedAt >= WALL_POSITION_STALE_MS
      ) {
        ctx.setState({
          ...state,
          wall: {
            ...wall,
            bidCandidate: null,
            askCandidate: null,
            active: null,
          },
        })
        return
      }
      const lastFreshBook =
        wall?.lastBookAt ?? wall?.waitingForBookSince ?? null
      if (wall?.active && lastFreshBook !== null) {
        const staleFor = ctx.now - lastFreshBook
        const deadline = wall.active.ownsPosition
          ? WALL_POSITION_STALE_MS
          : WALL_ENTRY_STALE_MS
        if (!wall.active.invalidated && staleFor >= deadline) {
          const active = {
            ...wall.active,
            invalidated: true,
            invalidatedAt: ctx.now,
            invalidReason: "stale_feed",
          }
          ctx.setState({
            ...state,
            wall: {
              ...wall,
              bidCandidate: null,
              askCandidate: null,
              active,
            },
          })
          ctx.emit(
            "wall_stale_feed",
            wall.active.ownsPosition
              ? "Order-book data stayed stale for five seconds; forcing an exit."
              : "Order-book data is stale; cancelling the resting entry.",
            wallEventData(active, "stale_feed")
          )
          return
        }
      }
      if (state.exitRequested) return
      const hit = tickExit(protectionFor(pos.szi), pos, state, Number(ctx.mid))
      if (!hit) return
      ctx.setState({
        ...state,
        pendingAction: null,
        exitRequested: true,
        ...(wall?.active
          ? {
              wall: {
                ...wall,
                active: {
                  ...wall.active,
                  invalidated: true,
                  invalidatedAt: ctx.now,
                  invalidReason: hit,
                },
              },
            }
          : {}),
      })
      ctx.emit(
        "exit",
        `${hit === "tp" ? "Take profit" : "Stop loss"} hit at ${ctx.mid}.`
      )
    },
    onFill: (ctx, _params, fill) => {
      let next = ctx.state
      const wall = next.wall
      if (wall?.active && fill.purpose === WALL_ENTRY_PURPOSE) {
        const remainingSz = Number(fill.remainingSz)
        const active = {
          ...wall.active,
          filledSz: Math.max(
            wall.active.filledSz,
            wall.active.entrySz - remainingSz
          ),
          remainingSz,
          ownsPosition: true,
          entryComplete: fill.orderStatus === "filled" || remainingSz <= 0,
        }
        next = { ...next, wall: { ...wall, active } }
        emitWallFillEvidence(ctx, wall.active, active)
      }
      if (wall?.active && fill.purpose === WALL_ENTRY_PURPOSE) {
        ctx.setState(next)
      } else if (!ctx.position) {
        const active = next.wall?.active
        ctx.setState({
          ...next,
          pendingAction: null,
          exitRequested: false,
          trail: null,
          stopLevelPx: null,
          ...(next.wall
            ? {
                wall: {
                  ...next.wall,
                  active: null,
                  blockedWall: active?.ownsPosition
                    ? { side: active.wall.side, px: active.wall.px }
                    : next.wall.blockedWall,
                },
              }
            : {}),
        })
      } else if (next !== ctx.state) {
        ctx.setState(next)
      }
    },
    onOrderPlaced: (ctx, _params, order, status, remainingSz) => {
      const active = ctx.state.wall?.active
      if (order.purpose !== WALL_ENTRY_PURPOSE || !active) return
      if (ctx.state.wall) {
        ctx.setState({
          ...ctx.state,
          wall: {
            ...ctx.state.wall,
            active: {
              ...active,
              entryComplete: status === "filled",
              remainingSz: status === "filled" ? 0 : Number(remainingSz),
            },
          },
        })
      }
      if (status === "resting") {
        ctx.emit(
          "wall_entry_resting",
          "Post-only entry is resting in front of the wall.",
          wallEventData(active, status)
        )
      }
    },
    onOrderRejected: (ctx, _params, order) => {
      const wall = ctx.state.wall
      if (order.purpose !== WALL_ENTRY_PURPOSE || !wall?.active) return
      const active = {
        ...wall.active,
        rejectedBookSequence: wall.bookSequence,
      }
      ctx.setState({ ...ctx.state, wall: { ...wall, active } })
      ctx.emit(
        "wall_post_only_rejected",
        "Post-only entry was rejected; waiting for a new book snapshot.",
        wallEventData(active, "post_only_rejected")
      )
    },
    onOrderCancelled: (ctx, _params, order, cancelled) => {
      const active = ctx.state.wall?.active
      if (order.purpose !== WALL_ENTRY_PURPOSE || !active) return
      ctx.emit(
        "wall_entry_cancelled",
        cancelled
          ? "Cancelled the invalid Whale Wall entry."
          : "The entry could not be cancelled before its exchange state changed.",
        wallEventData(active, cancelled ? "cancelled" : "cancel_race")
      )
      if (cancelled && !active.ownsPosition && ctx.state.wall) {
        ctx.setState({
          ...ctx.state,
          wall: {
            ...ctx.state.wall,
            bidCandidate: null,
            askCandidate: null,
            active: null,
          },
        })
      }
    },
    onOrderUpdate: (ctx, _params, order, status, remainingSz) => {
      const wall = ctx.state.wall
      if (order.purpose !== WALL_ENTRY_PURPOSE || !wall?.active) return
      let active: ActiveWall = {
        ...wall.active,
        remainingSz: Number(remainingSz),
      }
      if (status === "partially_filled" || status === "filled") {
        active = {
          ...active,
          filledSz: Math.max(
            active.filledSz,
            active.entrySz - Number(remainingSz)
          ),
          ownsPosition: true,
          entryComplete: status === "filled",
          remainingSz: status === "filled" ? 0 : Number(remainingSz),
        }
        emitWallFillEvidence(ctx, wall.active, active)
      } else if (status === "cancelled") {
        active = {
          ...active,
          invalidated: true,
          invalidatedAt: active.invalidatedAt ?? ctx.now,
          invalidReason: active.invalidReason ?? "exchange_cancelled",
        }
        ctx.emit(
          "wall_entry_cancelled",
          "The exchange cancelled the Whale Wall entry.",
          wallEventData(active, "exchange_cancelled")
        )
      } else if (status === "rejected") {
        active = { ...active, rejectedBookSequence: wall.bookSequence }
        ctx.emit(
          "wall_post_only_rejected",
          "The exchange rejected the post-only Whale Wall entry.",
          wallEventData(active, "exchange_rejected")
        )
      }
      ctx.setState({ ...ctx.state, wall: { ...wall, active } })
    },
    exitTriggers: (ctx) => {
      const pos = position(ctx)
      return exitLevels(protectionFor(pos.szi), pos, ctx.state)
    },
    desiredOrders: (ctx) => {
      let wall = ctx.state.wall
      if (wall?.active && ctx.state.pendingAction?.action === "close") {
        wall = {
          ...wall,
          active: {
            ...wall.active,
            invalidated: true,
            invalidatedAt: ctx.now,
            invalidReason: "close_signal",
          },
        }
        ctx.setState({
          ...ctx.state,
          pendingAction: null,
          exitRequested: false,
          wall,
        })
      }
      if (wall?.active) {
        const active = wall.active
        if (active.invalidated) {
          if (!active.ownsPosition || !ctx.position) return []
          if (
            active.lastCloseAttemptAt !== null &&
            ctx.now - active.lastCloseAttemptAt < WALL_EXIT_RETRY_MS
          ) {
            return []
          }
          const nextActive = { ...active, lastCloseAttemptAt: ctx.now }
          ctx.setState({ ...ctx.state, wall: { ...wall, active: nextActive } })
          if (active.lastCloseAttemptAt === null) {
            ctx.emit(
              "wall_forced_exit",
              "Closing the filled position because its Whale Wall is no longer valid.",
              wallEventData(active, active.invalidReason ?? "invalidated")
            )
          }
          return [
            marketOrder(
              WALL_EXIT_PURPOSE,
              Number(ctx.position.szi) > 0 ? "sell" : "buy",
              Math.abs(Number(ctx.position.szi)),
              true
            ),
          ]
        }
        if (
          active.entryComplete ||
          active.rejectedBookSequence === wall.bookSequence
        ) {
          return []
        }
        return [
          {
            purpose: WALL_ENTRY_PURPOSE,
            side: active.action === "buy" ? "buy" : "sell",
            orderType: "limit",
            px: String(active.entryPx),
            sz: String(active.remainingSz),
            tif: "Alo",
            reduceOnly: false,
            sizeIsRemaining: true,
          },
        ]
      }
      const action = ctx.state.exitRequested
        ? ({ action: "close" } as const)
        : ctx.state.pendingAction
      if (!action) return []
      ctx.setState({
        ...ctx.state,
        pendingAction: null,
        exitRequested: false,
      })
      return automationTargetOrders({
        mid: Number(ctx.mid),
        equity: Number(ctx.equity),
        positionSzi: position(ctx).szi,
        action,
      })
    },
  }
}
