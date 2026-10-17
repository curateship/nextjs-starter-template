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

/** "1 milestone due, 2 projects due", for a square's label read aloud. */
export function deadlineWords(deadlines: readonly { kind: "milestone" | "project" }[]) {
  const milestones = deadlines.filter((deadline) => deadline.kind === "milestone").length
  const projects = deadlines.length - milestones
  const words = [
    milestones ? `${milestones} ${plural(milestones, "milestone")} due` : null,
    projects ? `${projects} ${plural(projects, "project")} due` : null,
  ].filter(Boolean)
  return words.length ? words.join(", ") : null
}

/** "Leo Park and Ben Tester away", for a square's label read aloud. */
export function awayWords(away: { people: readonly { name: string }[] } | undefined) {
  if (!away?.people.length) return null
  const names = away.people.map((person) => person.name)
  const listed = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]
  return `${listed} away`
}
