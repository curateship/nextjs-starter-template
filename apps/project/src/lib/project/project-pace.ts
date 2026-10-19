import { isOverdue } from "@/lib/project/dates"
import type { TaskStatus } from "@/lib/project/rules"

/**
 * A project's status, worked out from its late tasks rather than set by hand
 * (Tyler, 19 Oct 2026: "if there's a certain amount of tasks past due date
 * then give it a status like 'reddot Behind' or '(green) On track'"). It
 * replaced the manual On track, At risk and Off track, whose old values stay
 * in `project_projects.health` and the Activity tab as history. Called
 * "pace" in the code so it never mixes with that old status or a task's.
 */
export type ProjectPace = "on_track" | "slowing" | "behind"

export const PROJECT_PACE_LABEL: Record<ProjectPace, string> = {
  on_track: "On track",
  slowing: "Slowing down",
  behind: "Behind",
}

/** Starts at 1 and 3 for every project (`drizzle/0122_project_pace_rule.sql`) until changed in Project settings. */
type PaceRule = { slowingAt: number; behindAt: number }

/**
 * Late is what the red due date already says: not Done, and the due date (or
 * the "Due by" time) has passed on the reader's own clock.
 */
export function countLate(
  tasks: readonly { dueDate: string | null; dueAt?: string | null; status: TaskStatus }[],
  now = new Date()
) {
  return tasks.filter((task) => isOverdue(task.dueDate, task.status, task.dueAt ?? null, now)).length
}

/** Behind wins where the two numbers are the same, so Slowing down never shows then. */
export function projectPace(late: number, rule: PaceRule): ProjectPace {
  if (late >= rule.behindAt) return "behind"
  if (late >= rule.slowingAt) return "slowing"
  return "on_track"
}
