import { FilterIcon } from "lucide-react"

import {
  DashboardToolbarButton,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  activeFilterCount,
  LAST_FILTER_LABELS,
  POSTS_FILTER_LABELS,
  type SocialCreatorsQuery,
  type SocialLastFilter,
  type SocialPostsFilter,
} from "@/lib/trade/social/creators-query"
import { plural } from "@/lib/format/plural"

/**
 * The two filters, in one place and drawn twice.
 *
 * Side by side on a desktop toolbar, and behind a single button on a phone,
 * where the controls plus a search box wrap into a block taller than the list
 * they filter. The button says how many are on, so a list narrowed by a filter
 * you cannot see never looks like a list with rows missing.
 *
 * There was a third, a "gone quiet" tick, until Tyler dropped it on
 * 29 Sep 2026: it picked exactly the same creators as "Gone quiet, over a
 * month" in the Last post list, and two controls doing one job is one too
 * many.
 */
export function CreatorFilters({
  query,
  onChange,
}: {
  query: SocialCreatorsQuery
  onChange: (next: Partial<SocialCreatorsQuery>) => void
}) {
  return (
    <>
      <Select
        value={query.posts}
        onValueChange={(value) =>
          onChange({ posts: value as SocialPostsFilter })
        }
      >
        <DashboardToolbarSelectTrigger aria-label="Filter by posts held">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          {Object.entries(POSTS_FILTER_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={query.last}
        onValueChange={(value) => onChange({ last: value as SocialLastFilter })}
      >
        <DashboardToolbarSelectTrigger aria-label="Filter by last post">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          {Object.entries(LAST_FILTER_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

/** The same filters on a narrow screen, behind one button. */
export function CreatorFiltersButton({
  query,
  onChange,
}: {
  query: SocialCreatorsQuery
  onChange: (next: Partial<SocialCreatorsQuery>) => void
}) {
  const on = activeFilterCount(query)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <DashboardToolbarButton type="button" variant="outline">
          <FilterIcon className="size-4" />
          {on === 0 ? "Filters" : `${on} ${plural(on, "filter", "filters")} on`}
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-64 gap-3">
        <CreatorFilters query={query} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}
