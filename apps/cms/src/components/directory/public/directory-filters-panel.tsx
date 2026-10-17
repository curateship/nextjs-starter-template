import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { filterChipClass } from "@/components/directory/public/filter-chip"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DirectoryFieldFilter } from "@/lib/directory/field-filters"
import type {
  DirectoryFilterGroup,
  DirectoryFilterOption,
} from "@/lib/directory/filter-groups"
import { DIRECTORY_MIN_RATINGS } from "@/lib/directory/public-search"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * One "Filters" button beside the order, opening every filter at once.
 *
 * Drawn to Tyler's mock of 17 Oct 2026: a heading per kind of filter and a
 * row of chips under each. The category groups come first ("Neighbourhood",
 * "Cuisine"), then Rating, then each choice field the site marked as a filter
 * under its own name ("Price"), then the yes or no fields under the name of
 * the section they belong to ("Amenities"). It replaced a row of one button per
 * group, which wrapped onto three lines on a phone once a site added fields.
 *
 * **Every chip changes the page straight away**, and the address with it.
 * "Show results" shuts the panel over a list that has already changed. That
 * is what lets each yes or no chip carry a count that matches the list it
 * gives: the server counts it under whatever is already ticked.
 */

/** Chips shown in a group before the rest fold behind "More…". */
const CHIPS_BEFORE_MORE = 4

export type DirectoryFiltersPanelProps = {
  groups: DirectoryFilterGroup[]
  /** The ticked category slugs, from the address. */
  selected: string[]
  onToggleCategory: (slug: string) => void
  minRating: number | undefined
  onMinRatingChange: (rating: number | undefined) => void
  fieldFilters: DirectoryFieldFilter[]
  /** The ticked field filter tokens, from the address. */
  selectedFields: string[]
  onToggleField: (token: string) => void
  /** Empties every filter in the panel, and nothing outside it. */
  onClearFilters: () => void
}

type Block = {
  key: string
  heading: string
  options: DirectoryFilterOption[]
  /** Yes or no chips print their count, as the mock draws them. */
  counted: boolean
}

/**
 * The field filters as headed blocks: each choice a block of its own, then the
 * yes or no fields of one section sharing one block. Choices come first, as
 * in the mock ("Price" above "Amenities"), and each kind keeps the order the
 * site defined them in.
 */
function fieldBlocks(fieldFilters: DirectoryFieldFilter[]): Block[] {
  const choices: Block[] = []
  const yesNo: Block[] = []
  const bySection = new Map<string, Block>()
  for (const field of fieldFilters) {
    if (field.kind === "select") {
      choices.push({
        key: field.id,
        heading: field.name,
        options: field.options,
        counted: false,
      })
      continue
    }
    const sectionKey = field.id.split(".")[0] ?? field.id
    const existing = bySection.get(sectionKey)
    if (existing) {
      existing.options.push(...field.options)
      continue
    }
    const block = {
      key: sectionKey,
      heading: field.sectionName,
      options: [...field.options],
      counted: true,
    }
    bySection.set(sectionKey, block)
    yesNo.push(block)
  }
  return [...choices, ...yesNo]
}

export function DirectoryFiltersPanel({
  groups,
  selected,
  onToggleCategory,
  minRating,
  onMinRatingChange,
  fieldFilters,
  selectedFields,
  onToggleField,
  onClearFilters,
}: DirectoryFiltersPanelProps) {
  const [open, setOpen] = React.useState(false)
  const active =
    selected.length + selectedFields.length + (minRating === undefined ? 0 : 1)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Drawn like the "Sort by" trigger beside it, so the two read as a
          pair. Full contrast while something is on. */}
      <PopoverTrigger
        className={cn(
          "group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-transparent pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors hover:bg-muted/60 dark:bg-input/30",
          focusRing,
          active ? "border-foreground font-medium" : null
        )}
      >
        Filters
        {active ? (
          <span className="text-muted-foreground tabular-nums">({active})</span>
        ) : null}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </PopoverTrigger>
      {/* Kept 16px inside the window, and never taller than the room it has:
          on a phone the panel opens wherever there is more space, and its
          chips scroll while Clear all and Show results stay in view. */}
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="w-[min(32rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <ScrollArea viewportClassName="max-h-[min(32rem,calc(var(--radix-popover-content-available-height)-4.5rem))]">
          <div className="flex flex-col gap-5 p-5">
            {groups.map((group) => (
              <ChipBlock
                key={group.id}
                heading={group.name}
                options={group.options}
                selected={selected}
                onToggle={onToggleCategory}
              />
            ))}

            <section className="flex flex-col gap-2.5">
              <h3 id="directory-filter-rating" className="text-sm font-semibold">
                Rating
              </h3>
              {/* Radios rather than toggles: exactly one of the three is true
                  at a time, and a screen reader is told so. */}
              <div
                role="radiogroup"
                aria-labelledby="directory-filter-rating"
                className="flex flex-wrap gap-2"
              >
                {[undefined, ...DIRECTORY_MIN_RATINGS].map((rating) => {
                  const on = rating === minRating
                  return (
                    <button
                      key={rating ?? "any"}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onMinRatingChange(rating)}
                      className={filterChipClass(on)}
                    >
                      {rating === undefined ? "Any" : `${rating.toFixed(1)}+`}
                    </button>
                  )
                })}
              </div>
            </section>

            {fieldBlocks(fieldFilters).map((block) => (
              <ChipBlock
                key={block.key}
                heading={block.heading}
                options={block.options}
                selected={selectedFields}
                onToggle={onToggleField}
                counted={block.counted}
              />
            ))}
          </div>
        </ScrollArea>
        {/* The line above the footer runs the panel's whole width, which is
            why the panel has no padding of its own. */}
        <div className="flex items-center justify-between gap-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={onClearFilters}
          >
            Clear all
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            Show results
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * A heading and its chips. A long group shows its first four and "More…",
 * which opens the rest in place; a ticked chip past the fourth is always
 * shown, or it could only be unticked by opening the group first.
 */
function ChipBlock({
  heading,
  options,
  selected,
  onToggle,
  counted = false,
}: {
  heading: string
  options: DirectoryFilterOption[]
  selected: string[]
  onToggle: (slug: string) => void
  counted?: boolean
}) {
  const [expanded, setExpanded] = React.useState(false)
  const folds = options.length > CHIPS_BEFORE_MORE + 1
  const shown =
    folds && !expanded
      ? options.filter(
          (option, index) =>
            index < CHIPS_BEFORE_MORE || selected.includes(option.slug)
        )
      : options

  return (
    <section className="flex flex-col gap-2.5" aria-label={heading}>
      <h3 className="text-sm font-semibold">{heading}</h3>
      <div className="flex flex-wrap gap-2">
        {shown.map((option) => {
          const on = selected.includes(option.slug)
          return (
            <button
              key={option.slug}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(option.slug)}
              className={filterChipClass(on)}
            >
              {option.name}
              {counted ? (
                <span className="ml-1 tabular-nums">({option.count})</span>
              ) : null}
            </button>
          )
        })}
        {folds ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className={cn(filterChipClass(false), "text-muted-foreground")}
          >
            {expanded ? "Fewer" : "More…"}
          </button>
        ) : null}
      </div>
    </section>
  )
}
