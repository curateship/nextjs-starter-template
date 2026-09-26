import { Link } from "@tanstack/react-router"

import type { EventDateCounts } from "@/lib/api/events/public"
import {
  EVENT_DATE_FILTERS,
  EVENT_DATE_FILTER_LABELS,
  eventDateFilterText,
  type EventsPageSearch,
} from "@/lib/events/events-page"
import { focusRing } from "@/lib/layout/focus-ring"
import { segmentClass } from "@/lib/layout/segmented"

/**
 * The router marks a link as the current page when its address is part of
 * the one showing, so "Any time" would count as current beside "Today". Only
 * an exact match is current; every chip also says so itself.
 */
const exactSearch = { exact: true }

/**
 * The date row above the list: Any time, Today, This weekend and Next 7 days.
 * Each carries the number of events it would show, so nobody presses a chip to
 * find nothing behind it.
 *
 * There is no picker for a pair of days of the visitor's own. Tyler had it
 * taken off on 25 Sep 2026. A `?from=` and `?to=` in the address still narrow
 * the list, so an old link keeps working and says so in the line under the
 * row, with "Clear dates" to drop it.
 *
 * Drawn as one segmented group, the same shape as the List and Month switch it
 * sits opposite, because both are one choice out of a few.
 *
 * Every chip writes to the address, so a filtered page survives a reload and
 * can be sent to somebody. A chip keeps the category, the typed words, the
 * place and the distance, and drops the page number, because page 3 of the old
 * list is nowhere in the new one.
 */
export function EventDateFilters({
  current,
  counts,
}: {
  /** The address as it stands, so a chip keeps what it is not changing. */
  current: EventsPageSearch
  /** How many events are behind each chip. */
  counts: EventDateCounts
}) {
  const kept = {
    place: current.place,
    category: current.category,
    q: current.q,
    near: current.near,
    radius: current.radius,
    area: current.area,
  }
  const rangeActive = Boolean(current.from || current.to)

  return (
    // `min-w-0` so the group below may be narrower than its chips and scroll
    // them inside itself. Without it a flex item never shrinks past its
    // content, and on a phone the whole page scrolls sideways instead.
    <div className="flex max-w-full min-w-0 flex-col gap-1">
      <div
        role="group"
        aria-label="When"
        className="flex h-8 w-full items-center justify-start gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 text-muted-foreground sm:w-fit"
      >
        <DateChip
          search={kept}
          active={!current.when && !rangeActive}
          label="Any time"
          count={counts.anyTime}
        />
        {EVENT_DATE_FILTERS.map((when) => (
          <DateChip
            key={when}
            search={{ ...kept, when }}
            active={current.when === when}
            label={EVENT_DATE_FILTER_LABELS[when]}
            count={counts[when]}
          />
        ))}
      </div>
      {/* Only ever from an address somebody was sent or typed, now that the
          picker is gone. */}
      {rangeActive ? (
        <p className="text-sm text-muted-foreground">
          Showing events {eventDateFilterText(current)}.{" "}
          <Link
            to="/events"
            search={kept}
            className={`rounded-sm underline hover:text-foreground ${focusRing}`}
          >
            Clear dates
          </Link>
        </p>
      ) : null}
    </div>
  )
}

function DateChip({
  search,
  active,
  label,
  count,
}: {
  search: EventsPageSearch
  active: boolean
  label: string
  count: number
}) {
  return (
    <Link
      to="/events"
      search={search}
      activeOptions={exactSearch}
      aria-current={active ? "page" : undefined}
      className={segmentClass(active)}
    >
      {label}
      {/* The number is read out with the words, so a screen reader hears
          "Today, 1 event" rather than "Today 1". */}
      <span className="sr-only">
        , {count === 1 ? "1 event" : `${count} events`}
      </span>
      <span aria-hidden="true" className="text-xs tabular-nums opacity-70">
        {count}
      </span>
    </Link>
  )
}
