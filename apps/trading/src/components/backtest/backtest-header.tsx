import * as React from "react"
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PlusIcon,
} from "lucide-react"

import type {
  BacktestGroupRun,
  BacktestListItem,
} from "@/lib/api/backtests"
import { IconButton } from "@/components/icon-button"
import { MarkPriceInline } from "@/components/kpi"
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

import { pct, toneClass } from "./backtest-format"

export type MarketOption = { coin: string; markPx: string; prevDayPx: string }

export function BacktestHeader({
  market,
  markets,
  onMarketChange,
  marketReadOnly,
  groupRuns,
  currentRunId,
  markPrice,
  dayChangePct,
  runName,
  strategyLabel,
  dateRangeText,
  runs,
  onSelectRun,
  onViewAll,
  onNewRun,
  inputsOpen,
  onToggleInputs,
  summaryOpen,
  onToggleSummary,
  onBack,
}: {
  market: string
  markets: MarketOption[]
  onMarketChange: (coin: string) => void
  /** Loaded run — the market is fixed; switch via the group tabs instead. */
  marketReadOnly: boolean
  /** Sibling runs (one per market) of the loaded run's group. */
  groupRuns: BacktestGroupRun[]
  currentRunId: string | null
  markPrice: number
  dayChangePct: number | null
  /** Loaded run or draft name, null when browsing without either. */
  runName: string | null
  strategyLabel: string | null
  /** Configured but not executed yet. */
  dateRangeText: string
  runs: BacktestListItem[]
  onSelectRun: (id: string) => void
  onViewAll: () => void
  onNewRun: () => void
  /** "run" = execute a draft across its markets; null once a run is loaded. */
  /** Left inputs rail visibility + toggle. */
  inputsOpen: boolean
  onToggleInputs: () => void
  /** Right summary rail visibility + toggle. */
  summaryOpen: boolean
  onToggleSummary: () => void
  /** Return to the group's run-results dashboard. */
  onBack: () => void
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const filtered = markets
    .filter((row) => row.coin.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 100)

  return (
    <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-2">
      <div className="flex items-center gap-1">
        <IconButton label="Back to run results" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
        </IconButton>
        <IconButton
          label={inputsOpen ? "Hide inputs panel" : "Show inputs panel"}
          onClick={onToggleInputs}
        >
          <PanelLeftIcon className="size-4" />
        </IconButton>
      </div>

      {marketReadOnly ? (
        <span className="text-sm font-bold">{market}</span>
      ) : (
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
      )}

      {groupRuns.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
            >
              {groupRuns.find((run) => run.id === currentRunId)?.market ?? market}
              <ChevronDownIcon className="size-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-72 w-40 overflow-y-auto"
          >
            {groupRuns.map((groupRun) => (
              <DropdownMenuItem
                key={groupRun.id}
                onSelect={() => onSelectRun(groupRun.id)}
                className={cn(
                  "flex items-center justify-between gap-4",
                  groupRun.id === currentRunId && "bg-muted"
                )}
              >
                <span className="text-xs font-medium">{groupRun.market}</span>
                <span
                  className={cn(
                    "font-mono text-[11px]",
                    groupRun.status === "done" && groupRun.netPnlPct !== null
                      ? toneClass(groupRun.netPnlPct)
                      : "text-muted-foreground"
                  )}
                >
                  {groupRun.status === "done" && groupRun.netPnlPct !== null
                    ? pct(groupRun.netPnlPct)
                    : groupRun.status}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <MarkPriceInline markPrice={markPrice} dayChangePct={dayChangePct} />

      <div className="h-6 w-px bg-border" />

      {runName ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{runName}</span>
          {strategyLabel ? (
            <Badge variant="secondary" className="shrink-0 font-medium">
              {strategyLabel}
            </Badge>
          ) : null}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">
          No run loaded — browse the chart or create a New Run
        </span>
      )}

      <div className="flex-1" />

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
        onClick={onNewRun}
      >
        <PlusIcon className="size-3.5" />
        New Run
      </Button>

      <IconButton
        label={summaryOpen ? "Hide summary panel" : "Show summary panel"}
        onClick={onToggleSummary}
      >
        <PanelRightIcon className="size-4" />
      </IconButton>
    </div>
  )
}


function changePct(row: MarketOption): number | null {
  const mark = Number(row.markPx)
  const prev = Number(row.prevDayPx)
  if (!(mark > 0) || !(prev > 0)) return null
  return (mark / prev - 1) * 100
}
