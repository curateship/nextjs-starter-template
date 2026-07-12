import * as React from "react"
import { PinIcon, PinOffIcon, SettingsIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { StrategySettingsDialog } from "@/components/strategies/strategy-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  saveStrategySettings,
  type FixedStrategyItem,
} from "@/lib/api/strategies"
import { strategySummary } from "@/lib/strategies/strategy-config"
import { cn } from "@/lib/utils"

/** The seven fixed strategies. Settings and named templates live under each row. */
export function StrategyManager({ initial }: { initial: FixedStrategyItem[] }) {
  const [strategies, setStrategies] = React.useState(initial)
  const [targetType, setTargetType] = React.useState<
    FixedStrategyItem["type"] | null
  >(null)
  const [status, setStatus] = React.useState<{
    tone: "error" | "success"
    text: string
  } | null>(null)
  const target =
    strategies.find((strategy) => strategy.type === targetType) ?? null

  const updateStrategy = (next: FixedStrategyItem) => {
    setStrategies((current) =>
      current.map((strategy) =>
        strategy.type === next.type ? next : strategy
      )
    )
  }

  const sorted = React.useMemo(
    () => [...strategies].sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [strategies]
  )

  const togglePinned = (strategy: FixedStrategyItem) => {
    const next = { ...strategy, pinned: !strategy.pinned }
    updateStrategy(next)
    setStatus(null)
    void saveStrategySettings({
      strategyType: next.type,
      config: next.config,
      pinned: next.pinned,
    }).catch(() =>
      setStatus({ tone: "error", text: `Saving ${next.label} failed` })
    )
  }

  return (
    <>
      <DashboardTable
        title="Strategies"
        count={strategies.length}
        status={status}
        footer={{ type: "summary", count: strategies.length, label: "strategies" }}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Strategy</TableHead>
              <TableHead column="meta">Timeframe</TableHead>
              <TableHead column="meta">Settings</TableHead>
              <TableHead column="meta">Templates</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={false}
        emptyText=""
        emptyColSpan={5}
      >
        {sorted.map((strategy) => (
          <TableRow
            key={strategy.type}
            className={cn(
              strategy.pinned && "border-l-2 border-amber-500 bg-amber-500/5"
            )}
          >
            <TableCell column="main">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-left font-medium hover:underline"
                onClick={() => setTargetType(strategy.type)}
              >
                {strategy.pinned ? (
                  <PinIcon className="size-3.5 shrink-0 fill-amber-500 text-amber-500" />
                ) : null}
                {strategy.label}
              </button>
              <div className="text-xs text-muted-foreground">
                {strategy.description}
              </div>
            </TableCell>
            <TableCell column="meta">{strategy.config.interval}</TableCell>
            <TableCell column="mutedMeta">
              {strategySummary(strategy.config)}
            </TableCell>
            <TableCell column="meta">
              <Badge variant="secondary">{strategy.templates.length}</Badge>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    strategy.pinned
                      ? `Unpin ${strategy.label}`
                      : `Pin ${strategy.label}`
                  }
                  title={
                    strategy.pinned
                      ? "Unpin from trade chart"
                      : "Pin to trade chart"
                  }
                  onClick={() => togglePinned(strategy)}
                >
                  {strategy.pinned ? (
                    <PinOffIcon className="size-3.5 text-muted-foreground" />
                  ) : (
                    <PinIcon className="size-3.5 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${strategy.label} settings`}
                  title="Strategy settings"
                  onClick={() => setTargetType(strategy.type)}
                >
                  <SettingsIcon className="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <StrategySettingsDialog
        open={target !== null}
        strategy={target}
        onOpenChange={(open) => (open ? null : setTargetType(null))}
        onChanged={updateStrategy}
      />
    </>
  )
}
