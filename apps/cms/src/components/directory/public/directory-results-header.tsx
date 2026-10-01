import * as React from "react"
import { Link } from "@tanstack/react-router"
import { LayoutGridIcon, MapIcon } from "lucide-react"

import { filterChipClass } from "@/components/directory/public/filter-chip"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DIRECTORY_SORTS,
  DIRECTORY_SORT_LABELS,
  type DirectoryBrowseSearch,
  type DirectorySort,
} from "@/lib/directory/public-search"
import {
  DIRECTORY_DEALS_ONLY_LABEL,
  DIRECTORY_VIEWS,
  DIRECTORY_VIEW_LABELS,
} from "@/lib/directory/listing-map"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The line above the results: how many there are on the left, then the filter
 * buttons, then how they are ordered.
 *
 * The count sits here rather than under the page's title because it is about
 * the list, and it changes every time a box is ticked. A number that moves
 * belongs beside the thing that moved it. The filters joined it on 27 Sep 2026,
 * when they came out of the column down the left of the page.
 */
export function DirectoryResultsHeader({
  count,
  filters,
  onClearAll,
  sort,
  current,
  mapAvailable,
  dealsSwitch,
  nearNote,
  onSortChange,
}: {
  /** "8 listings", or the sentence a search or a category makes. */
  count: React.ReactNode
  /** The row of filter buttons, drawn between the count and the order. */
  filters: React.ReactNode
  /** Absent when there is nothing to clear, so no dead control is drawn. */
  onClearAll?: (() => void) | undefined
  sort: DirectorySort
  current: DirectoryBrowseSearch
  /** This site offers a map and has a key for it. No switch when it does not. */
  mapAvailable: boolean
  /**
   * The map is showing and this visitor may see deals. Both have to be true for
   * "Deals only" to be drawn: on the grid it would change nothing, and on a
   * site that keeps deals for members it would be a switch that does nothing.
   */
  dealsSwitch: boolean
  /** What the distance filter is doing, when one is on. */
  nearNote?: React.ReactNode
  onSortChange: (value: DirectorySort) => void
}) {
  const nearActive = Boolean(current.near)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium">{count}</p>
        {onClearAll ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClearAll}>
            Clear all
          </Button>
        ) : null}
        {filters}
        {dealsSwitch ? (
          <div className="shrink-0">
            <DealsOnlySwitch current={current} />
          </div>
        ) : null}
        {mapAvailable ? (
          <div className="shrink-0">
            <ViewSwitch current={current} />
          </div>
        ) : null}
        {/* The order is the last thing in the line and reads as a different
            kind of control from the filters beside it, so a hairline stands
            between them. */}
        <Separator
          orientation="vertical"
          className="hidden h-6 sm:block"
          aria-hidden="true"
        />
        {/* `shrink-0` because the trigger is only as wide as its own words —
            without it the row squeezes it down to the arrow alone. */}
        <div className="shrink-0">
          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as DirectorySort)}
          >
            <SelectTrigger aria-label="Order listings by">
              <span className="text-muted-foreground">Sort by</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTORY_SORTS.filter(
                (option) => option !== "distance" || nearActive
              ).map((option) => (
                <SelectItem key={option} value={option}>
                  {DIRECTORY_SORT_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {nearNote ? (
        <p className="text-sm text-muted-foreground">{nearNote}</p>
      ) : null}
    </div>
  )
}

/**
 * The map's "Deals only": one chip, the same chip the Deals and Events pages
 * use for their filters, and a link for the same reason they are links.
 *
 * It keeps every other thing the visitor narrowed to, including `view=map`, so
 * it narrows the map in front of them rather than starting a new search. The
 * page number is dropped because the map has none, and leaving a stale one in
 * the address would hand the grid a page that is nowhere in its list.
 */
function DealsOnlySwitch({ current }: { current: DirectoryBrowseSearch }) {
  const active = current.deals === "only"
  return (
    <Link
      to="/directory"
      search={{
        ...current,
        deals: active ? undefined : "only",
        page: undefined,
      }}
      activeOptions={{ exact: true }}
      aria-current={active ? "page" : undefined}
      className={filterChipClass(active)}
    >
      {DIRECTORY_DEALS_ONLY_LABEL}
    </Link>
  )
}

/**
 * Grid or map, in the segmented style the rest of the app uses for a small set
 * of exclusive choices.
 *
 * Links rather than buttons, and for the same reason the filters write to the
 * address: a map of the cafés in one category is a page in its own right. It
 * can be sent to somebody, opened in a new tab, and returned to with Back —
 * none of which a button holding the state in memory can do.
 */
function ViewSwitch({ current }: { current: DirectoryBrowseSearch }) {
  const active = current.view ?? "grid"
  return (
    <div
      role="group"
      aria-label="Show listings as"
      className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-0.5 text-muted-foreground"
    >
      {DIRECTORY_VIEWS.map((option) => {
        const Icon = option === "map" ? MapIcon : LayoutGridIcon
        return (
          <Link
            key={option}
            to="/directory"
            // Everything else the visitor has narrowed to is kept: switching to
            // the map is a change of drawing, not a new search.
            search={{
              ...current,
              view: option === "grid" ? undefined : option,
            }}
            // Only an exact match is current, or "Grid" would be current on
            // the map too.
            activeOptions={{ exact: true }}
            aria-current={option === active ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
              focusRing,
              option === active
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground"
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {DIRECTORY_VIEW_LABELS[option]}
          </Link>
        )
      })}
    </div>
  )
}
