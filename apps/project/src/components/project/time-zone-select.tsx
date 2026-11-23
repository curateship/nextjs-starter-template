import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import { useZoneRows, zoneLabel, type ZoneRow } from "@/lib/project/zone-rows"
import { cn } from "@/lib/utils"


/**
 * One time zone, picked from a list you can type into: "tor" finds
 * America/Toronto. Used for the team's zone, a person's own zone and a new
 * team's zone, so all three read and search the same way.
 *
 * `pinned` rows come first, such as "The team's (America/Toronto)", then the
 * browser's own zone and the team's, then every zone the browser knows in
 * alphabetical order. A saved zone the browser doesn't list is kept and shown
 * at the top, so opening the picker never changes what is stored.
 *
 * It is the shell's `MultiCombobox` cut down to one pick, built here from the
 * same Popover and ScrollArea, because the shell has no single-pick version.
 */
export function TimeZoneSelect({
  id,
  value,
  onChange,
  pinned = [],
  teamZone,
  disabled,
  invalid,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  /** Rows above the zones, with values of their own. */
  pinned?: ZoneRow[]
  /** The team's zone, listed near the top. */
  teamZone?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const rows = useZoneRows(value, pinned, teamZone)
  const current = rows.find((row) => row.value === value)

  function pick(next: string) {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
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
          <span className="truncate">{current?.label ?? zoneLabel(value)}</span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <ZoneChoices rows={rows} value={value} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The picker's insides: a search box over the zones, the current one ticked.
 * Enter takes the first match, so "tor" then Enter is Toronto. My settings'
 * Time zone row opens straight onto it (Tyler, 6 Nov 2026: "general should
 * have the same grouping ui design too").
 */
export function ZoneChoices({ rows, value, onPick }: { rows: ZoneRow[]; value: string; onPick: (zone: string) => void }) {
  const [search, setSearch] = React.useState("")
  const needle = search.trim().toLowerCase().replaceAll("_", " ")
  const shown = needle ? rows.filter((row) => row.label.toLowerCase().includes(needle)) : rows
  return (
    <>
      <div className="flex items-center gap-2 border-b px-3">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          autoFocus
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && shown[0]) {
              event.preventDefault()
              onPick(shown[0].value)
            }
          }}
          placeholder="Search time zones"
          aria-label="Search time zones"
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {shown.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No time zone matches.</p>
      ) : (
        // The limit is on the part that scrolls, so the list stays inside its box.
        <ScrollArea className="min-h-0" viewportClassName="max-h-60">
          <div role="listbox" aria-label="Time zones" className="grid gap-0.5 p-1">
            {shown.map((row) => {
              const on = row.value === value
              return (
                <button
                  key={row.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onPick(row.value)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                    focusRingInset
                  )}
                >
                  <span className="truncate">{row.label}</span>
                  {on ? <CheckIcon className="size-4 shrink-0 text-muted-foreground" /> : null}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </>
  )
}
