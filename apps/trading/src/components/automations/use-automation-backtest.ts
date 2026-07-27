import * as React from "react"

import {
  loadBacktest,
  loadBacktestGroupSummary,
  loadLatestAutomationBacktest,
  pollBacktestProgress,
  renameBacktestGroup,
  runBacktest,
  type BacktestDetail,
  type BacktestGroupRun,
  type BacktestProgressItem,
} from "@/lib/api/backtests"
import {
  PREVIOUS_RUN_NAME_PREFIX,
  type BacktestTrade,
  type GroupCombinedCurve,
  type GroupOpenPositions,
} from "@/lib/backtest/types"

import {
  summarizeGroupProgress,
  type BacktestGroupProgress,
} from "./backtest-progress"

const POLL_MS = 2000
const DEFAULT_MARKETS = ["BTC"]

export type AutomationBacktestPhase = "setup" | "running" | "results"

/**
 * State machine for the editor's backtest mode. Instantiated unconditionally
 * so exiting and re-entering the mode resumes where it left off; runs keep
 * draining server-side regardless. Every run is kept — a re-run starts a new
 * group and the previous one simply moves to the history pages.
 */
export function useAutomationBacktest(automationId: string) {
  const [open, setOpen] = React.useState(false)
  const [phase, setPhase] = React.useState<AutomationBacktestPhase>("setup")
  const [selectedMarkets, setSelectedMarkets] =
    React.useState<string[]>(DEFAULT_MARKETS)
  const [days, setDays] = React.useState("30")
  const [error, setError] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [groupId, setGroupId] = React.useState<string | null>(null)
  const [runs, setRuns] = React.useState<BacktestGroupRun[]>([])
  const [runStats, setRunStats] = React.useState<
    Map<string, BacktestProgressItem>
  >(new Map())
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null)
  const [selectedRun, setSelectedRun] = React.useState<BacktestDetail | null>(
    null
  )
  const [selectedRunError, setSelectedRunError] = React.useState(false)
  const [focusedTrade, setFocusedTrade] = React.useState<BacktestTrade | null>(
    null
  )
  /** Current group's name; "Previous run …" names mark it replaceable. */
  const [groupName, setGroupName] = React.useState<string | null>(null)
  /** The whole pot's peak-to-trough drawdown (all markets' equity blended). */
  const [combinedDrawdownPct, setCombinedDrawdownPct] = React.useState<
    number | null
  >(null)
  /** Money in the pot (combined equity) at the moment of that worst drawdown. */
  const [potAtMaxDdUsd, setPotAtMaxDdUsd] = React.useState<number | null>(null)
  /** Every market's equity blended into one curve, for the rail's P&L chart. */
  const [groupCurve, setGroupCurve] = React.useState<GroupCombinedCurve | null>(
    null
  )
  /** Money the basket was still holding when its test window closed. */
  const [openPositions, setOpenPositions] =
    React.useState<GroupOpenPositions | null>(null)
  // Read groupId inside the hydration effect without making it a dep — else
  // the setGroupId the fetch performs would re-run the effect and its cleanup
  // would spuriously cancel the still-pending win-rate fetch nested inside.
  const hydratedRef = React.useRef(false)
  const groupIdRef = React.useRef(groupId)
  React.useEffect(() => {
    groupIdRef.current = groupId
  })
  // Tracks real mount state so the terminal stats fetch can write its result
  // without being cancelled by the poll effect tearing itself down when the
  // run finishes (that teardown is expected — the component is still mounted).
  const mountedRef = React.useRef(true)
  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const progress: BacktestGroupProgress = summarizeGroupProgress(runs)
  const replaceable =
    groupName === null || groupName.startsWith(PREVIOUS_RUN_NAME_PREFIX)

  // First open with nothing loaded: pull the automation's most recent run
  // from the DB, so results survive leaving the editor (or the browser).
  React.useEffect(() => {
    if (!open || groupIdRef.current || hydratedRef.current) return
    hydratedRef.current = true
    let cancelled = false
    void loadLatestAutomationBacktest(automationId)
      .then((latest) => {
        if (cancelled || !latest || latest.runs.length === 0) return
        setGroupId(latest.groupId)
        setGroupName(latest.name)
        setRuns(latest.runs)
        // Remember the last run's markets AND window in the setup form, so "New
        // run" after reopening the editor keeps your basket and days instead of
        // resetting to BTC / 30d.
        const lastMarkets = [...new Set(latest.runs.map((run) => run.market))]
        if (lastMarkets.length > 0) setSelectedMarkets(lastMarkets)
        if (latest.windowDays > 0) setDays(String(latest.windowDays))
        const status = summarizeGroupProgress(latest.runs)
        setPhase(status.allTerminal ? "results" : "running")
        if (status.allTerminal) {
          const done = latest.runs.filter((run) => run.status === "done")
          const ids = done.map((run) => run.id)
          if (ids.length > 0) {
            // Land straight on the first market's chart so opening the mode
            // shows a replay, not an empty market list.
            setSelectedRunId((current) =>
              done.some((run) => run.id === current) ? current : done[0].id
            )
            void pollBacktestProgress(ids)
              .then((items) => {
                if (cancelled) return
                setRunStats(new Map(items.map((item) => [item.id, item])))
              })
              .catch(() => {})
          }
        }
      })
      .catch(() => {
        // Transient — the setup form still works; a run refreshes everything.
      })
    return () => {
      // Re-arm the guard so a genuine re-open (or dev double-mount) retries;
      // this cleanup fires only on unmount, close, or automation change now
      // that groupId is no longer a dep.
      cancelled = true
      hydratedRef.current = false
    }
  }, [open, automationId])

  // Poll the group while it runs; on terminal, fetch per-run stats (win rate
  // for the market list).
  React.useEffect(() => {
    if (!open || phase !== "running" || !groupId) return
    let cancelled = false
    const finish = (finished: BacktestGroupRun[]) => {
      setPhase("results")
      const done = finished.filter((run) => run.status === "done")
      const ids = done.map((run) => run.id)
      if (ids.length > 0) {
        // A fresh run (or a re-run) lands on its group's first market — the
        // old selection belongs to the replaced group, so switch off it.
        setSelectedRunId((current) =>
          done.some((run) => run.id === current) ? current : done[0].id
        )
        void pollBacktestProgress(ids)
          .then((items) => {
            if (!mountedRef.current) return
            setRunStats(new Map(items.map((item) => [item.id, item])))
          })
          .catch(() => {})
      }
    }
    const poll = () => {
      if (document.visibilityState !== "visible") return
      void loadBacktest(groupId)
        .then((response) => {
          if (cancelled) return
          setRuns(response.groupRuns)
          if (summarizeGroupProgress(response.groupRuns).allTerminal) {
            cancelled = true
            clearInterval(timer)
            finish(response.groupRuns)
          }
        })
        .catch(() => {
          // Transient load errors: keep polling; the queue is unaffected.
        })
    }
    const timer = setInterval(poll, POLL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    poll()
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [open, phase, groupId])

  // Load the selected market's full run for the chart + trades + KPIs.
  React.useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null)
      setSelectedRunError(false)
      return
    }
    let cancelled = false
    setSelectedRunError(false)
    void loadBacktest(selectedRunId)
      .then((response) => {
        if (cancelled) return
        if (response.backtest) setSelectedRun(response.backtest)
        else setSelectedRunError(true)
      })
      .catch(() => {
        if (!cancelled) setSelectedRunError(true)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRunId])

  // The whole pot's combined drawdown — every market's equity blended into one
  // curve, server-side. This is the honest portfolio risk (a single market's
  // worst moment isn't the basket's), so it refreshes whenever results land.
  React.useEffect(() => {
    if (!open || phase !== "results" || !groupId) return
    let cancelled = false
    void loadBacktestGroupSummary(groupId)
      .then((response) => {
        if (cancelled) return
        const metrics = response.groupMetrics[groupId]
        setCombinedDrawdownPct(metrics?.combinedDrawdownPct ?? null)
        setGroupCurve(response.groupCurve)
        setOpenPositions(response.groupOpenPositions)
        // The combined equity at the drawdown trough — how much was in the pot
        // when it was at its worst. Walk the curve to the trough's bar time.
        const at = metrics?.drawdownAt ?? null
        const points = response.groupCurve?.points ?? []
        if (at != null && points.length > 0) {
          let eq = points[0].eq
          for (const point of points) {
            if (point.t <= at) eq = point.eq
            else break
          }
          setPotAtMaxDdUsd(eq)
        } else {
          setPotAtMaxDdUsd(null)
        }
      })
      .catch(() => {
        // Transient — the tile falls back to "—" until a retry succeeds.
      })
    return () => {
      cancelled = true
    }
  }, [open, phase, groupId])

  const enter = React.useCallback(() => setOpen(true), [])
  const exit = React.useCallback(() => setOpen(false), [])

  // Selecting a market always lands on its chart — re-clicking the current
  // market is a no-op, never a toggle back to an empty (canvas) center.
  const selectRun = React.useCallback((runId: string | null) => {
    setFocusedTrade(null)
    setSelectedRunId((current) => (current === runId ? current : runId))
  }, [])

  const start = React.useCallback(
    async (windowDays: number) => {
      if (starting) return
      setStarting(true)
      setError(null)
      try {
        const { backtestId } = await runBacktest({
          automationId,
          market: selectedMarkets[0],
          extraMarkets: selectedMarkets.slice(1),
          windowDays,
        })
        setGroupId(backtestId)
        setGroupName(PREVIOUS_RUN_NAME_PREFIX)
        setRuns([])
        setRunStats(new Map())
        // Keep the previous run's chart on screen while the new one computes —
        // clearing the selection here flashed the bare node canvas. The stale
        // run stays loadable; finish() swaps to the new group's first market.
        setFocusedTrade(null)
        setPhase("running")
      } catch (runError) {
        setError(
          runError instanceof Error
            ? runError.message
            : "Could not start the backtest."
        )
      } finally {
        setStarting(false)
      }
    },
    [automationId, selectedMarkets, starting]
  )

  const newRun = React.useCallback(() => {
    setError(null)
    setPhase("setup")
  }, [])

  const backToResults = React.useCallback(() => {
    if (groupId) setPhase(runs.length > 0 ? "results" : "running")
  }, [groupId, runs.length])

  /** Names the current group — the next run then keeps it. */
  const keep = React.useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!groupId || !trimmed) return
      try {
        await renameBacktestGroup(groupId, trimmed)
        setGroupName(trimmed)
      } catch (renameError) {
        setError(
          renameError instanceof Error
            ? renameError.message
            : "Could not name this run."
        )
      }
    },
    [groupId]
  )

  return {
    open,
    phase,
    selectedMarkets,
    setSelectedMarkets,
    days,
    setDays,
    error,
    setError,
    starting,
    groupId,
    runs,
    runStats,
    progress,
    selectedRunId,
    selectedRun,
    selectedRunError,
    focusedTrade,
    setFocusedTrade,
    groupName,
    combinedDrawdownPct,
    potAtMaxDdUsd,
    groupCurve,
    openPositions,
    replaceable,
    keep,
    enter,
    exit,
    start,
    newRun,
    backToResults,
    selectRun,
  }
}

export type AutomationBacktestState = ReturnType<typeof useAutomationBacktest>
