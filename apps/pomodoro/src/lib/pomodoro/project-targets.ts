import {
  formatFocusSpan,
  shiftLocalDate,
  startOfWeek,
} from "@/lib/pomodoro/focus-history"

/**
 * A project's hours target. A target is a number of whole hours each week
 * (Monday to Sunday, the week History uses) or each calendar month. Unused
 * hours never carry into the next period.
 */
export const targetPeriods = ["week", "month"] as const
export type TargetPeriod = (typeof targetPeriods)[number]
export type ProjectTarget = { hours: number; period: TargetPeriod }

export const TARGET_HOURS_MAX = 744

/** The longest project name, the width of `pomodoro_projects.name`. */
export const PROJECT_NAME_MAX_LENGTH = 60

export const targetPeriodLabels: Record<TargetPeriod, string> = {
  week: "a week",
  month: "a month",
}

const currentPeriodLabels: Record<TargetPeriod, string> = {
  week: "this week",
  month: "this month",
}

/** The first day of the period a local date falls in, as `yyyy-mm-dd`. */
export function targetPeriodStart(period: TargetPeriod, today: string) {
  return period === "week" ? startOfWeek(today) : `${today.slice(0, 7)}-01`
}

/** The day after the period ends, so the period is [start, end). */
export function targetPeriodEnd(period: TargetPeriod, today: string) {
  if (period === "week") return shiftLocalDate(startOfWeek(today), 7)
  const [year, month] = today.split("-").map(Number)
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`
}

/**
 * "4h of 10h this week". Logged time keeps its minutes so a 25-minute focus
 * moves the line; the target is whole hours.
 */
export function targetProgressLabel(
  focusSeconds: number,
  targetHours: number,
  period: TargetPeriod
) {
  return `${formatFocusSpan(focusSeconds)} of ${targetHours}h ${currentPeriodLabels[period]}`
}
