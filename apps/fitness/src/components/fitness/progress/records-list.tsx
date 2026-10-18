import * as React from "react"
import { InfoIcon } from "lucide-react"

import { SelectAllTableHead } from "@/components/shared/sortable-table-header"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSortButton } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { LiftRecord } from "@/lib/api/fitness/progress"
import { formatDay } from "@/lib/fitness/dates"
import { formatWeight, type WeightUnit } from "@/lib/fitness/weights"
import type { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"

type Column = "name" | "lastDay" | "sessions" | "heaviestKg" | "oneRepMaxKg"

const NUMBER_COLUMNS = new Set<Column>(["sessions", "heaviestKg", "oneRepMaxKg", "lastDay"])

/** The most lifts one chart compares, so each still has a colour of its own. */
export const MOST_COMPARED = 4

/** Explains the one-rep max wherever it is shown. */
export const ONE_REP_MAX_HINT = "The heaviest you could likely lift once, worked out from your sets."

/**
 * One row per lift the person has logged, with their best numbers. Sits
 * straight on the Progress view's panel, the way Project's List sits on its
 * project page. Clicking a lift puts it on the chart and opens it on the
 * right; ticking two to four and pressing Compare (in the view's toolbar)
 * draws them together. Columns give way as the panel narrows.
 */
export function RecordsList({
  records,
  query,
  unit,
  shownId,
  selection,
  onShow,
}: {
  records: readonly LiftRecord[]
  query: string
  unit: WeightUnit
  /** The lift the chart draws and the right panel shows. */
  shownId: string | null
  selection: ReturnType<typeof useSelection>
  onShow: (exerciseId: string) => void
}) {
  const { sort, direction, toggleSort } = useTableSort<Column>("lastDay", "desc", (column) =>
    NUMBER_COLUMNS.has(column) ? "desc" : "asc"
  )

  const rows = React.useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const filtered = records.filter((record) => words.every((word) => record.name.toLowerCase().includes(word)))
    const flip = direction === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      const left = a[sort]
      const right = b[sort]
      const order =
        typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right))
      return order * flip || a.name.localeCompare(b.name)
    })
  }, [direction, query, records, sort])
  const visibleIds = rows.map((row) => row.exerciseId)

  function head(column: Column, label: string, className?: string, hint?: string) {
    return (
      <TableHead
        column={column === "name" ? "main" : "meta"}
        className={className}
        aria-sort={sort === column ? (direction === "asc" ? "ascending" : "descending") : "none"}
      >
        <span className="flex items-center gap-1.5">
          <TableSortButton
            aria-label={label}
            active={sort === column}
            direction={direction}
            onClick={() => toggleSort(column)}
          >
            {label}
          </TableSortButton>
          {hint ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${label}`}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <InfoIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{hint}</TooltipContent>
            </Tooltip>
          ) : null}
        </span>
      </TableHead>
    )
  }

  return (
    <section className="@container grid gap-2 border-b py-3" aria-label="Records">
      <h3 className="px-3 text-sm font-semibold">
        Records <span className="font-normal text-muted-foreground">· {records.length} {records.length === 1 ? "lift" : "lifts"}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="px-3 text-sm text-muted-foreground">
          {records.length === 0
            ? "Finish a workout and each lift's best numbers show here."
            : "No lift matches that search."}
        </p>
      ) : (
        <Table containerClassName="overflow-visible">
          <TableHeader>
            <TableRow>
              <SelectAllTableHead
                noun="lifts"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
              {head("name", "Lift")}
              {head("lastDay", "Last trained", "hidden @md:table-cell")}
              {head("sessions", "Sessions", "hidden @2xl:table-cell")}
              {head("heaviestKg", "Heaviest", "hidden @lg:table-cell")}
              {head("oneRepMaxKg", "Best one-rep max", undefined, ONE_REP_MAX_HINT)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((record) => (
              <TableRow
                key={record.exerciseId}
                rowAction={() => onShow(record.exerciseId)}
                data-state={record.exerciseId === shownId ? "selected" : undefined}
              >
                <TableCell column="select">
                  <Checkbox
                    aria-label={`Select ${record.name}`}
                    checked={selection.selected.has(record.exerciseId)}
                    onCheckedChange={() => selection.toggle(record.exerciseId)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </TableCell>
                <TableCell column="main">
                  <button
                    type="button"
                    aria-current={record.exerciseId === shownId ? "true" : undefined}
                    className="font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                    onClick={(event) => {
                      event.stopPropagation()
                      onShow(record.exerciseId)
                    }}
                  >
                    {record.name}
                  </button>
                </TableCell>
                <TableCell column="meta" className="hidden @md:table-cell">
                  {formatDay(record.lastDay)}
                </TableCell>
                <TableCell column="meta" className="hidden tabular-nums @2xl:table-cell">
                  {record.sessions}
                </TableCell>
                <TableCell column="meta" className="hidden tabular-nums @lg:table-cell">
                  {formatWeight(record.heaviestKg, unit)}
                </TableCell>
                <TableCell column="meta" className="tabular-nums">
                  {formatWeight(record.oneRepMaxKg, unit)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
