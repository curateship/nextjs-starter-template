import { focusRing } from "@/lib/focus-ring"
import { cn } from "@/lib/utils"

/**
 * A title that opens the thing it names. Every list on a dashboard links the
 * same way — to the record's own page, with `?open=` so the page opens it on
 * arrival.
 */
export const titleLink = cn(
  "min-w-0 truncate rounded-sm hover:underline",
  focusRing
)
