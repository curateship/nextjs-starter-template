import * as React from "react"

import {
  TradeTableContent,
  type ColumnSpec,
} from "@/components/trade/trade-table"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatClockTime, formatDate } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import {
  ENGINE_ERROR_KEEP,
  type EngineErrorRow,
} from "@/lib/trade/engine-errors"

/**
 * What the trading engine has got wrong, with the time it happened.
 *
 * The card above this one says what the engine is doing now and carries the
 * single newest error on its heartbeat. That was never enough: two failures at
 * 3am and one at 4am left the screen showing the 4am one, so a pattern that
 * repeated every hour looked like one bad moment. This is the same words with
 * their dates, newest first, kept to the last five hundred.
 *
 * The list is read with the page. Nothing here refreshes on its own, because
 * reading the history is the whole feature — there is no alert, no bell and no
 * push behind it.
 */

type ErrorColumn = "when" | "where" | "what"

const ERROR_COLUMNS = [
  { key: "when", label: "When" },
  { key: "where", label: "Where" },
  { key: "what", label: "What happened" },
] as const satisfies readonly ColumnSpec<ErrorColumn>[]

export function EngineErrorsCard({ errors }: { errors: EngineErrorRow[] }) {
  const { sort, direction, toggleSort } = useTableSort<ErrorColumn>(
    "when",
    "desc",
    (column) => (column === "when" ? "desc" : "asc")
  )

  const rows = React.useMemo(() => {
    const valueOf = (row: EngineErrorRow) => {
      switch (sort) {
        case "when":
          return row.lastSeenAt
        case "where":
          return row.source
        case "what":
          return row.message
      }
    }
    return [...errors].sort((left, right) => {
      const compared = valueOf(left).localeCompare(valueOf(right))
      if (compared !== 0) return direction === "asc" ? compared : -compared
      // Two rows written in the same second still need one settled order, or
      // the list shuffles between renders.
      return right.lastSeenAt.localeCompare(left.lastSeenAt)
    })
  }, [direction, errors, sort])

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b p-4">
        <CardTitle>Errors</CardTitle>
        <CardAction className="row-span-1">
          <Badge variant="outline">{errors.length.toLocaleString()}</Badge>
        </CardAction>
      </CardHeader>

      {/* The ceiling goes on the scrolling box, not on the frame around it.
          The viewport is what overflows; capping the frame instead leaves the
          viewport at its full height inside and clips the oldest rows with no
          way to scroll to them. */}
      <TradeTableContent
        viewportClassName="max-h-[26rem]"
        columns={ERROR_COLUMNS}
        rows={rows}
        loading={false}
        failed={false}
        loadingLabel="Loading the engine's errors"
        failedWords="The engine's errors could not be loaded."
        emptyWords={`No errors recorded. The last ${ENGINE_ERROR_KEEP.toLocaleString()} are kept.`}
        stateClassName="flex min-h-24 items-center justify-center text-sm"
        onRetry={() => undefined}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        renderRow={(row) => <ErrorRow key={row.id} row={row} />}
      />
    </Card>
  )
}

/**
 * "Sep 5, 2026, 10:57:54 AM".
 *
 * To the second, because several different failures inside one second is what
 * a bad moment looks like, and three rows all reading 10:57 AM leaves no way
 * to tell which came first.
 */
function stamp(value: string) {
  return `${formatDate(value)}, ${formatClockTime(value, { seconds: true })}`
}

function ErrorRow({ row }: { row: EngineErrorRow }) {
  return (
    <TableRow className="border-b">
      <TableCell column="meta" className="py-2.5 align-top">
        <span className="block whitespace-nowrap tabular-nums">
          {stamp(row.lastSeenAt)}
        </span>
        {row.times > 1 ? (
          <span className="block text-xs text-muted-foreground">
            {row.times.toLocaleString()} times, from {stamp(row.firstSeenAt)}
          </span>
        ) : null}
      </TableCell>
      <TableCell column="mutedMeta" className="py-2.5 align-top">
        {row.source}
      </TableCell>
      <TableCell className="max-w-xl py-2.5 align-top whitespace-normal">
        {/* Named in words, never by colour alone: a warning is a different
            thing from a failure and the row has to say so. */}
        {row.kind === "warning" ? (
          <Badge variant="outline" className="mr-2 align-[1px]">
            Warning
          </Badge>
        ) : null}
        {row.message}
      </TableCell>
    </TableRow>
  )
}
