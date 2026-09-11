import * as React from "react"
import { Link } from "@tanstack/react-router"
import { TargetIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { loadDailyGoal } from "@/lib/api/trade/goal"
import { formatSignedUsd, formatWholeUsd } from "@/lib/trade/format"
import {
  goalLabel,
  goalRemaining,
  goalSource,
  goalTone,
  shortGoalLabel,
  type Goal,
  type GoalProgress,
} from "@/lib/trade/goal"
import { useHiddenPnlClass } from "@/lib/trade/hide-pnl"
import { LOST_MONEY, MADE_MONEY, moneyTone } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

const REFRESH_MS = 15_000

type Read = { goal: Goal; progress: GoalProgress }

/**
 * How today is going against the daily goal, in the top right of every page.
 *
 * Nothing is drawn until the first answer lands, and nothing is drawn at all
 * while the goal is switched off: a button that appears and then vanishes a
 * second later is worse than one that arrives a second late.
 */
function useDailyGoal() {
  const [read, setRead] = React.useState<Read | null>(null)
  const [failed, setFailed] = React.useState(false)

  const refresh = React.useCallback(async () => {
    try {
      setRead(await loadDailyGoal())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  React.useEffect(() => {
    let stopped = false
    let timer: number | null = null
    let inFlight: Promise<void> | null = null

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
    }
    const run = () => {
      clearTimer()
      if (stopped || document.visibilityState !== "visible" || inFlight) return
      inFlight = refresh().finally(() => {
        inFlight = null
        // A tab nobody is looking at asks its exchanges nothing.
        if (stopped || document.visibilityState !== "visible") return
        clearTimer()
        timer = window.setTimeout(run, REFRESH_MS)
      })
    }
    const onVisibilityChange = () => {
      clearTimer()
      if (document.visibilityState === "visible") run()
    }

    run()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      stopped = true
      clearTimer()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refresh])

  return { read, failed, refresh }
}

export default function GoalHeader() {
  const { read, failed, refresh } = useDailyGoal()
  const hiddenPnl = useHiddenPnlClass()
  const [open, setOpen] = React.useState(false)

  if (!read || !read.goal.on) return null

  // **A read that failed shows dashes, never the figures it last had.** The
  // button is money as it stands now; a minute-old total drawn as if it were
  // live is the one thing every figure in this app refuses to do.
  const progress = failed ? unread(read.progress) : read.progress
  const goal = read.goal
  const tone = goalTone(progress)
  const label = goalLabel(progress)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-icon="inline-start"
          data-nav-shape="text"
          aria-label={
            failed ? "Today's goal could not be read" : `Today's goal. ${label}`
          }
        >
          <TargetIcon className="size-3.5" />
          {/* Two figures and a slash at every width. The target icon and the
              button's spoken name carry what it is, so the word is not worth
              the room it took. */}
          <span
            className={cn(
              "font-mono text-xs font-medium tabular-nums",
              tone === "made" ? MADE_MONEY : tone === "lost" ? LOST_MONEY : undefined,
              hiddenPnl
            )}
          >
            {shortGoalLabel(progress)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-70 max-w-[calc(100vw-1rem)]"
      >
        <GoalPanel
          goal={goal}
          progress={progress}
          failed={failed}
          hiddenPnl={hiddenPnl}
          onRetry={() => void refresh()}
          onOpenPnl={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

function GoalPanel({
  goal,
  progress,
  failed,
  hiddenPnl,
  onRetry,
  onOpenPnl,
}: {
  goal: Goal
  progress: GoalProgress
  failed: boolean
  hiddenPnl: string | undefined
  onRetry: () => void
  onOpenPnl: () => void
}) {
  const remaining = goalRemaining(progress)

  return (
    <>
      <PopoverHeader>
        <PopoverTitle>Today&apos;s goal</PopoverTitle>
        <p className="text-xs text-muted-foreground">
          {goalSource(goal, progress.walletsWorth)}
        </p>
      </PopoverHeader>

      {/* Pulled out to the popover's own edges. A line that stops short of
          them reads as a broken one. */}
      <div className="-mx-2.5 grid gap-2 border-t px-2.5 pt-2.5">
        <Figure label="Target" value={money(progress.target)} />
        <Figure
          label="Made today"
          value={money(progress.made)}
          className={hiddenPnl}
        />
        <Figure
          label="Still to go"
          value={remaining === null ? "—" : formatWholeUsd(remaining)}
          className={hiddenPnl}
        />
        <Figure
          label="Open positions"
          value={
            progress.openProfit === null
              ? "—"
              : formatSignedUsd(progress.openProfit)
          }
          className={cn(
            progress.openProfit === null
              ? undefined
              : moneyTone(progress.openProfit),
            hiddenPnl
          )}
        />
      </div>

      {progress.unpricedFills > 0 ? (
        <p className="text-xs text-muted-foreground">
          {progress.unpricedFills === 1
            ? "One trade today has no money on it yet, so it is in no figure above."
            : `${progress.unpricedFills} trades today have no money on them yet, so they are in no figure above.`}
        </p>
      ) : null}

      {progress.missingVenues.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {progress.missingVenues.join(" and ")} did not answer, so nothing held
          there is counted.
        </p>
      ) : null}

      {failed ? (
        <button
          type="button"
          className="text-left text-xs underline"
          onClick={onRetry}
        >
          Today&apos;s goal could not be read. Try again
        </button>
      ) : null}

      <Button type="button" variant="outline" asChild onClick={onOpenPnl}>
        <Link to="/pnl">Open P&amp;L</Link>
      </Button>
    </>
  )
}

function Figure({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn("font-mono tabular-nums", className)}
      >
        {value}
      </span>
    </div>
  )
}

/** Every figure blanked, for a read that did not answer. */
function unread(progress: GoalProgress): GoalProgress {
  return {
    ...progress,
    made: null,
    target: null,
    walletsWorth: null,
    openProfit: null,
  }
}

/** Whole dollars, or a dash when the figure never arrived. */
function money(value: number | null): string {
  return value === null ? "—" : formatWholeUsd(value)
}
