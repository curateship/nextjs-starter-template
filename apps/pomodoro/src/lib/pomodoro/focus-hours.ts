import { formatDuration } from "@/lib/format/format-time"

/**
 * A focus total as hours, "622h", for the admin's Profiles column and the
 * member record. A long one in days ("25d 22h") reads as calendar days rather
 * than time focused. Under an hour it is minutes, "45m".
 */
export function formatFocusHours(seconds: number) {
  return seconds < 3_600
    ? formatDuration(seconds * 1000, { zero: "0m" })
    : `${Math.round(seconds / 3_600).toLocaleString()}h`
}
