import { Link } from "@tanstack/react-router"
import { CalendarDaysIcon, ListIcon, MapIcon } from "lucide-react"

import type { EventView, EventsPageSearch } from "@/lib/events/events-page"
import { segmentClass } from "@/lib/layout/segmented"

const VIEWS: { view: EventView; label: string; Icon: typeof ListIcon }[] = [
  { view: "list", label: "List", Icon: ListIcon },
  { view: "month", label: "Month", Icon: CalendarDaysIcon },
  { view: "map", label: "Map", Icon: MapIcon },
]

/**
 * List or month, in the segmented style, as links the way the directory's grid
 * and map switch is: a month is a page that can be sent to somebody and come
 * back to with Back.
 *
 * Switching from one day's list to the month opens that day's month. A
 * category filter comes along everywhere. The list and the map share the
 * rest of their filters (the words, the dates, the place and the distance),
 * so switching between those two keeps them; the month drops them.
 */
export function EventViewSwitch({
  current,
  month,
  category,
  filters,
}: {
  current: EventView
  /** "2026-10", the month the month view should open on, if not this one. */
  month?: string
  /** The category the page is narrowed to, kept on every view. */
  category?: string
  /** The list's and the map's own filters, kept between the two. */
  filters?: EventsPageSearch
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
          search={
            view === "month"
              ? { view, month, category }
              : view === "map"
                ? { view, ...filters, category }
                : { ...filters, category }
          }
          // Only an exact match is current: "List" is part of every address.
          activeOptions={{ exact: true }}
          aria-current={view === current ? "page" : undefined}
          className={segmentClass(view === current)}
        >
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </Link>
      ))}
    </div>
  )
}
