import { Link, useNavigate } from "@tanstack/react-router"

import { filterChipClass } from "@/components/directory/public/filter-chip"
import { NearPicker } from "@/components/directory/public/near-picker"
import type { DealCategory } from "@/lib/api/promotions/public"
import { DEFAULT_DIRECTORY_NEAR_RADIUS_KM } from "@/lib/directory/public-search"
import { eventNearText, type EventNearSearch } from "@/lib/events/events-page"
import {
  DEAL_ON_FILTER_LABELS,
  DEAL_ON_FILTERS,
  type DealsPageSearch,
} from "@/lib/promotions/deals-page"

/**
 * The router marks a link as the current page when its address is part of
 * the one showing, so "All" would count as current beside "Pizza". Only an
 * exact match is current; every chip also says so itself.
 */
const exactSearch = { exact: true }

/**
 * The filters above the Deals page: a chip per category with a live deal, the
 * "when" chips, and Near and Within a distance. Every one writes to the
 * address and keeps the others, and each drops the page number, because page 3
 * of the old list is nowhere in the new one.
 */
export function DealFilters({
  current,
  categories,
}: {
  /** The address as the server read it, so a chip keeps what it is not changing. */
  current: DealsPageSearch
  categories: DealCategory[]
}) {
  const navigate = useNavigate()
  const nearby: EventNearSearch = {
    near: current.near,
    radius: current.radius,
    area: current.area,
  }
  const keep = { ...current, page: undefined }
  const nearText = eventNearText(current)
  const pickNear = (next: EventNearSearch) =>
    void navigate({
      to: "/deals",
      search: { category: current.category, on: current.on, ...next },
    })

  return (
    <div className="grid gap-2 md:gap-3">
      {categories.length ? (
        <ul aria-label="Category" className="flex flex-wrap gap-1">
          <Chip
            search={{ ...keep, category: undefined }}
            active={!current.category}
            label="All"
          />
          {categories.map((row) => (
            <Chip
              key={row.id}
              search={{ ...keep, category: row.slug }}
              active={row.slug === current.category}
              label={row.name}
            />
          ))}
        </ul>
      ) : null}

      <ul aria-label="When" className="flex flex-wrap gap-1">
        <Chip
          search={{ ...keep, on: undefined }}
          active={!current.on}
          label="Any time"
        />
        {DEAL_ON_FILTERS.map((on) => (
          <Chip
            key={on}
            search={{ ...keep, on }}
            active={current.on === on}
            label={DEAL_ON_FILTER_LABELS[on]}
          />
        ))}
      </ul>

      <NearPicker
        idPrefix="deals"
        near={current.near}
        radius={current.radius ?? DEFAULT_DIRECTORY_NEAR_RADIUS_KM}
        onNearChange={(near, area, radius) => pickNear({ near, radius, area })}
        onRadiusChange={(radius) => pickNear({ ...nearby, radius })}
        onNearClear={() => pickNear({})}
      />
      {nearText ? (
        <p className="text-sm text-muted-foreground">
          Showing deals {nearText}. Places with no pin on the map are left out.
        </p>
      ) : null}
    </div>
  )
}

function Chip({
  search,
  active,
  label,
}: {
  search: DealsPageSearch
  active: boolean
  label: string
}) {
  return (
    <li>
      <Link
        to="/deals"
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
