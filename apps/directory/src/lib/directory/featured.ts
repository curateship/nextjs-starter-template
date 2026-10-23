export const FEATURED_REMINDER_DAYS = [7, 1] as const

export function daysUntil(endsAt: Date, at: Date) {
  return Math.ceil((endsAt.getTime() - at.getTime()) / (24 * 60 * 60 * 1000))
}

export function reminderDue(daysLeft: number, lastSent: number | null) {
  let due: number | null = null
  for (const threshold of FEATURED_REMINDER_DAYS) {
    if (daysLeft <= threshold && daysLeft >= 0) due = threshold
  }
  return due !== null && (lastSent === null || due < lastSent) ? due : null
}
