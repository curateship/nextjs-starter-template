import * as React from "react"
import { CandlestickChartIcon, Loader2Icon } from "lucide-react"

import { ActiveTradesDropdown } from "@/components/trade/active-trades-dropdown"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  loadActiveTradesHeader,
  loadLastHeaderFigures,
} from "@/lib/api/trade/active-trades-header"
import type { AppHeaderActionProps } from "@/lib/app-options"
import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"
import {
  activeTradesFigures,
  mergeActiveTradesSnapshot,
} from "@/lib/trade/dashboard/active-trades"
import { useHiddenPnlClass } from "@/lib/trade/hide-pnl"
import { moneyTone } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

const REFRESH_MS = 15_000

function useActiveTradesHeader() {
  const [snapshot, setSnapshot] = React.useState<ActiveTradesSnapshot | null>(
    null
  )
  // **The button keeps the figures it last had until better ones arrive**
  // (Tyler, 29 Sep 2026). A read where one exchange does not answer has no
  // total to draw, and blanking both figures to dashes for a few seconds made
  // the button flicker empty while nothing was wrong with the trades. Dashes
  // are now only the first read, before any total has ever landed.
  const [figures, setFigures] = React.useState<ReturnType<
    typeof activeTradesFigures
  > | null>(null)
  const [failed, setFailed] = React.useState(false)
  const snapshotRef = React.useRef<ActiveTradesSnapshot | null>(null)
  const requestRef = React.useRef<Promise<void> | null>(null)

  const refresh = React.useCallback(() => {
    if (requestRef.current) return requestRef.current
    const request = (async () => {
      try {
        const fresh = await loadActiveTradesHeader()
        const was = snapshotRef.current
        const merged = was
          ? mergeActiveTradesSnapshot(was, fresh.snapshot)
          : fresh.snapshot
        snapshotRef.current = merged
        setSnapshot(merged)
        const next = activeTradesFigures(merged)
        if (next) setFigures(next)
        setFailed(false)
      } catch {
        setFailed(true)
      }
    })()
    requestRef.current = request
    void request.finally(() => {
      if (requestRef.current === request) requestRef.current = null
    })
    return request
  }, [])

  // The figures the button last managed to say, fetched beside the real read
  // and back in a fraction of the time, because it touches no exchange. Two
  // dashes are now only the very first load of a brand new account — Tyler,
  // 4 October 2026: "Just show the old numbers until theres a new one."
  //
  // Whichever lands first wins, and a real read always beats it: this only
  // ever fills figures that are still empty, so an answer that arrives late
  // can never put an old total back over a fresh one.
  React.useEffect(() => {
    let stopped = false
    void loadLastHeaderFigures()
      .then((last) => {
        if (stopped || !last) return
        setFigures((current) => current ?? last)
      })
      .catch(() => {
        // Nothing to say. The real read is already on its way.
      })
    return () => {
      stopped = true
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
    const schedule = () => {
      if (stopped || document.visibilityState !== "visible") return
      clearTimer()
      timer = window.setTimeout(run, REFRESH_MS)
    }
    const run = () => {
      clearTimer()
      if (stopped || document.visibilityState !== "visible" || inFlight) return
      inFlight = refresh().finally(() => {
        inFlight = null
        schedule()
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

  return { snapshot, figures, failed, refresh }
}

function ActiveTradesHeaderContent() {
  const { snapshot, figures, failed, refresh } = useActiveTradesHeader()
  const hiddenPnl = useHiddenPnlClass()
  // Click to open, click or Escape to close. It used to open on hover and shut
  // itself on a timer a fifth of a second after the pointer left, which meant
  // crossing the header on the way somewhere else threw a panel of trades over
  // the page. Tyler, 4 October 2026.
  const [open, setOpen] = React.useState(false)

  const label = figures
    ? `Active trades, ${figures.value} in trades, ${figures.profit} profit and loss`
    : failed
      ? "Active trades could not be read"
      : "Reading active trades"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-icon="inline-start"
          data-nav-shape="text"
          data-active-trades-header-trigger
          aria-label={label}
        >
          {snapshot ? (
            <CandlestickChartIcon className="size-3.5" />
          ) : (
            <Loader2Icon className="size-3.5 animate-spin" />
          )}
          <span className="font-mono text-xs tabular-nums">
            {figures?.value ?? "—"}
          </span>
          <span
            className={cn(
              "font-mono text-xs font-medium tabular-nums",
              figures ? moneyTone(figures.profitValue) : "text-muted-foreground",
              hiddenPnl
            )}
          >
            {figures?.profit ?? "—"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-144 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {snapshot ? (
          <ActiveTradesDropdown
            snapshot={snapshot}
            // Only here: on the dashboard the same table has the room.
            className={cn(
              "[&_[data-slot=table-container]]:w-full [&_table]:w-full",
              // Tighter cells than the same table gets on a full-width page.
              // Every column here is shrink-to-content and never wraps, so the
              // table is as wide as its content plus five lots of padding, and
              // at the page's `px-5` that came to 621px inside a 576px panel.
              "[&_[data-slot=table-cell]]:px-2.5 [&_[data-slot=table-head]]:px-2.5",
              // The ticker gives way, and nothing else does. Padding alone
              // cannot make this table fit, because the longest coin name sets
              // a floor under it — MARSCOINUSDTM held the panel 4px open even
              // after the padding came off. A clipped ticker is still readable
              // and its full name is on the chart one click away; a clipped
              // figure is money with a digit missing, which is why the P/L
              // column is the one that must never give.
              "[&_tbody_td:first-child]:max-w-36",
              "[&_tbody_td:first-child>span]:min-w-0",
              "[&_tbody_td:first-child_button]:min-w-0 [&_tbody_td:first-child_button]:truncate",
              "[&_tbody_td:first-child>span>span]:truncate"
            )}
            onTradeOpen={() => setOpen(false)}
          />
        ) : failed ? (
          <ErrorRow
            message="Active trades could not be read."
            onRetry={() => void refresh()}
            className="p-4 text-sm"
          />
        ) : (
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Reading active trades
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export default function ActiveTradesHeader(_props: AppHeaderActionProps) {
  return <ActiveTradesHeaderContent />
}
