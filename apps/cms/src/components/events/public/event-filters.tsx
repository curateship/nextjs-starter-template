import { Link, useNavigate } from "@tanstack/react-router"

import { filterChipClass } from "@/components/directory/public/filter-chip"
import { NearPicker } from "@/components/directory/public/near-picker"
import { DatePicker } from "@/components/ui/date-picker"
import type { EventCategory } from "@/lib/api/events/public"
import { DEFAULT_DIRECTORY_NEAR_RADIUS_KM } from "@/lib/directory/public-search"
import {
  EVENT_DATE_FILTERS,
  EVENT_DATE_FILTER_LABELS,
  eventNearText,
  type EventNearSearch,
  type EventsPageSearch,
} from "@/lib/events/events-page"
import { dayForPicker, dayFromPicker } from "@/lib/events/picker-day"

/**
 * The router marks a link as the current page when its address is part of
 * the one showing, so "All" would count as current beside "Food". Only an
 * exact match is current; every chip also says so itself.
 */
const exactSearch = { exact: true }

/**
 * The filters above the Events page: a chip per category, and on the upcoming
 * list the date chips, a From and To day, and Near and Within a distance.
 * Every one writes to the address, so a filtered page survives a reload and
 * can be sent to somebody.
 *
 * A category chip keeps the view it is on, so the month and one day follow
 * it too. A date chip keeps the category, the place and the distance, and a
 * distance keeps the dates. Each drops the page number, because page 3 of the
 * old list is nowhere in the new one.
 */
export function EventFilters({
  current,
  categories,
  showListFilters,
}: {
  /** The address as it stands, so a chip keeps what it is not changing. */
  current: EventsPageSearch
  categories: EventCategory[]
  /** Only the upcoming list takes a date or a distance filter. */
  showListFilters: boolean
}) {
  const navigate = useNavigate()
  const nearby = {
    near: current.near,
    radius: current.radius,
    area: current.area,
  }
  const kept = { place: current.place, category: current.category, ...nearby }
  const dates = { when: current.when, from: current.from, to: current.to }
  const rangeActive = Boolean(current.from || current.to)
  const nearText = eventNearText(current)

  const pickRangeDay = (end: "from" | "to", date: Date | undefined) => {
    const range = { from: current.from, to: current.to }
    range[end] = dayFromPicker(date) || undefined
    void navigate({ to: "/events", search: { ...kept, ...range } })
  }

  const pickNear = (next: EventNearSearch) =>
    void navigate({
      to: "/events",
      search: {
        place: current.place,
        category: current.category,
        ...dates,
        ...next,
      },
    })

  if (!categories.length && !showListFilters) return null

  return (
    <div className="grid gap-2 md:gap-3">
      {categories.length ? (
        <ul aria-label="Category" className="flex flex-wrap gap-1">
          <li>
            <Link
              to="/events"
              search={{ ...current, page: undefined, category: undefined }}
              activeOptions={exactSearch}
              aria-current={!current.category ? "page" : undefined}
              className={filterChipClass(!current.category)}
            >
              All
            </Link>
          </li>
          {categories.map((row) => (
            <li key={row.id}>
              <Link
                to="/events"
                search={{ ...current, page: undefined, category: row.slug }}
                activeOptions={exactSearch}
                aria-current={
                  row.slug === current.category ? "page" : undefined
                }
                className={filterChipClass(row.slug === current.category)}
              >
                {row.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {showListFilters ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <ul aria-label="When" className="flex flex-wrap gap-1">
            <DateChip
              search={kept}
              active={!current.when && !rangeActive}
              label="Any time"
            />
            {EVENT_DATE_FILTERS.map((when) => (
              <DateChip
                key={when}
                search={{ ...kept, when }}
                active={current.when === when}
                label={EVENT_DATE_FILTER_LABELS[when]}
              />
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="grid gap-1 sm:w-52">
              <label htmlFor="events-from" className="text-sm font-medium">
                From
              </label>
              <DatePicker
                id="events-from"
                value={dayForPicker(current.from)}
                placeholder="Any day"
                onChange={(date) => pickRangeDay("from", date)}
              />
            </div>
            <div className="grid gap-1 sm:w-52">
              <label htmlFor="events-to" className="text-sm font-medium">
                To
              </label>
              <DatePicker
                id="events-to"
                value={dayForPicker(current.to)}
                placeholder="Any day"
                onChange={(date) => pickRangeDay("to", date)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {showListFilters ? (
        <NearPicker
          idPrefix="events"
          near={current.near}
          radius={current.radius ?? DEFAULT_DIRECTORY_NEAR_RADIUS_KM}
          onNearChange={(near, area, radius) =>
            pickNear({ near, radius, area })
          }
          onRadiusChange={(radius) => pickNear({ ...nearby, radius })}
          onNearClear={() => pickNear({})}
        />
      ) : null}
      {showListFilters && nearText ? (
        <p className="text-sm text-muted-foreground">
          Showing events {nearText}. Events with no place on the map are left
          out.
        </p>
      ) : null}
    </div>
  )
}

function DateChip({
  search,
  active,
  label,
}: {
  search: EventsPageSearch
  active: boolean
  label: string
}) {
  return (
    <li>
      <Link
        to="/events"
        search={search}
        activeOptions={exactSearch}
        aria-current={active ? "page" : undefined}
        className={filterChipClass(active)}
      >
        {label}
      </Link>
    </li>
  )
}
