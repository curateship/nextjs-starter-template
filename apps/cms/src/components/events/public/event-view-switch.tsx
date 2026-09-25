import { Link } from "@tanstack/react-router"
import { CalendarDaysIcon, ListIcon } from "lucide-react"

import type { EventView } from "@/lib/events/events-page"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

const VIEWS: { view: EventView; label: string; Icon: typeof ListIcon }[] = [
  { view: "list", label: "List", Icon: ListIcon },
  { view: "month", label: "Month", Icon: CalendarDaysIcon },
]

/**
 * List or month, in the segmented style, as links the way the directory's grid
 * and map switch is: a month is a page that can be sent to somebody and come
 * back to with Back.
 *
 * Switching from one day's list to the month opens that day's month. A
 * category filter comes along; a date filter and a place stay with the list.
 */
export function EventViewSwitch({
  current,
  month,
  category,
}: {
  current: EventView
  /** "2026-10", the month the month view should open on, if not this one. */
  month?: string
  /** The category the page is narrowed to, kept on both views. */
  category?: string
}) {
  return (
    <div
      role="group"
      aria-label="Show events as"
      className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-0.5 text-muted-foreground"
    >
      {VIEWS.map(({ view, label, Icon }) => (
        <Link
          key={view}
          to="/events"
          search={view === "month" ? { view, month, category } : { category }}
          // Only an exact match is current: "List" is part of every address.
          activeOptions={{ exact: true }}
          aria-current={view === current ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
            focusRing,
            view === current
              ? "bg-background text-foreground shadow-sm"
              : "hover:text-foreground"
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </Link>
      ))}
    </div>
  )
}
