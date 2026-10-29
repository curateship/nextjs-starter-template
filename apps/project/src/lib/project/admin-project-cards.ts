import { dayLabel, daysBetween } from "@/lib/project/days"
import { countLate, projectPace, type ProjectPace } from "@/lib/project/project-pace"
import type { TaskStatus } from "@/lib/project/rules"

/**
 * The Projects card on the site admin's My dashboard (task "My dashboard/01
 * Project cards", Tyler, 29 Oct 2026): which projects show, in what order,
 * and the due line. The drawing is `admin-project-cards.tsx`.
 */

type CardProject = {
  id: string
  name: string
  counts: Record<TaskStatus, number>
  dated: { dueDate: string; dueAt: string | null; status: TaskStatus }[]
  slowingAt: number
  behindAt: number
}

export type PacedProject<T extends CardProject> = { project: T; late: number; pace: ProjectPace }

export type ProjectCardList<T extends CardProject> = {
  /** Projects with open tasks, as full blocks, in the site admin's order or late first. */
  active: PacedProject<T>[]
  /** Projects with no open tasks, as thin lines under the blocks. */
  idle: PacedProject<T>[]
  /** Projects hidden from the card, by name. */
  hidden: T[]
}

const PACE_RANK: Record<ProjectPace, number> = { behind: 0, slowing: 1, on_track: 2 }

/** To do, Doing and Stuck; Done and Archived are closed. */
export function openTaskCount(counts: Record<TaskStatus, number>) {
  return counts.todo + counts.doing + counts.stuck
}

/**
 * Splits the projects into the card's blocks, its thin lines and its hidden
 * ones. Late projects come first, Behind then Slowing down, the most late
 * first, until the site admin drags their own order; then theirs wins, and a
 * project missing from it goes after the ones in it, late first.
 */
export function projectCardList<T extends CardProject>(
  projects: readonly T[],
  hiddenIds: readonly string[],
  order: readonly string[],
  now = new Date()
): ProjectCardList<T> {
  const hiddenSet = new Set(hiddenIds)
  const place = new Map(order.map((id, index) => [id, index]))
  const paced = projects
    .filter((project) => !hiddenSet.has(project.id))
    .map((project) => {
      const late = countLate(project.dated, now)
      return { project, late, pace: projectPace(late, project) }
    })
    .sort(
      (a, b) =>
        (place.get(a.project.id) ?? Infinity) - (place.get(b.project.id) ?? Infinity) ||
        PACE_RANK[a.pace] - PACE_RANK[b.pace] ||
        b.late - a.late ||
        a.project.name.localeCompare(b.project.name)
    )
  return {
    active: paced.filter((row) => openTaskCount(row.project.counts) > 0),
    idle: paced.filter((row) => openTaskCount(row.project.counts) === 0),
    hidden: projects
      .filter((project) => hiddenSet.has(project.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/**
 * "Due Nov 20 · 22 days left", "Due today", "Due tomorrow" or "Overdue · Nov
 * 20", counted on the site admin's own today. Null with no due date.
 */
export function projectDueLine(dueDate: string | null, today: string): { text: string; overdue: boolean } | null {
  if (!dueDate) return null
  const left = daysBetween(today, dueDate)
  if (left < 0) return { text: `Overdue · ${dayLabel(dueDate)}`, overdue: true }
  if (left === 0) return { text: "Due today", overdue: false }
  if (left === 1) return { text: "Due tomorrow", overdue: false }
  return { text: `Due ${dayLabel(dueDate)} · ${left} days left`, overdue: false }
}
