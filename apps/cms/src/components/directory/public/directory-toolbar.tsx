import * as React from "react"
import { Link } from "@tanstack/react-router"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PublicCategory } from "@/lib/api/directory/public"
import {
  DIRECTORY_SORTS,
  DIRECTORY_SORT_LABELS,
  type DirectoryBrowseSearch,
  type DirectorySort,
} from "@/lib/directory/public-search"
import { focusRing } from "@/lib/layout/focus-ring"
import { useSearchBoxText } from "@/lib/nav/list-search"
import { cn } from "@/lib/utils"

/**
 * The controls above the browse list: a search box, the category chips and the
 * order.
 *
 * All three write to the address rather than to memory, so a filtered list can
 * be sent to somebody, kept through a refresh, and returned to with Back after
 * opening a listing. The search box keeps what is being typed locally and only
 * puts it in the address once typing pauses — without that, every keystroke
 * would be a navigation and a fetch.
 */
export function DirectoryToolbar({
  current,
  sort,
  categories,
  onSearchChange,
  onSortChange,
}: {
  /** The address as it stands, so a chip can keep everything it is not changing. */
  current: DirectoryBrowseSearch
  sort: DirectorySort
  categories: PublicCategory[]
  onSearchChange: (value: string) => void
  onSortChange: (value: DirectorySort) => void
}) {
  // The shell's own search-box behaviour, not a second copy of it: the box
  // keeps what is being typed, the address catches up once typing pauses, and
  // Back or a pasted link puts the box back in step.
  const [text, setText] = useSearchBoxText(current.q ?? "", onSearchChange)

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search listings"
          aria-label="Search listings"
          className="sm:max-w-xs"
        />
        {/* `shrink-0` because the trigger is only as wide as its own words —
            without it the row squeezes it down to the arrow alone. */}
        <div className="shrink-0 sm:ml-auto">
          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as DirectorySort)}
          >
            <SelectTrigger aria-label="Order listings by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTORY_SORTS.map((option) => (
                <SelectItem key={option} value={option}>
                  {DIRECTORY_SORT_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {categories.length ? (
        <CategoryChips categories={categories} current={current} />
      ) : null}
    </div>
  )
}

/**
 * One chip per category with something published in it, plus an "All" chip.
 *
 * Real links rather than buttons, so a chip can be opened in a new tab and a
 * search engine can follow it — a filtered directory is a page in its own
 * right, not a state the browser happens to be in.
 */
function CategoryChips({
  categories,
  current,
}: {
  categories: PublicCategory[]
  current: DirectoryBrowseSearch
}) {
  return (
    <ul className="flex flex-wrap gap-1">
      <li>
        <Chip current={current} category={undefined} active={!current.category}>
          All
        </Chip>
      </li>
      {categories.map((row) => (
        <li key={row.id}>
          <Chip
            current={current}
            category={row.slug}
            active={row.slug === current.category}
          >
            {row.name}
            <span className="ml-1 opacity-70">{row.listingCount}</span>
          </Chip>
        </li>
      ))}
    </ul>
  )
}

function Chip({
  current,
  category,
  active,
  children,
}: {
  current: DirectoryBrowseSearch
  category: string | undefined
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to="/directory"
      // The search and the order are kept — picking a category should not
      // silently throw away what somebody typed — but the page number goes,
      // because page 4 of the old list is nowhere in the new one.
      search={{ q: current.q, sort: current.sort, category }}
      aria-current={active ? "page" : undefined}
      className={cn(
        // A plain `border` with no colour named, so the Divider lines setting
        // reaches these the way it reaches every other line in the app.
        "inline-flex h-8 items-center rounded-md border px-3 text-sm",
        focusRing,
        active
          ? // Filled *and* bolder: the state has to survive somebody who
            // cannot tell the two backgrounds apart.
            "bg-primary font-medium text-primary-foreground"
          : "bg-card text-foreground hover:bg-accent"
      )}
    >
      {children}
    </Link>
  )
}
