import { Chip } from "@/components/crm/crm-table"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { FilterPopover } from "@/components/shared/filter-popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { waitedText, waitedTooLong } from "@/lib/directory/listings-dashboard-page"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { cn } from "@/lib/utils"

/**
 * What the four queues (Submissions, Claims, Owner changes and Reports)
 * share: the chip saying how long a record has waited, and the Status filter
 * that opens on the waiting ones (Tyler's polish picks, 18 Nov 2026).
 */

/** The chip saying how long a waiting record has waited, amber from three days (Tyler, 18 Nov 2026). */
export function WaitedChip({ since }: { since: Date | string }) {
  const long = waitedTooLong(since)
  return (
    <Chip muted={!long} className={cn(long && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
      {waitedText(since)}
    </Chip>
  )
}

/** A queue's Status filter, Waiting first and open by default, then the rest, then every one. */
export function QueueStatusFilter({
  id,
  value,
  options,
  waiting,
}: {
  id: string
  /** The status in the address, "all", or none for the waiting one. */
  value: string | undefined
  options: { value: string; label: string }[]
  waiting: string
}) {
  const setListSearch = useListSearchNavigate()
  const shown = value ?? waiting
  return (
    <FilterPopover
      contentClassName="w-60"
      count={value ? 1 : 0}
      onClear={() => setListSearch({ status: undefined, page: undefined })}
      save={null}
    >
      <FilterRow id={id} label="Status">
        <Select
          value={shown}
          onValueChange={(next) => setListSearch({ status: next === waiting ? undefined : next, page: undefined })}
        >
          <SelectTrigger id={id} className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </FilterRow>
    </FilterPopover>
  )
}

