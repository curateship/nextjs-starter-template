import type { TaskCard } from "@/lib/api/project/tasks"

/** How many tasks the check-in suggests at most. */
export const SUGGESTED_PICKS = 5

/**
 * Why a task is worth picking today, best first: past its due day, due
 * today, already in Doing, or High priority. Null when none of them holds.
 */
function reasonRank(task: TaskCard, today: string) {
  if (task.dueDate && task.dueDate < today) return 0
  if (task.dueDate === today) return 1
  if (task.status === "doing") return 2
  if (task.priority === "high") return 3
  return null
}

/**
 * The check-in's "Suggested for today", from the person's own open tasks.
 * Stuck tasks, tasks still waiting on others, and tasks handed over but not
 * yet accepted are never suggested, because they can't be worked on today.
 * Ties go to the earlier due day, then the project's own order.
 */
export function suggestPicks(tasks: TaskCard[], today: string): TaskCard[] {
  return tasks
    .filter((task) => task.status !== "stuck" && !task.waiting && !(task.waitingOn && !task.waitingOn.ready))
    .flatMap((task) => {
      const rank = reasonRank(task, today)
      return rank === null ? [] : [{ task, rank }]
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999") ||
        a.task.position - b.task.position
    )
    .slice(0, SUGGESTED_PICKS)
    .map(({ task }) => task)
}
