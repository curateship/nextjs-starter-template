import type { PhoneStatus } from "@/lib/phones/options"

/**
 * The status dot's colour, drawn on a phone's row, on the wall and on the
 * rack map. The word beside it says the same, so colour is never alone.
 */
export const STATUS_DOT: Record<PhoneStatus, string> = {
  connected: "bg-emerald-500",
  busy: "bg-blue-500",
  held: "bg-amber-500",
  offline: "bg-destructive",
}
