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
}: {
  items: readonly Item[]
  groups: readonly CountedFilterGroup<Item>[]
  onClear: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const active = groups.filter((group) => Boolean(group.value)).length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <ListFilterIcon />
          Filter{active ? ` (${active})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-2 p-0">
        {groups.map((group, index) => (
          <React.Fragment key={group.label}>
            {index > 0 ? <div className="border-t" /> : null}
            <FilterGroup
              label={group.label}
              value={group.value}
              options={countedOptions(items, group.valueOf, group.labelOf)}
              onChange={group.onChange}
            />
          </React.Fragment>
        ))}
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
      <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
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
