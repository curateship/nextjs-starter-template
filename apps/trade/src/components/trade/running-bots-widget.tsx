import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { BotIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  TradeTablePanel,
  type ColumnSpec,
} from "@/components/trade/trade-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import type {
  TradingOverviewBot,
  TradingOverviewBotState,
} from "@/lib/trade/dashboard/overview"
import { formatSignedUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

const STATE_LABELS: Record<TradingOverviewBotState, string> = {
  running: "Running",
  waiting: "Waiting",
  paused: "Paused",
  stopping: "Stopping",
  stopped: "Stopped",
}

const STATE_ORDER: Record<TradingOverviewBotState, number> = {
  running: 0,
  waiting: 1,
  paused: 2,
  stopping: 3,
  stopped: 4,
}

type BotColumn = "automation" | "status" | "markets" | "positions" | "money"

const BOT_COLUMNS = [
  { key: "automation", label: "Automation" },
  { key: "status", label: "Status" },
  { key: "markets", label: "Markets" },
  { key: "positions", label: "Positions" },
  { key: "money", label: "Made or lost" },
] as const satisfies readonly ColumnSpec<BotColumn>[]

function defaultDirection(column: BotColumn) {
  return column === "markets" || column === "positions" || column === "money"
    ? ("desc" as const)
    : ("asc" as const)
}

export function RunningBotsWidget({
  bots,
  className,
}: {
  bots: TradingOverviewBot[]
  className: string
}) {
  const navigate = useNavigate()
  const { sort, direction, toggleSort } = useTableSort<BotColumn>(
    "status",
    "asc",
    defaultDirection
  )
  const rows = React.useMemo(() => {
    const valueOf = (bot: TradingOverviewBot): string | number => {
      switch (sort) {
        case "automation":
          return bot.name
        case "status":
          return STATE_ORDER[bot.state]
        case "markets":
          return bot.marketCount
        case "positions":
          return bot.positionCount
        case "money":
          return bot.netUsd
      }
    }
    return [...bots].sort((left, right) => {
      const a = valueOf(left)
      const b = valueOf(right)
      const compared =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b))
      if (compared !== 0) return direction === "asc" ? compared : -compared
      return right.startedAt - left.startedAt
    })
  }, [bots, direction, sort])
  return (
    <TradeTablePanel
      className={className}
      header={
        <DashboardCardTitleHeader
          className="border-b-0"
          icon={<BotIcon />}
          title={
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">Running bots</span>
              <Badge variant="secondary">{rows.length.toLocaleString()}</Badge>
            </span>
          }
        />
      }
      columns={BOT_COLUMNS}
      rows={rows}
      loading={false}
      failed={false}
      loadingLabel="Loading running bots"
      failedWords="Running bots could not be loaded."
      emptyWords={
        <div className="flex flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">No running bots.</p>
          <Button asChild variant="outline">
            <Link to="/admin/automations">Open the canvas</Link>
          </Button>
        </div>
      }
      stateClassName="flex min-h-36 items-center justify-center"
      onRetry={() => undefined}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      renderRow={(bot) => (
        <BotRow
          key={bot.automationId}
          bot={bot}
          onOpen={() =>
            void navigate({
              to: "/flow-runs/$runId",
              params: { runId: bot.runId },
            })
          }
        />
      )}
    />
  )
}

function BotRow({
  bot,
  onOpen,
}: {
  bot: TradingOverviewBot
  onOpen: () => void
}) {
  const state = STATE_LABELS[bot.state]
  return (
    <TableRow rowAction={onOpen} className="border-b">
      <TableCell column="meta" className="py-2.5">
        <Link
          to="/flow-runs/$runId"
          params={{ runId: bot.runId }}
          className="block max-w-48 truncate rounded-sm text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {bot.name}
        </Link>
      </TableCell>
      <TableCell column="meta" className="py-2.5 text-xs text-muted-foreground">
        <span className="block">{state}</span>
        {bot.statusWords ? (
          <span className="block max-w-64 truncate" title={bot.statusWords}>
            {bot.statusWords}
          </span>
        ) : null}
      </TableCell>
      <TableCell
        column="meta"
        className="py-2.5 text-left font-mono text-xs tabular-nums"
      >
        {bot.marketCount.toLocaleString()}
      </TableCell>
      <TableCell
        column="meta"
        className="py-2.5 text-left font-mono text-xs tabular-nums"
      >
        {bot.positionCount.toLocaleString()}
      </TableCell>
      <TableCell column="meta" className="py-2.5 text-left text-xs">
        <span className={cn("font-medium tabular-nums", moneyTone(bot.netUsd))}>
          {formatSignedUsd(bot.netUsd)}
        </span>
      </TableCell>
    </TableRow>
  )
}
