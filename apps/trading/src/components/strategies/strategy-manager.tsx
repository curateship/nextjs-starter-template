import * as React from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { StrategyEditorDialog } from "@/components/strategies/strategy-editor"
import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  deleteStrategy,
  loadStrategies,
  type StrategyListItem,
} from "@/lib/api/strategies"
import {
  strategySummary,
  strategyTypeDescription,
  strategyTypeLabel,
  strategyTypeOf,
} from "@/lib/strategies/strategy-config"

/**
 * The strategies library — the new model's home page. A strategy is one
 * indicator + one settings block; bots pick from this list and snapshot the
 * config at creation.
 */
export function StrategyManager({ initial }: { initial: StrategyListItem[] }) {
  const [strategies, setStrategies] = React.useState(initial)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [target, setTarget] = React.useState<StrategyListItem | null>(null)

  const refresh = React.useCallback(async () => {
    const { strategies: rows } = await loadStrategies()
    setStrategies(rows)
  }, [])

  return (
    <>
      <DashboardTable
        title="Strategies"
        count={strategies.length}
        controls={
          <DashboardToolbarButton
            onClick={() => {
              setTarget(null)
              setEditorOpen(true)
            }}
          >
            <PlusIcon className="size-4" />
            New Strategy
          </DashboardToolbarButton>
        }
        footer={{ type: "summary", count: strategies.length, label: "strategies" }}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Strategy</TableHead>
              <TableHead column="meta">Type</TableHead>
              <TableHead column="meta">Timeframe</TableHead>
              <TableHead column="meta">Settings</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={strategies.length === 0}
        emptyText="No strategies yet. A strategy is an indicator plus one settings block — create your first."
        emptyColSpan={5}
      >
        {strategies.map((item) => (
          <TableRow key={item.id}>
            <TableCell column="main">
              <button
                type="button"
                className="text-left font-medium hover:underline"
                title={`Edit ${item.name}`}
                onClick={() => {
                  setTarget(item)
                  setEditorOpen(true)
                }}
              >
                {item.name}
              </button>
              <div className="text-xs text-muted-foreground">
                {strategyTypeDescription(strategyTypeOf(item.config))}
              </div>
            </TableCell>
            <TableCell column="meta">
              <Badge variant="secondary">
                {strategyTypeLabel(strategyTypeOf(item.config))}
              </Badge>
            </TableCell>
            <TableCell column="meta">{item.config.interval}</TableCell>
            <TableCell column="mutedMeta">{strategySummary(item.config)}</TableCell>
            <TableCell column="meta">
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit strategy"
                  onClick={() => {
                    setTarget(item)
                    setEditorOpen(true)
                  }}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  aria-label="Delete strategy"
                  onClick={() => {
                    void deleteStrategy(item.id).then(refresh)
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <StrategyEditorDialog
        open={editorOpen}
        target={target}
        onOpenChange={setEditorOpen}
        onSaved={() => void refresh()}
      />
    </>
  )
}
