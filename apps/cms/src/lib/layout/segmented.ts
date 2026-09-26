import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * One segment of a segmented group: the Events page's date chips and the List
 * and Month switch beside them. The two sit side by side on the same row, so
 * they are drawn from one class list rather than two that have to be kept in
 * step by hand.
 *
 * The group around them is each caller's own, because they do not agree on it:
 * the date chips scroll sideways on a phone and the view switch does not.
 */
export function segmentClass(active: boolean) {
  return cn(
    // `relative` so anything a segment pins to itself, like words only a
    // screen reader hears, stays inside it. Left static those hang off the far
    // right of the row and push the whole page sideways on a phone.
    "relative inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
    focusRing,
    active ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
  )
}
