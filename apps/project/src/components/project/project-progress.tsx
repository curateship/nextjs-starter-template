import { Meter } from "@/components/ui/meter"
import { formatUtcDate } from "@/lib/format/format-time"
import { todayKey } from "@/lib/project/dates"
import type { TaskStatus } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/**
 * "14 of 20 done" with a bar, and "Due Nov 30" under it. Done means Done; every other
 * status is open, and tasks in the bin don't count. "Overdue" once the date
 * has passed with tasks still open.
 */
export function ProjectProgress({
  counts,
  dueDate,
  className,
}: {
  counts: Record<TaskStatus, number>
  dueDate: string | null
  className?: string
}) {
  const total = counts.todo + counts.doing + counts.done + counts.stuck
  const overdue = Boolean(dueDate) && counts.done < total && (dueDate as string) < todayKey()
  return (
    <div className={cn("grid min-w-32 gap-1", className)}>
      <Meter
        value={counts.done}
        max={total}
        size="sm"
        tone={overdue ? "critical" : "positive"}
        label="Tasks done"
        valueText={`${counts.done} of ${total} tasks done`}
      />
      <span className="text-xs text-muted-foreground">
        {total ? `${counts.done} of ${total} done` : "No tasks yet"}
      </span>
      {dueDate ? (
        <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
          {overdue ? "Overdue · " : ""}Due {formatUtcDate(`${dueDate}T00:00:00Z`)}
        </span>
      ) : null}
    </div>
  )
}
