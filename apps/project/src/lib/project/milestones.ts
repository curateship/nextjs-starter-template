import { todayKey } from "@/lib/project/dates"
import { dayLabel } from "@/lib/project/days"

type MilestoneCounts = { dueDate: string | null; done: number; total: number }

/** Past its date with tasks still open. A milestone with no tasks is never late. */
export function milestoneOverdue(milestone: MilestoneCounts, today = todayKey()) {
  return Boolean(milestone.dueDate) && milestone.done < milestone.total && (milestone.dueDate as string) < today
}

/** "3 of 5 done, Nov 15", or "No tasks yet" until a task is linked from its Plan card. */
export function milestoneLine(milestone: MilestoneCounts) {
  const count = milestone.total ? `${milestone.done} of ${milestone.total} done` : "No tasks yet"
  return milestone.dueDate ? `${count}, ${dayLabel(milestone.dueDate)}` : `${count}, no date`
}
