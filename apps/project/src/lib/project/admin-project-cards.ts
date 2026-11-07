import { dayLabel, daysBetween } from "@/lib/project/days"
import { countLate, projectPace, type ProjectPace } from "@/lib/project/project-pace"
import type { TaskStatus } from "@/lib/project/rules"

/**
 * A Projects block on the site admin's own page on My dashboard (task "My
 * dashboard/left-panel-blocks", Tyler, 6 Nov 2026: "a new "Projects" block
 * where I can select a project with the same functionality as the pinned
 * card"): how far behind its project is, and its due line. The block was a
 * project on the Pinned projects card until that card went the same day. The
 * drawing is `admin-project-cards.tsx`.
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

/** A project with how many of its tasks are late, and so how it's doing: On track, Slowing down or Behind. */
export function pacedProject<T extends CardProject>(project: T, now = new Date()): PacedProject<T> {
  const late = countLate(project.dated, now)
  return { project, late, pace: projectPace(late, project) }
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
