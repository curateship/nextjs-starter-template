import * as React from "react"
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import type { Category } from "@/lib/api/directory/categories"
import { cn } from "@/lib/utils"

/**
 * The categories a listing, a post or an event is filed under.
 *
 * It replaced a column of checkboxes on 25 Sep 2026. A site with sixty
 * neighbourhoods in it turned three record windows into a page of ticks that
 * had to be scrolled past to reach anything below, and the four already chosen
 * were somewhere in the middle of it. Here the chosen ones are the only ones
 * always on screen, and the rest are a list that typing narrows.
 *
 * A child keeps its parent's name in front of it, as "Neighbourhood ›
 * Yorkville". The indentation that used to say whose child it was is gone the
 * moment a search shows one row out of the middle of the tree.
 */
export function CategoryCombobox({
  idPrefix,
  rows,
  checked,
  disabled,
  onToggle,
}: {
  /** Keeps the field's `id` unique to its form. */
  idPrefix: string
  /** The tree in drawing order, from `categoryTreeOrder`. */
  rows: { category: Category; depth: number }[]
  checked: ReadonlySet<string>
  disabled?: boolean
  onToggle: (categoryId: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  /** Every row's name, and the path a child is shown under. */
  const options = React.useMemo(() => {
    const nameById = new Map(
      rows.map(({ category }) => [category.id, category.name])
    )
    return rows.map(({ category, depth }) => {
      const parentName = category.parentId
        ? nameById.get(category.parentId)
        : null
      return {
        id: category.id,
        name: category.name,
        depth,
        path: parentName ? `${parentName} › ${category.name}` : category.name,
      }
    })
  }, [rows])

  const chosen = options.filter((option) => checked.has(option.id))
  const needle = search.trim().toLowerCase()
  const matches = needle
    ? options.filter((option) => option.path.toLowerCase().includes(needle))
    : options

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No categories exist yet. Create them on the Categories screen and they
        appear here.
      </p>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // A closed box forgets what was typed, so the next open is the whole
        // list rather than the last search still narrowing it.
        if (!next) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={`${idPrefix}-field`}
          disabled={disabled}
          aria-label="Categories"
          className={cn(
            "flex min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-sm transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
            "dark:bg-input/30"
          )}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {chosen.length === 0 ? (
              <span className="text-muted-foreground">Choose categories</span>
            ) : (
              chosen.map((option) => (
                <span
                  key={option.id}
                  className="flex h-6 max-w-full items-center gap-1 rounded-md bg-secondary pr-1 pl-2 text-xs text-secondary-foreground"
                >
                  <span className="truncate">{option.name}</span>
                  {/* Not a <button>: this sits inside the trigger button, and
                      a button inside a button is not valid HTML. Hidden from a
                      screen reader for the same reason, which costs it nothing:
                      the list behind the trigger reaches every category by
                      keyboard and unticks it there. This is a mouse shortcut. */}
                  <span
                    aria-hidden="true"
                    className="flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-foreground/10"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onToggle(option.id)
                    }}
                  >
                    <XIcon className="size-3" />
                  </span>
                </span>
              ))
            )}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) gap-2 p-1.5"
        // The list is what somebody came here for, so the search box keeps the
        // cursor and the arrow keys stay with the rows behind it.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Input
          value={search}
          placeholder="Search categories"
          aria-label="Search categories"
          onChange={(event) => setSearch(event.target.value)}
        />
        {matches.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No category matches that.
          </p>
        ) : (
          <ScrollArea viewportClassName="max-h-64">
            {/* The cap goes on the viewport, not the frame. The viewport is
                `size-full`, so a height on the outside trims the frame and
                leaves the rows below it clipped with no way to reach them. */}
            <div role="listbox" aria-multiselectable="true" className="grid">
              {matches.map((option) => {
                const isChosen = checked.has(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={isChosen}
                    className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                    style={
                      // Only while showing the whole tree. A search prints one
                      // row from the middle of it, and an indent there points
                      // at a parent that is not on screen.
                      !needle && option.depth
                        ? { paddingLeft: `${0.5 + option.depth * 1.25}rem` }
                        : undefined
                    }
                    onClick={() => onToggle(option.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {needle ? option.path : option.name}
                    </span>
                    {isChosen ? (
                      <CheckIcon className="size-4 shrink-0 text-muted-foreground" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
