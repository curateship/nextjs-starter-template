import { Meter } from "@/components/ui/meter"
import type { TaskStatus } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/**
 * "14 of 20 done" with a bar. Done means Done; every other status is open,
 * and tasks in the bin don't count. The project's due date left this cell on
 * 19 Oct 2026, when Tyler took it off the Projects table.
 */
export function ProjectProgress({
  counts,
  className,
}: {
  counts: Record<TaskStatus, number>
  className?: string
}) {
  const total = counts.todo + counts.doing + counts.done + counts.stuck
  return (
    <div className={cn("grid min-w-32 gap-1", className)}>
      <Meter
        value={counts.done}
        max={total}
        size="sm"
        tone="positive"
        label="Tasks done"
        valueText={`${counts.done} of ${total} tasks done`}
      />
      <span className="text-xs text-muted-foreground">
        {total ? `${counts.done} of ${total} done` : "No tasks yet"}
      </span>
    </div>
  )
}
