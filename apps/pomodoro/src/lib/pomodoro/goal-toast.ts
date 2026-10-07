import { toast } from "sonner"

import { plural } from "@/lib/format/plural"

/**
 * One toast for the focus that reaches today's goal. It is called only from a
 * finished focus, with the count before and after it, so loading the page on
 * a day the goal is already met never says it again: a reload reads the count,
 * it does not cross the line. Lowering the goal under today's count is not a
 * finished focus either, so it stays quiet too.
 */
export function announceGoalReached(before: number, after: number, goal: number) {
  if (before >= goal || after < goal) return
  toast.success(
    `Daily goal reached: ${after} ${plural(after, "session")} today.`,
    { id: "daily-goal-reached" }
  )
}
