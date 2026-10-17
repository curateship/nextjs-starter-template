import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * Pick several things from a list you can search.
 *
 * Built from the Popover, ScrollArea and Badge already here rather than from
 * `cmdk`, which would have been a dependency for one control. The trigger wears
 * the Select's own classes so a combobox and a select standing next to each
 * other are the same height and the same shape, which is what they are in the
 * segment rules.
 *
 * **A value that is not in `options` is still kept and still shown.** A saved
 * rule can name a tag nobody carries any more, and a picker that quietly
 * dropped it would change what the rule matches the next time somebody opened
 * it and pressed Save. Those rows sit at the top of the list, ticked, so the
 * only way to lose one is to untick it on purpose.
 */
export function MultiCombobox({
  id,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder = "Search",
  emptyLabel = "Nothing to pick from",
  noMatchLabel = "No matches",
  invalid,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string
  /** What is picked, in the order it will be saved. */
  value: readonly string[]
  /** Everything on offer, which need not contain everything picked. */
  options: readonly string[]
  onChange: (value: string[]) => void
  /** Shown in the trigger while nothing is picked. */
  placeholder?: string
  searchPlaceholder?: string
  /** Shown in place of the list when there is nothing on offer at all. */
  emptyLabel?: string
  /** Shown when the search matches none of them. */
  noMatchLabel?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
  "aria-label"?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  // Saved data can hold the same value twice: the tag rule was a comma-separated
  // text field for months and nothing refused "a, a". Drawn twice it would be
  // two rows under one React key, so it is made unique once, here, and both the
  // trigger and the list read the result.
  const chosen = React.useMemo(() => [...new Set(value)], [value])

  // Picked values the list does not offer come first, so a rule that names a
  // tag nobody carries any more still shows what it is matching.
  const rows = React.useMemo(() => {
    const offered = new Set(options)
    const orphans = chosen.filter((one) => !offered.has(one))
    return [...orphans, ...new Set(options)]
  }, [options, chosen])

  const needle = search.trim().toLowerCase()
  const shown = needle
    ? rows.filter((row) => row.toLowerCase().includes(needle))
    : rows

  const picked = new Set(chosen)
  // Writes the de-duplicated list back, so a rule that arrived with a repeat
  // loses it the first time somebody touches the field rather than carrying it
  // forward for ever.
  const toggle = (row: string) => {
    onChange(
      picked.has(row) ? chosen.filter((one) => one !== row) : [...chosen, row]
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // The search belongs to one visit, not to the control. Leaving it
        // behind means reopening the list shows it already filtered, with no
        // sign of why most of the rows are missing.
        if (!next) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "flex h-8 w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none select-none",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50",
            "dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            focusRing,
            className
          )}
        >
          {chosen.length === 0 ? (
            <span className="truncate text-muted-foreground">
              {placeholder}
            </span>
          ) : (
            // One line, clipped. The list below is where the whole set is read;
            // a trigger that grew with every pick would push the rules apart.
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              {chosen.map((one) => (
                <Badge key={one} variant="secondary" className="shrink-0">
                  {one}
                </Badge>
              ))}
            </span>
          )}
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {noMatchLabel}
          </p>
        ) : (
          <ScrollArea className="max-h-60">
            <div className="grid gap-0.5 p-1">
              {shown.map((row) => {
                const on = picked.has(row)
                return (
                  <button
                    key={row}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(row)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      focusRingInset
                    )}
                  >
                    <span className="truncate">{row}</span>
                    {on ? (
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
