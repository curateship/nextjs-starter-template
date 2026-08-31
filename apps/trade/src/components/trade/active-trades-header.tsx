import * as React from "react"
import {
  CandlestickChartIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
} from "lucide-react"

import { ActiveTradesWidget } from "@/components/trade/active-trades-widget"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  loadActiveTradesHeader,
  saveHeaderProfitVisibility,
} from "@/lib/api/trade/active-trades-header"
import type { AppHeaderActionProps } from "@/lib/app-options"
import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"
import {
  mergeActiveTradesSnapshot,
  summarizeActiveTrades,
} from "@/lib/trade/dashboard/active-trades"
import { formatWholeUsd } from "@/lib/trade/format"
import {
  listenForHeaderProfitVisibility,
  publishHeaderProfitVisibility,
} from "@/lib/trade/header-profit-visibility"
import { moneyTone } from "@/lib/trade/money-tone"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const REFRESH_MS = 15_000
const HOVER_CLOSE_MS = 180

function signedWholeUsd(value: number) {
  if (value === 0) return "$0"
  return `${value > 0 ? "+" : ""}${formatWholeUsd(value)}`
}

function headerFigures(snapshot: ActiveTradesSnapshot) {
  if (snapshot.activeTradesUnavailable.length) return null
  if (snapshot.activeTrades.length === 0) {
    return { value: "$0", profit: "$0", profitValue: 0 }
  }
  const summary = summarizeActiveTrades(snapshot.activeTrades)
  if (summary.totalValue === null || summary.totalProfit === null) return null
  return {
    value: formatWholeUsd(summary.totalValue),
    profit: signedWholeUsd(summary.totalProfit),
    profitValue: summary.totalProfit,
  }
}

function useActiveTradesHeader() {
  const [snapshot, setSnapshot] = React.useState<ActiveTradesSnapshot | null>(
    null
  )
  const [failed, setFailed] = React.useState(false)
  const [profitVisible, setProfitVisible] = React.useState(true)
  const requestRef = React.useRef<Promise<void> | null>(null)
  const visibilityVersion = React.useRef(0)
  const writeQueue = React.useRef(Promise.resolve())

  const refresh = React.useCallback(() => {
    if (requestRef.current) return requestRef.current
    const version = visibilityVersion.current
    const request = (async () => {
      try {
        const fresh = await loadActiveTradesHeader()
        setSnapshot((was) =>
          was
            ? mergeActiveTradesSnapshot(was, fresh.snapshot)
            : fresh.snapshot
        )
        if (visibilityVersion.current === version) {
          setProfitVisible(fresh.headerProfitVisible)
        }
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

  React.useEffect(
    () =>
      listenForHeaderProfitVisibility((visible) => {
        visibilityVersion.current += 1
        setProfitVisible(visible)
      }),
    []
  )

  const updateProfitVisibility = React.useCallback((visible: boolean) => {
    visibilityVersion.current += 1
    setProfitVisible(visible)
    publishHeaderProfitVisibility(visible)
    const pending = writeQueue.current.then(() =>
      saveHeaderProfitVisibility(visible)
    )
    writeQueue.current = pending.then(
      () => undefined,
      () => undefined
    )
    void pending.catch(() =>
      showErrorToast("The header profit choice could not be saved. Try again.")
    )
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

  return {
    snapshot,
    failed,
    refresh,
    profitVisible,
    updateProfitVisibility,
  }
}

function AdminActiveTradesHeader() {
  const {
    snapshot,
    failed,
    refresh,
    profitVisible,
    updateProfitVisibility,
  } = useActiveTradesHeader()
  const [open, setOpen] = React.useState(false)
  const closeTimer = React.useRef<number | null>(null)
  const hoverOpen = React.useRef(false)
  const figures = snapshot ? headerFigures(snapshot) : null

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }, [])
  const closeSoon = React.useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS)
  }, [cancelClose])

  React.useEffect(() => cancelClose, [cancelClose])

  React.useEffect(() => {
    if (!open) return
    const onPointerMove = (event: PointerEvent) => {
      if (!hoverOpen.current) return
      const target = event.target
      if (
        target instanceof Element &&
        (target.closest("[data-active-trades-header-trigger]") ||
          target.closest('[data-slot="popover-content"]'))
      ) {
        cancelClose()
        return
      }
      closeSoon()
    }
    document.addEventListener("pointermove", onPointerMove)
    return () => document.removeEventListener("pointermove", onPointerMove)
  }, [cancelClose, closeSoon, open])

  const label = figures
    ? profitVisible
      ? `Active trades, ${figures.value} in trades, ${figures.profit} profit and loss`
      : `Active trades, ${figures.value} in trades, profit and loss hidden`
    : failed
      ? "Active trades could not be read"
      : "Reading active trades"

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        hoverOpen.current = false
        cancelClose()
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-icon="inline-start"
          data-nav-shape="text"
          data-active-trades-header-trigger
          aria-label={label}
          onMouseEnter={() => {
            hoverOpen.current = true
            cancelClose()
            setOpen(true)
          }}
          onMouseLeave={closeSoon}
        >
          {snapshot ? (
            <CandlestickChartIcon className="size-3.5" />
          ) : (
            <Loader2Icon className="size-3.5 animate-spin" />
          )}
          <span className="font-mono text-xs tabular-nums">
            {figures?.value ?? "—"}
          </span>
          {profitVisible ? (
            <span
              className={cn(
                "font-mono text-xs font-medium tabular-nums",
                figures
                  ? moneyTone(figures.profitValue)
                  : "text-muted-foreground"
              )}
            >
              {figures?.profit ?? "—"}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="h-[min(32rem,calc(100vh-5rem))] w-max max-w-[calc(100vw-1rem)] gap-0 p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={cancelClose}
        onMouseLeave={closeSoon}
      >
        {snapshot ? (
          <ActiveTradesWidget
            overview={snapshot}
            className="w-max max-w-full rounded-[inherit] bg-popover shadow-none ring-0 [&_[data-slot=table-container]]:w-max [&_table]:w-max"
            onTradeOpen={() => setOpen(false)}
            headerAction={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={
                      profitVisible
                        ? "Hide header profit and loss"
                        : "Show header profit and loss"
                    }
                    aria-pressed={!profitVisible}
                    onClick={() => updateProfitVisibility(!profitVisible)}
                  >
                    {profitVisible ? (
                      <EyeIcon className="size-4" />
                    ) : (
                      <EyeOffIcon className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {profitVisible
                    ? "Hide header profit and loss"
                    : "Show header profit and loss"}
                </TooltipContent>
              </Tooltip>
            }
          />
        ) : failed ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Active trades could not be read.{" "}
            <button
              type="button"
              className="ml-1 underline"
              onClick={() => void refresh()}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Reading active trades
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export default function ActiveTradesHeader({ role }: AppHeaderActionProps) {
  return role === "admin" ? <AdminActiveTradesHeader /> : null
}
