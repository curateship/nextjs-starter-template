/**
 * The evening streak reminder's rules and words, shared by the settings card,
 * the server's check and the bell. See `workspace/docs/streak-reminder.md`.
 */

/** The local hours a reminder may be set to go from: noon to 11pm. */
export const STREAK_REMINDER_HOURS = [
  12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
] as const

export const DEFAULT_STREAK_REMINDER_HOUR = 19

/** "7pm", the way the settings card and the doc say an hour. */
export function formatReminderHour(hour: number) {
  if (hour === 12) return "noon"
  return `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? "pm" : "am"}`
}

/**
 * Whether tonight's reminder is due for somebody, from facts the caller
 * already has. Pure, so the worker's decision can be tested without a clock.
 */
export function streakReminderDue({
  localHour,
  reminderHour,
  localToday,
  lastConsideredOn,
}: {
  localHour: number
  reminderHour: number
  localToday: string
  lastConsideredOn: string | null
}) {
  return localHour >= reminderHour && lastConsideredOn !== localToday
}
