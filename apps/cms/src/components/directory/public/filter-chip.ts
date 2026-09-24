import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The look of one filter chip: the directory's category chips and the Events
 * page's category and date chips. Each is a link, so a filtered page can be
 * sent to somebody and opened in a new tab.
 */
export function filterChipClass(active: boolean) {
  return cn(
    // A plain `border` with no colour named, so the Divider lines setting
    // reaches these the way it reaches every other line in the app.
    "inline-flex h-8 items-center rounded-md border px-3 text-sm",
    focusRing,
    active
      ? // Filled *and* bolder: the state has to survive somebody who
        // cannot tell the two backgrounds apart.
        "bg-primary font-medium text-primary-foreground"
      : "bg-card text-foreground hover:bg-accent"
  )
}
