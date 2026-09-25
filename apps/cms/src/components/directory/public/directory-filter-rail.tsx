import * as React from "react"
import { ChevronDownIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DIRECTORY_MIN_RATINGS } from "@/lib/directory/public-search"
import type { DirectoryFilterGroup } from "@/lib/directory/filter-groups"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The column of tick boxes down the left of the browse page.
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

/** Options shown before "Show all". Eight is what fits without a scroll. */
const OPTIONS_BEFORE_SHOW_ALL = 8

/** Options past which a group gets a box to search its own options. */
const OPTIONS_BEFORE_SEARCH = 8

export type DirectoryFilterRailProps = {
  groups: DirectoryFilterGroup[]
  /** The ticked slugs, from the address. */
  selected: string[]
  minRating: number | undefined
  onToggleCategory: (slug: string) => void
  onMinRatingChange: (rating: number | undefined) => void
  /** Absent when there is nothing to clear, so no dead control is drawn. */
  onClearAll: (() => void) | undefined
}

/**
 * The rail as the page uses it: a column on a wide screen, and a button that
 * opens the same controls in a sheet on a phone. One component so the two can
 * never offer different filters.
 */
export function DirectoryFilterRail(props: DirectoryFilterRailProps) {
  const [open, setOpen] = React.useState(false)
  const ticked = props.selected.length + (props.minRating === undefined ? 0 : 1)

  return (
    <>
      <div className="hidden lg:block">
        <FilterControls {...props} idPrefix="rail" />
      </div>

      {/* Below 1024px the same controls live in a sheet, because a column of
          tick boxes above the results would be most of the first screen. The
          button carries how many are on, which is the only thing the page can
          no longer show. */}
      <div className="lg:hidden">
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <SlidersHorizontalIcon />
          Filters
          {ticked ? <span className="tabular-nums">({ticked})</span> : null}
        </Button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[19rem] p-4">
            <SheetHeader className="p-0">
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <ScrollArea className="-mx-4 flex-1 px-4">
              {/*
               * A second copy of the same boxes, so its fields need names of
               * their own. Both copies are in the page while the sheet is
               * open — the column is only hidden — and two controls sharing
               * one id is a label that points at whichever the browser
               * happens to find first.
               */}
              <FilterControls {...props} idPrefix="sheet" showHeading={false} />
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

function FilterControls({
  groups,
  selected,
  minRating,
  onToggleCategory,
  onMinRatingChange,
  onClearAll,
  idPrefix,
  showHeading = true,
}: DirectoryFilterRailProps & {
  /** Names this copy's fields. The sheet is a second copy of the same boxes. */
  idPrefix: string
  /** The sheet has its own title, so the heading would be it written twice. */
  showHeading?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      {showHeading || onClearAll ? (
        <div className="flex items-center justify-between gap-2">
          {showHeading ? (
            <h2 className="text-lg font-semibold tracking-tight">Filters</h2>
          ) : null}
          {onClearAll ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={onClearAll}
            >
              Clear all
            </Button>
          ) : null}
        </div>
      ) : null}

      {groups.map((group) => (
        <FilterGroup
          key={group.id}
          group={group}
          selected={selected}
          idPrefix={idPrefix}
          onToggleCategory={onToggleCategory}
        />
      ))}

      <RatingFilter
        minRating={minRating}
        idPrefix={idPrefix}
        onMinRatingChange={onMinRatingChange}
      />
    </div>
  )
}

function FilterGroup({
  group,
  selected,
  idPrefix,
  onToggleCategory,
}: {
  group: DirectoryFilterGroup
  selected: string[]
  idPrefix: string
  onToggleCategory: (slug: string) => void
}) {
  const [showAll, setShowAll] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const searchId = `${idPrefix}-${group.id}-search`

  const matching = query.trim()
    ? group.options.filter((option) =>
        option.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
      )
    : group.options

  // A ticked box always stays in view, even when it does not match what is
  // typed in the group's own search. Otherwise unticking it means clearing the
  // search first to find it again.
  const shown =
    showAll || query.trim()
      ? matching
      : [
          ...matching.slice(0, OPTIONS_BEFORE_SHOW_ALL),
          ...matching
            .slice(OPTIONS_BEFORE_SHOW_ALL)
            .filter((option) => selected.includes(option.slug)),
        ]
  const hidden = matching.length - shown.length

  return (
    <Collapsible defaultOpen className="flex flex-col gap-2">
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-md text-left",
          focusRing
        )}
      >
        <span className="font-semibold">{group.name}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="flex flex-col gap-2">
        {group.options.length > OPTIONS_BEFORE_SEARCH ? (
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${group.name.toLocaleLowerCase()}`}
              aria-label={`Search ${group.name}`}
              className="pl-9"
            />
          </div>
        ) : null}

        {shown.length ? (
          <ul className="flex flex-col">
            {shown.map((option) => {
              const id = `${idPrefix}-${group.id}-${option.slug}`
              return (
                <li key={option.slug}>
                  {/* The whole row is the label, so the count and the empty
                      space beside it tick the box too. */}
                  <label
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-2 py-1.5 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={selected.includes(option.slug)}
                      onCheckedChange={() => onToggleCategory(option.slug)}
                    />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {option.count}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-1.5 text-sm text-muted-foreground">
            Nothing matches that.
          </p>
        )}

        {hidden > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start px-0"
            onClick={() => setShowAll(true)}
          >
            Show all {matching.length} +
          </Button>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Any, 4.0+ or 4.5+, in the segmented style the rest of the app uses for a
 * small set of exclusive choices.
 *
 * Radios rather than buttons, because exactly one of the three is true at a
 * time and a screen reader should be told that before the visitor picks.
 */
function RatingFilter({
  minRating,
  idPrefix,
  onMinRatingChange,
}: {
  minRating: number | undefined
  idPrefix: string
  onMinRatingChange: (rating: number | undefined) => void
}) {
  const options = [
    { value: undefined, label: "Any" },
    ...DIRECTORY_MIN_RATINGS.map((rating) => ({
      value: rating as number | undefined,
      label: `${rating.toFixed(1)}+`,
    })),
  ]

  return (
    <div className="flex flex-col gap-2">
      <span className="font-semibold" id={`${idPrefix}-rating-label`}>
        Rating
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${idPrefix}-rating-label`}
        className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-muted p-0.5 text-muted-foreground"
      >
        {options.map((option) => {
          const active = option.value === minRating
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onMinRatingChange(option.value)}
              className={cn(
                "inline-flex h-7 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
                focusRing,
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
