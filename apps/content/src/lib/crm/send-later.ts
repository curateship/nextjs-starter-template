/**
 * The times "Send later" offers (CRM task 38, part 6), worked out in the
 * person's own clock, because "tomorrow morning" means their morning. The
 * server is handed the exact moment and never guesses a time zone.
 */

/** The hour the two quick picks send at. */
export const SEND_LATER_HOUR = 9

/** Tomorrow at 9 AM. */
export function tomorrowMorning(from: Date): Date {
  const at = new Date(from)
  at.setDate(at.getDate() + 1)
  at.setHours(SEND_LATER_HOUR, 0, 0, 0)
  return at
}

/**
 * The next Monday at 9 AM. On a Monday that is a week on, because "Monday
 * morning" said on a Monday means the next one.
 */
export function mondayMorning(from: Date): Date {
  const at = new Date(from)
  const daysOn = ((8 - at.getDay()) % 7) || 7
  at.setDate(at.getDate() + daysOn)
  at.setHours(SEND_LATER_HOUR, 0, 0, 0)
  return at
}

/**
 * A day and a time typed into Pick a time, as one moment, or null when either
 * is missing. `time` is the "HH:MM" a time box gives.
 */
export function pickedMoment(day: Date | undefined, time: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!day || !match) return null
  const at = new Date(day)
  at.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return at
}

/**
 * When a scheduled reply goes, as a person says it: "Tomorrow, 9:00 AM",
 * "Mon, 9:00 AM" within the week, "Dec 3, 9:00 AM" further on.
 */
export function formatSendAt(at: Date, from: Date = new Date()): string {
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((startOf(at) - startOf(from)) / 86_400_000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Tomorrow, ${time}`
  if (days > 1 && days < 7) return `${at.toLocaleDateString("en-US", { weekday: "short" })}, ${time}`
  return `${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`
}
