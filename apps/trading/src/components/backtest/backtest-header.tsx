import * as React from "react"
import {
  ChevronDownIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react"

import type { BacktestListItem } from "@/lib/api/backtests"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { pct, price as fmtPrice, toneClass } from "./backtest-format"

export type MarketOption = { coin: string; markPx: string; prevDayPx: string }

export function BacktestHeader({
  market,
  markets,
  onMarketChange,
  markPrice,
  dayChangePct,
  runName,
  strategyLabel,
  isDraft,
  dateRangeText,
  staleHint,
  runs,
  onSelectRun,
  onViewAll,
  onNewRun,
  onRun,
  runAction,
  running,
}: {
  market: string
  markets: MarketOption[]
  onMarketChange: (coin: string) => void
  markPrice: number
  dayChangePct: number | null
  /** Loaded run or draft name, null when browsing without either. */
  runName: string | null
  strategyLabel: string | null
  /** Configured but not executed yet. */
  isDraft: boolean
  dateRangeText: string
  /** Non-null when the loaded results no longer match the chart config. */
  staleHint: string | null
  runs: BacktestListItem[]
  onSelectRun: (id: string) => void
  onViewAll: () => void
  onNewRun: () => void
  onRun: () => void
  /** "run" = first execution of a draft; "rerun" = loaded run's config. */
  runAction: "run" | "rerun" | null
  running: boolean
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const filtered = markets
    .filter((row) => row.coin.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 100)

  return (
    <div className="flex items-center gap-4 border-b px-4 py-2">
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
          >
            <span className="text-sm font-bold">{market}</span>
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <div className="border-b p-2">
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search markets"
              className="h-8 text-xs"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {filtered.map((row) => {
              const change = changePct(row)
              return (
                <button
                  key={row.coin}
                  type="button"
                  onClick={() => {
                    onMarketChange(row.coin)
                    setPickerOpen(false)
                    setSearch("")
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-muted",
                    row.coin === market && "bg-muted"
                  )}
                >
                  <span className="text-xs font-medium">{row.coin}</span>
                  <span
                    className={cn(
                      "font-mono text-[11px]",
                      change !== null ? toneClass(change) : "text-muted-foreground"
                    )}
                  >
                    {change !== null ? pct(change) : "—"}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                No markets
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex flex-col leading-tight">
        <span
          className={cn(
            "font-mono text-base font-semibold",
            dayChangePct !== null ? toneClass(dayChangePct) : undefined
          )}
        >
          {markPrice > 0 ? `$${fmtPrice(markPrice)}` : "—"}
        </span>
        <span
          className={cn(
            "font-mono text-[11px]",
            dayChangePct !== null ? toneClass(dayChangePct) : "text-muted-foreground"
          )}
        >
          {dayChangePct !== null ? `${pct(dayChangePct)} 24h` : "—"}
        </span>
      </div>

      <div className="h-6 w-px bg-border" />

      {runName ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{runName}</span>
          {strategyLabel ? (
            <Badge variant="secondary" className="shrink-0 font-medium">
              {strategyLabel}
            </Badge>
          ) : null}
          {isDraft ? (
            <Badge
              variant="outline"
              className="shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400"
            >
              Draft — not run yet
            </Badge>
          ) : null}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">
          No run loaded — browse the chart or create a New Run
        </span>
      )}

      <div className="flex-1" />

      {staleHint ? (
        <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-400">
          {staleHint}
        </span>
      ) : null}

      <span className="font-mono text-[11px] text-muted-foreground">
        {dateRangeText}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
            Recent <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-[11px]">Recent runs</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {runs.length === 0 ? (
            <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              No runs yet
            </div>
          ) : (
            runs.slice(0, 8).map((run) => (
              <DropdownMenuItem
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">{run.name}</span>
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    run.status !== "done"
                      ? "text-muted-foreground"
                      : run.netPnlPct !== null
                        ? toneClass(run.netPnlPct)
                        : "text-muted-foreground"
                  )}
                >
                  {run.status === "done" && run.netPnlPct !== null
                    ? pct(run.netPnlPct)
                    : run.status}
                </span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onViewAll} className="text-xs">
            View all runs →
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        disabled={running}
        onClick={onNewRun}
      >
        <PlusIcon className="size-3.5" />
        New Run
      </Button>

      {runAction ? (
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={running}
          onClick={onRun}
        >
          {running ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : runAction === "run" ? (
            <PlayIcon className="size-3.5" />
          ) : (
            <RotateCcwIcon className="size-3.5" />
          )}
          {runAction === "run" ? "Run Backtest" : "Re-run Backtest"}
        </Button>
      ) : null}
    </div>
  )
}

function changePct(row: MarketOption): number | null {
  const mark = Number(row.markPx)
  const prev = Number(row.prevDayPx)
  if (!(mark > 0) || !(prev > 0)) return null
  return (mark / prev - 1) * 100
}
