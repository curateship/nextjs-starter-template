import { format } from "date-fns"

// Convert a stored ISO date string to a local Date at midnight (UTC date parts) for the calendar picker
export function toCalendarDate(value: string | null) {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

// Convert a calendar picker Date back to a UTC-midnight ISO string for storage in filter rules
export function fromCalendarDate(value: Date | undefined) {
  return value
    ? new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0)).toISOString()
    : null
}

// Human-readable date label ("Jun 11, 2026") for date-picker trigger buttons, with placeholder fallback
export function formatDatePickerLabel(value: string | null, placeholder: string) {
  const date = toCalendarDate(value)
  return date ? format(date, "MMM d, yyyy") : placeholder
}
