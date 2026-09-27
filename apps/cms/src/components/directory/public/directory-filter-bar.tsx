import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DIRECTORY_MIN_RATINGS } from "@/lib/directory/public-search"
import type { DirectoryFilterGroup } from "@/lib/directory/filter-groups"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The row of filter buttons above the listings, one button per group.
 *
 * It was a column of tick boxes down the left of the page until 27 Sep 2026,
 * when Tyler asked for the filters to sit at the top in buttons that drop
 * down. The listings get the whole width, and a visitor sees the results
 * rather than the tools for narrowing them.
 *
 * **It knows nothing about cuisines.** It takes a list of groups, each with a
 * name and its options, so the custom-field filters a site invents can be more
 * groups later without this being rewritten. Everything it changes it changes
 * through the two callbacks, which write to the address.
 *
 * Ticking two boxes in one group means either of them, and ticking across two
 * groups means both. That rule lives in the query on the server; what matters
 * here is that a box is a box, never a radio dressed up as one.
 */

/** Options past which a group gets a box to search its own options. */
const OPTIONS_BEFORE_SEARCH = 8

export type DirectoryFilterBarProps = {
  groups: DirectoryFilterGroup[]
  /** The ticked slugs, from the address. */
  selected: string[]
  minRating: number | undefined
  onToggleCategory: (slug: string) => void
  onMinRatingChange: (rating: number | undefined) => void
}

export function DirectoryFilterBar({
  groups,
  selected,
  minRating,
  onToggleCategory,
  onMinRatingChange,
}: DirectoryFilterBarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {groups.map((group) => (
        <GroupFilter
          key={group.id}
          group={group}
          selected={selected}
          onToggleCategory={onToggleCategory}
        />
      ))}
      <RatingFilter
        minRating={minRating}
        onMinRatingChange={onMinRatingChange}
      />
    </div>
  )
}

/**
 * The button itself: the group's name, how many of its boxes are ticked, and
 * an arrow that turns over while the panel is open.
 *
 * A button with something ticked is drawn in full contrast, so a visitor
 * scanning the row can see which filters are doing something without opening
 * any of them.
 */
function FilterTrigger({ label, count }: { label: string; count: number }) {
  return (
    <PopoverTrigger
      className={cn(
        "group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted/60",
        focusRing,
        count ? "border-foreground" : null
      )}
    >
      {label}
      {count ? (
        <span className="text-muted-foreground tabular-nums">({count})</span>
      ) : null}
      <ChevronDownIcon
        aria-hidden="true"
        className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
      />
    </PopoverTrigger>
  )
}

/**
 * The panel under a button: what it filters by, then the two words that end
 * it. **Clear** empties this group alone, and **Done** shuts the panel — the
 * page has already changed under it, because every tick writes to the address
 * straight away rather than waiting to be applied.
 */
function FilterPanel({
  children,
  onClear,
  onDone,
}: {
  children: React.ReactNode
  /** Absent while nothing in this group is on, so no dead control is drawn. */
  onClear: (() => void) | undefined
  onDone: () => void
}) {
  return (
    <PopoverContent align="start" className="w-72 gap-0 p-0">
      {children}
      {/* The line above the footer runs the panel's whole width, which is why
          the panel has no padding of its own and each part carries its own. */}
      <div className="flex items-center justify-between gap-2 border-t p-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!onClear}
          onClick={onClear}
        >
          Clear
        </Button>
        <Button type="button" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </PopoverContent>
  )
}

function GroupFilter({
  group,
  selected,
  onToggleCategory,
}: {
  group: DirectoryFilterGroup
  selected: string[]
  onToggleCategory: (slug: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const ticked = group.options.filter((option) =>
    selected.includes(option.slug)
  )

  const matching = query.trim()
    ? group.options.filter((option) =>
        option.name
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())
      )
    : group.options

  // A ticked box always stays in view, even when it does not match what is
  // typed in the group's own search. Otherwise unticking it means clearing the
  // search first to find it again.
  const shown = query.trim()
    ? [...matching, ...ticked.filter((option) => !matching.includes(option))]
    : matching

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <FilterTrigger label={group.name} count={ticked.length} />
      <FilterPanel
        onClear={
          ticked.length
            ? () => ticked.forEach((option) => onToggleCategory(option.slug))
            : undefined
        }
        onDone={() => setOpen(false)}
      >
        {group.options.length > OPTIONS_BEFORE_SEARCH ? (
          // The padded box and the box the icon is positioned against are two
          // different elements on purpose. With the padding on the positioned
          // one, the icon was measured from the panel's edge and the text from
          // the input's, which left a gap between them.
          <div className="p-2.5 pb-0">
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${group.name.toLocaleLowerCase()}`}
                aria-label={`Search ${group.name}`}
                className="pl-9"
              />
            </div>
          </div>
        ) : null}

        {shown.length ? (
          // Capped rather than as tall as the list: a site with 200
          // neighbourhoods would otherwise open a panel the height of the
          // screen with its Done button off the bottom of it.
          // The cap is on the viewport, not the frame around it: a height on
          // the outside trims the frame while the viewport keeps its full size
          // inside, so the options past the cap are clipped with no way to
          // scroll to them.
          <ScrollArea className="p-2.5" viewportClassName="max-h-72">
            <ul className="flex flex-col">
              {shown.map((option) => {
                const id = `directory-filter-${group.id}-${option.slug}`
                return (
                  <li key={option.slug}>
                    {/* The whole row is the label, so the count and the empty
                        space beside it tick the box too. */}
                    <label
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-2 rounded-md py-1.5 text-sm hover:bg-muted/60"
                    >
                      <Checkbox
                        id={id}
                        checked={selected.includes(option.slug)}
                        onCheckedChange={() => onToggleCategory(option.slug)}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {option.name}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {option.count}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        ) : (
          <p className="p-2.5 text-sm text-muted-foreground">
            Nothing matches that.
          </p>
        )}
      </FilterPanel>
    </Popover>
  )
}

/**
 * Any, 4.0+ or 4.5+, in its own button beside the groups.
 *
 * Radios rather than tick boxes, because exactly one of the three is true at a
 * time and a screen reader should be told that before the visitor picks.
 */
function RatingFilter({
  minRating,
  onMinRatingChange,
}: {
  minRating: number | undefined
  onMinRatingChange: (rating: number | undefined) => void
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <FilterTrigger label="Rating" count={minRating === undefined ? 0 : 1} />
      <FilterPanel
        onClear={
          minRating === undefined
            ? undefined
            : () => onMinRatingChange(undefined)
        }
        onDone={() => setOpen(false)}
      >
        <div
          role="radiogroup"
          aria-label="Rating"
          className="flex flex-col p-2.5"
        >
          {[undefined, ...DIRECTORY_MIN_RATINGS].map((rating) => {
            const active = rating === minRating
            return (
              <button
                key={rating ?? "any"}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onMinRatingChange(rating)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                  focusRing,
                  active ? "font-medium" : null
                )}
              >
                {rating === undefined ? "Any rating" : `${rating.toFixed(1)}+`}
                {active ? (
                  <CheckIcon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </FilterPanel>
    </Popover>
  )
}
