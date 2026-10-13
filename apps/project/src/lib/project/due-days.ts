import { plural } from "@/lib/format/plural"

/** The Team calendar's due tasks grouped by their due date. */
export function dueByDay<T extends { dueDate: string }>(tasks: readonly T[]) {
  const byDay = new Map<string, T[]>()
  for (const task of tasks) byDay.set(task.dueDate, [...(byDay.get(task.dueDate) ?? []), task])
  return byDay
}

/** "3 tasks due", for a square's label read aloud. */
export function dueWords(tasks: readonly unknown[]) {
  return tasks.length ? `${tasks.length} ${plural(tasks.length, "task")} due` : null
}
