import { Link } from "@tanstack/react-router"

import type { DealWhenCounts } from "@/lib/api/promotions/public"
import {
  DEAL_ON_FILTERS,
  DEAL_ON_FILTER_LABELS,
  type DealsPageSearch,
} from "@/lib/promotions/deals-page"
import { segmentClass } from "@/lib/layout/segmented"

/**
 * The router marks a link as the current page when its address is part of
 * the one showing, so "Any time" would count as current beside "On now". Only
 * an exact match is current; every chip also says so itself.
 */
const exactSearch = { exact: true }

/**
 * The "when" row above the deals: Any time, On now and Ending soon. Each
 * carries the number of deals behind it, counted with the typed words, the
 * ticked boxes and the distance still applied, so nobody presses a chip to
 * find nothing behind it.
 *
 * Drawn as one segmented group, the same shape as the Events page's date
 * chips, because both are one choice out of a few.
 *
 * Every chip writes to the address, keeps what it is not changing, and drops
 * the page number, because page 3 of the old list is nowhere in the new one.
 */
export function DealWhenFilters({
  current,
  counts,
}: {
  /** The address as it stands, so a chip keeps what it is not changing. */
  current: DealsPageSearch
  /** How many deals are behind each chip. */
  counts: DealWhenCounts
}) {
  const kept = {
    q: current.q,
    category: current.category,
    near: current.near,
    radius: current.radius,
    area: current.area,
  }

  return (
    // `min-w-0` so the group may be narrower than its chips and scroll them
    // inside itself. Without it a flex item never shrinks past its content,
    // and on a phone the whole page scrolls sideways instead.
    <div
      role="group"
      aria-label="When"
      className="flex h-8 max-w-full min-w-0 items-center justify-start gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 text-muted-foreground sm:w-fit"
    >
      <WhenChip
        search={kept}
        active={!current.on}
        label="Any time"
        count={counts.anyTime}
      />
      {DEAL_ON_FILTERS.map((on) => (
        <WhenChip
          key={on}
          search={{ ...kept, on }}
          active={current.on === on}
          label={DEAL_ON_FILTER_LABELS[on]}
          count={counts[on]}
        />
      ))}
    </div>
  )
}

function WhenChip({
  search,
  active,
  label,
  count,
}: {
  search: DealsPageSearch
  active: boolean
  label: string
  count: number
}) {
  return (
    <Link
      to="/deals"
      search={search}
      activeOptions={exactSearch}
      aria-current={active ? "page" : undefined}
      className={segmentClass(active)}
    >
      {label}
      {/* The number is read out with the words, so a screen reader hears
          "On now, 1 deal" rather than "On now 1". */}
      <span className="sr-only">
        , {count === 1 ? "1 deal" : `${count} deals`}
      </span>
      <span aria-hidden="true" className="text-xs tabular-nums opacity-70">
        {count}
      </span>
    </Link>
  )
}
