import * as React from "react"
import { CheckIcon, ListFilterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type CountedFilterGroup<Item> = {
  label: string
  value: readonly string[] | null
  valueOf: (item: Item) => string
  labelOf?: (item: Item) => string
  onChange: (value: string[] | null) => void
}

export function CountedFilterPopover<Item>({
  items,
  groups,
  onClear,
  extra,
  extraActive = 0,
}: {
  items: readonly Item[]
  groups: readonly CountedFilterGroup<Item>[]
  onClear: () => void
  /** More filters after the groups, such as the Journal's Hide practice switch. */
  extra?: React.ReactNode
  /** How many of those are set, for the button's count. */
  extraActive?: number
}) {
  const [open, setOpen] = React.useState(false)
  const active = groups.filter((group) => Boolean(group.value)).length + extraActive

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <ListFilterIcon />
          Filter{active ? ` (${active})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-2 p-0">
        <CountedFilterGroups items={items} groups={groups} />
        {extra ? <div className="border-t p-2.5">{extra}</div> : null}
        <div className="flex items-center justify-between border-t p-2.5">
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear all
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The filter's groups alone, each with its counted choices, split by a line.
 * The popover above draws them, and so does a widget's ⋮
 * (`CountedFilterMenu`).
 */
function CountedFilterGroups<Item>({
  items,
  groups,
}: {
  items: readonly Item[]
  groups: readonly CountedFilterGroup<Item>[]
}) {
  return groups.map((group, index) => (
    <React.Fragment key={group.label}>
      {index > 0 ? <div className="border-t" /> : null}
      <FilterGroup
        label={group.label}
        value={group.value}
        options={countedOptions(items, group.valueOf, group.labelOf)}
        onChange={group.onChange}
      />
    </React.Fragment>
  ))
}

/**
 * The same filter inside a widget's ⋮, in place of its Filter button (Tyler,
 * 10 Nov 2026: "replace it with filter"). Each pick applies at once; Clear
 * filters shows under the groups only while one is set.
 */
export function CountedFilterMenu<Item>({
  items,
  groups,
  onClear,
}: {
  items: readonly Item[]
  groups: readonly CountedFilterGroup<Item>[]
  onClear: () => void
}) {
  const active = groups.some((group) => Boolean(group.value))
  return (
    <div className="grid">
      <CountedFilterGroups items={items} groups={groups} />
      {active ? (
        <div className="border-t p-1.5">
          <Button type="button" variant="ghost" className="w-full justify-start" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** A group's small-caps name in a filter, and in a widget's ⋮ beside one. */
export function FilterHeading({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("text-xs font-medium tracking-wide text-muted-foreground uppercase", className)}>{children}</p>
  )
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: readonly string[] | null
  options: Array<{ value: string; label: string; count: number }>
  onChange: (value: string[] | null) => void
}) {
  const selected = value ?? options.map((option) => option.value)

  return (
    <div className="grid gap-0.5 p-2.5">
      <FilterHeading className="px-2 pb-1">{label}</FilterHeading>
      {options.map((option) => (
        <FilterOption
          key={option.value}
          label={option.label}
          count={option.count}
          selected={selected.includes(option.value)}
          onClick={() => {
            const next = selected.includes(option.value)
              ? selected.filter((one) => one !== option.value)
              : [...selected, option.value]
            onChange(next.length === options.length ? null : next)
          }}
        />
      ))}
    </div>
  )
}

function FilterOption({
  label,
  count,
  selected,
  onClick,
}: {
  label: string
  count: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start"
      role="checkbox"
      aria-checked={selected}
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        data-slot="filter-option-count"
        className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-xs leading-none font-medium text-muted-foreground tabular-nums"
      >
        {count.toLocaleString()}
      </span>
      <CheckIcon
        className={cn("ml-auto size-4", !selected && "opacity-0")}
        aria-hidden
      />
    </Button>
  )
}

function countedOptions<Item>(
  items: readonly Item[],
  valueOf: (item: Item) => string,
  labelOf: ((item: Item) => string) | undefined
) {
  const options = new Map<string, { label: string; count: number }>()
  for (const item of items) {
    const value = valueOf(item)
    const found = options.get(value)
    options.set(value, {
      label: found?.label ?? labelOf?.(item) ?? value,
      count: (found?.count ?? 0) + 1,
    })
  }
  return [...options]
    .map(([value, option]) => ({ value, ...option }))
    .sort((left, right) => left.value.localeCompare(right.value))
}
