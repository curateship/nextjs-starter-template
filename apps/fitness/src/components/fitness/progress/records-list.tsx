import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { TableSortButton } from "@/components/ui/table"
import type { LiftRecord } from "@/lib/api/fitness/progress"
import { countWords, hardestReached } from "@/lib/fitness/calisthenics"
import { formatDay } from "@/lib/fitness/dates"
import { formatWeight, type WeightUnit } from "@/lib/fitness/weights"
import type { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Column = "name" | "lastDay" | "sessions" | "heaviestKg" | "oneRepMaxKg" | "mostReps"

const NUMBER_COLUMNS = new Set<Column>(["sessions", "heaviestKg", "oneRepMaxKg", "lastDay", "mostReps"])

/** The most lifts one chart compares, so each still has a colour of its own. */
const MOST_COMPARED = 4

const TOO_MANY = `Compare at most ${MOST_COMPARED} lifts at once, so each keeps a colour of its own.`

/** Explains the one-rep max wherever it is shown. */
export const ONE_REP_MAX_HINT = "The heaviest you could likely lift once, worked out from your sets."

/** Small capitals over a column, as Tyler drew the Progress tables on 18 Oct 2026. */
const HEAD = "text-xs font-medium tracking-wide text-muted-foreground uppercase"

/**
 * The picked lift's row wears a dark outline with round ends. A table row
 * can't hold a border of its own, so each cell draws its part of it.
 */
const PICKED =
  "shadow-[inset_0_1.5px_0_0_var(--foreground),inset_0_-1.5px_0_0_var(--foreground)] first:rounded-l-lg first:shadow-[inset_1.5px_1.5px_0_0_var(--foreground),inset_0_-1.5px_0_0_var(--foreground)] last:rounded-r-lg last:shadow-[inset_-1.5px_1.5px_0_0_var(--foreground),inset_0_-1.5px_0_0_var(--foreground)]"

/**
 * One row per lift the person has logged, with their best numbers, in the
 * Progress view's Records card. Clicking a lift puts it on the chart and
 * opens it on the right. While comparing, each row has a tick box; ticking
 * two to four draws them together. Columns give way as the panel narrows.
 *
 * A Calisthenics program counts no weight, so its rows show the most reps
 * (or seconds) instead, and mark the hardest version reached in each ladder
 * (Tyler, 21 Oct 2026).
 */
export function RecordsList({
  records,
  unit,
  shownId,
  selection,
  counted = false,
  onShow,
}: {
  records: readonly LiftRecord[]
  unit: WeightUnit
  /** A Calisthenics program: most reps and the hardest version, no weights. */
  counted?: boolean
  /** The lift the chart draws and the right panel shows. */
  shownId: string | null
  /** Set while comparing, and the tick boxes show. */
  selection: ReturnType<typeof useSelection> | null
  onShow: (exerciseId: string) => void
}) {
  const { sort, direction, toggleSort } = useTableSort<Column>("lastDay", "desc", (column) =>
    NUMBER_COLUMNS.has(column) ? "desc" : "asc"
  )

  const rows = React.useMemo(() => {
    const flip = direction === "asc" ? 1 : -1
    return [...records].sort((a, b) => {
      const left = a[sort]
      const right = b[sort]
      const order =
        typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right))
      return order * flip || a.name.localeCompare(b.name)
    })
  }, [direction, records, sort])
  const visibleIds = rows.map((row) => row.exerciseId)
  const hardest = React.useMemo(() => (counted ? hardestReached(records) : new Set<string>()), [counted, records])

  function head(column: Column, label: string, className?: string) {
    return (
      <th
        scope="col"
        className={cn("px-3 py-2.5 text-left font-normal whitespace-nowrap", className)}
        aria-sort={sort === column ? (direction === "asc" ? "ascending" : "descending") : "none"}
      >
        <TableSortButton
          aria-label={label}
          active={sort === column}
          direction={direction}
          className={HEAD}
          onClick={() => toggleSort(column)}
        >
          {label}
        </TableSortButton>
      </th>
    )
  }

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Finish a workout and each lift&apos;s best numbers show here.</p>
  }

  return (
    <div className="@container p-2 pt-0">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Each lift&apos;s best numbers</caption>
        <thead>
          <tr>
            {selection ? (
              <th scope="col" className="w-10 px-3 py-2.5">
                <Checkbox
                  aria-label="Select every lift"
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => {
                    const ticking = visibleIds.some((id) => !selection.selected.has(id))
                    if (ticking && visibleIds.length > MOST_COMPARED) {
                      showErrorToast(TOO_MANY)
                      return
                    }
                    selection.toggleVisible(visibleIds)
                  }}
                />
              </th>
            ) : null}
            {head("name", "Lift", "w-full")}
            {head("lastDay", "Last trained", "hidden @md:table-cell")}
            {head("sessions", "Sessions", "hidden @2xl:table-cell")}
            {counted ? (
              head("mostReps", "Most in a set")
            ) : (
              <>
                {head("heaviestKg", "Heaviest", "hidden @lg:table-cell")}
                {head("oneRepMaxKg", "Best one-rep max")}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => {
            const picked = record.exerciseId === shownId
            const cell = cn("px-3 py-3", picked ? cn("bg-background", PICKED) : "group-hover/row:bg-background/60")
            return (
              <tr
                key={record.exerciseId}
                className="group/row cursor-pointer"
                onClick={() => onShow(record.exerciseId)}
              >
                {selection ? (
                  <td className={cell}>
                    <Checkbox
                      aria-label={`Select ${record.name}`}
                      checked={selection.selected.has(record.exerciseId)}
                      onCheckedChange={() => {
                        if (!selection.selected.has(record.exerciseId) && selection.selected.size >= MOST_COMPARED) {
                          showErrorToast(TOO_MANY)
                          return
                        }
                        selection.toggle(record.exerciseId)
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                ) : null}
                <td className={cn(cell, "w-full max-w-0")}>
                  <button
                    type="button"
                    aria-current={picked ? "true" : undefined}
                    className="block max-w-full truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                    onClick={(event) => {
                      event.stopPropagation()
                      onShow(record.exerciseId)
                    }}
                  >
                    {record.name}
                  </button>
                  {hardest.has(record.exerciseId) ? (
                    <Badge variant="secondary" className="mt-1">
                      Hardest so far
                    </Badge>
                  ) : null}
                </td>
                <td className={cn(cell, "hidden whitespace-nowrap text-muted-foreground @md:table-cell")}>{formatDay(record.lastDay)}</td>
                <td className={cn(cell, "hidden text-muted-foreground tabular-nums @2xl:table-cell")}>{record.sessions}</td>
                {counted ? (
                  <td className={cn(cell, "font-medium whitespace-nowrap tabular-nums")}>
                    {countWords(record.mostReps, record.measure)}
                  </td>
                ) : (
                  <>
                    <td className={cn(cell, "hidden font-medium whitespace-nowrap tabular-nums @lg:table-cell")}>
                      {formatWeight(record.heaviestKg, unit)}
                    </td>
                    <td className={cn(cell, "font-medium whitespace-nowrap tabular-nums")}>{formatWeight(record.oneRepMaxKg, unit)}</td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
