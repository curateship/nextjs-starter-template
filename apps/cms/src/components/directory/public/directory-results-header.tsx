import * as React from "react"
import { Link } from "@tanstack/react-router"
import { LayoutGridIcon, MapIcon } from "lucide-react"

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
  DIRECTORY_VIEWS,
  DIRECTORY_VIEW_LABELS,
} from "@/lib/directory/listing-map"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The line above the results: how many there are on the left, how they are
 * ordered on the right, and the phone's Filters button between them.
 *
 * The count sits here rather than under the page's title because it is about
 * the list, and it changes every time a box is ticked. A number that moves
 * belongs beside the thing that moved it.
 */
export function DirectoryResultsHeader({
  count,
  sort,
  current,
  mapAvailable,
  nearNote,
  onSortChange,
}: {
  /** "8 listings", or the sentence a search or a category makes. */
  count: React.ReactNode
  sort: DirectorySort
  current: DirectoryBrowseSearch
  /** This site offers a map and has a key for it. No switch when it does not. */
  mapAvailable: boolean
  /** What the distance filter is doing, when one is on. */
  nearNote?: React.ReactNode
  onSortChange: (value: DirectorySort) => void
}) {
  const nearActive = Boolean(current.near)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{count}</p>
        {mapAvailable ? (
          <div className="ml-auto shrink-0">
            <ViewSwitch current={current} />
          </div>
        ) : null}
        {/* `shrink-0` because the trigger is only as wide as its own words —
            without it the row squeezes it down to the arrow alone. */}
        <div className={cn("shrink-0", mapAvailable ? "" : "ml-auto")}>
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
