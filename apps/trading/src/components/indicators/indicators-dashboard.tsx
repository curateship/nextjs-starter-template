import * as React from "react"
import {
  PinIcon,
  PinOffIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { DashboardTable } from "@/components/dashboard-table"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import { saveIndicator } from "@/lib/api/indicators"
import {
  INDICATOR_LABELS,
  indicatorColor,
  indicatorDisplayName,
  indicatorSettingsSummary,
  primaryColorSlot,
  type IndicatorConfig,
} from "@/lib/trading/indicators-config"
import { cn } from "@/lib/utils"

import { OverlaySettingsDialog } from "./indicator-settings-dialog"

type SortColumn = "name" | "type"

/**
 * Overlay-indicator manager: the fixed set the trade chart can draw, with
 * per-account settings persisted to the database. Pinned indicators are the
 * working set the trade chart's Indicators dropdown shows and toggles.
 */
export function IndicatorsDashboard({
  initial,
}: {
  initial: IndicatorConfig[]
}) {
  const [rows, setRows] = React.useState(initial)
  const [prevInitial, setPrevInitial] = React.useState(initial)
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("name")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("asc")
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<{
    tone: "error" | "success"
    text: string
  } | null>(null)

  // Loader re-ran (navigated back): adopt it during render.
  if (prevInitial !== initial) {
    setPrevInitial(initial)
    setRows(initial)
  }

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const sorted = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      // Pinned indicators always float to the top, regardless of the sort column.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (sortColumn === "type")
        return (
          INDICATOR_LABELS[a.type].localeCompare(INDICATOR_LABELS[b.type]) *
          direction
        )
      return (
        indicatorDisplayName(a).localeCompare(indicatorDisplayName(b)) *
        direction
      )
    })
  }, [rows, sortColumn, sortDirection])

  const replaceRow = (next: IndicatorConfig) =>
    setRows((current) =>
      current.map((row) => (row.id === next.id ? next : row))
    )

  const togglePinned = (row: IndicatorConfig) => {
    const next = { ...row, pinned: !row.pinned }
    replaceRow(next)
    setStatus(null)
    void saveIndicator(next).catch(() =>
      setStatus({
        tone: "error",
        text: `Saving ${indicatorDisplayName(next)} failed`,
      })
    )
  }

  const editing = rows.find((row) => row.id === editingId) ?? null

  const sortHead = (label: string, column: SortColumn) => (
    <TableHead column={column === "name" ? "main" : "meta"}>
      <TableSortButton
        active={sortColumn === column}
        direction={sortDirection}
        onClick={() => toggleSort(column)}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )

  return (
    <div className="w-full">
      <DashboardTable
        title="Indicators"
        icon={
          <SlidersHorizontalIcon className="text-muted-foreground" />
        }
        count={rows.length}
        status={status}
        header={
          <TableHeader>
            <TableRow>
              {sortHead("Name", "name")}
              {sortHead("Type", "type")}
              <TableHead column="meta">Settings</TableHead>
              <TableHead column="meta">Color</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sorted.length === 0}
        emptyText="No indicators."
        emptyColSpan={5}
        footer={{ type: "summary", count: sorted.length, label: "indicators" }}
      >
        {sorted.map((row) => (
          <TableRow
            key={row.id}
            className={cn(
              row.pinned && "border-l-2 border-amber-500 bg-amber-500/5"
            )}
          >
            <TableCell column="main">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1.5 font-medium"
                title="Indicator settings"
                onClick={() => setEditingId(row.id)}
              >
                {row.pinned ? (
                  <PinIcon className="size-3.5 shrink-0 fill-amber-500 text-amber-500" />
                ) : null}
                {indicatorDisplayName(row)}
              </button>
            </TableCell>
            <TableCell column="meta">{INDICATOR_LABELS[row.type]}</TableCell>
            <TableCell column="meta" className="text-muted-foreground">
              {indicatorSettingsSummary(row) || "—"}
            </TableCell>
            <TableCell column="meta">
              {row.type === "priceAction" ? (
                "—"
              ) : (
                <span
                  className="inline-block size-3 rounded-full"
                  style={{
                    backgroundColor:
                      (row.type === "ema" ? row.colors?.fast : undefined) ??
                      row.color ??
                      indicatorColor(primaryColorSlot(row), isDark),
                  }}
                />
              )}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={
                    row.pinned
                      ? `Unpin ${indicatorDisplayName(row)}`
                      : `Pin ${indicatorDisplayName(row)}`
                  }
                  title={row.pinned ? "Unpin from trade chart" : "Pin to trade chart"}
                  onClick={() => togglePinned(row)}
                >
                  {row.pinned ? (
                    <PinOffIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <PinIcon className="size-4 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Edit ${indicatorDisplayName(row)}`}
                  title="Settings"
                  onClick={() => setEditingId(row.id)}
                >
                  <SettingsIcon className="size-4 text-muted-foreground" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {editing ? (
        <OverlaySettingsDialog
          indicator={editing}
          open={editingId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingId(null)
          }}
          onSave={async (next) => {
            replaceRow(await saveIndicator(next))
          }}
        />
      ) : null}
    </div>
  )
}
