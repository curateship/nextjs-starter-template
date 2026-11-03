import { dayLabel } from "@/components/travel/new-activity"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableGroupRow,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Activity } from "@/lib/api/travel/trips"
import { boardColumns, formatTimeRange } from "@/lib/travel/board"
import { formatMoney } from "@/lib/travel/rules"
import { cn } from "@/lib/utils"

/**
 * The List tab (task part 18): every activity as a row, grouped under its
 * day, Ideas last. Clicking a row opens it in the right panel, the same as
 * clicking its card on the board.
 */
export function TripListView({ activities }: { activities: Activity[] }) {
  const { page, typesById, openActivity, openActivityId } = useTrip()
  const { trip } = page
  const columns = boardColumns(trip.days, activities)
  const ideas = columns.get("ideas") ?? []
  columns.delete("ideas")
  const groups = [
    ...[...columns.entries()].map(([key, rows], index) => ({ key, label: dayLabel(index + 1, trip.startDate), rows })),
    { key: "ideas", label: "Ideas", rows: ideas },
  ]
  const COLUMNS = 4

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <Table containerClassName="overflow-visible">
        <TableHeader>
          <TableRow>
            <TableHead column="main" className="min-w-48">
              Activity
            </TableHead>
            <TableHead column="preview">Time</TableHead>
            <TableHead column="preview">Type</TableHead>
            <TableHead column="preview">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <GroupRows key={group.key} label={group.label} count={group.rows.length} colSpan={COLUMNS}>
              {group.rows.map((activity) => {
                const type = typeOf(activity, typesById)
                return (
                  <TableRow
                    key={activity.id}
                    data-activity-id={activity.id}
                    aria-current={activity.id === openActivityId || undefined}
                    className={cn(activity.id === openActivityId && "bg-muted/60", activity.done && "text-muted-foreground")}
                    rowAction={() => openActivity(activity.id)}
                  >
                    <TableCell column="main">
                      <span className="flex min-w-0 items-center gap-2">
                        <ActivityTypeIcon type={type} />
                        <span className={cn("truncate font-medium", activity.done && "line-through")}>
                          {activity.title}
                        </span>
                        {activity.nights && activity.nights > 1 ? (
                          <span className="shrink-0 text-xs text-muted-foreground">{activity.nights} nights</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell column="preview" className="tabular-nums">
                      {formatTimeRange(activity.startTime, activity.durationMinutes) ?? ""}
                    </TableCell>
                    <TableCell column="preview">{type?.name ?? ""}</TableCell>
                    <TableCell column="preview" className="tabular-nums">
                      {activity.costCents !== null ? formatMoney(activity.costCents, trip.currency) : ""}
                    </TableCell>
                  </TableRow>
                )
              })}
            </GroupRows>
          ))}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

function GroupRows({
  label,
  count,
  colSpan,
  children,
}: {
  label: string
  count: number
  colSpan: number
  children: React.ReactNode
}) {
  return (
    <>
      {/* Day headings at 14px with 10px above and below, up from the shell's 12px and 6px (Tyler, 3 Nov 2026:
          "this font should be bigger and have more spacing"), in grey ("make it gray color"). Set here, so the
          shell's table row stays as it is. */}
      {/* No count after the day: it read as part of the date (Tyler, 3 Nov 2026: "What is the 3 for?" ... "remove it"). */}
      <TableGroupRow colSpan={colSpan} label={label} className="[&>td]:py-2.5 [&>td]:text-sm [&>td]:text-muted-foreground" />
      {count === 0 ? (
        <TableRow>
          <TableCell colSpan={colSpan} className="text-xs text-muted-foreground">
            Nothing planned
          </TableCell>
        </TableRow>
      ) : (
        children
      )}
    </>
  )
}
