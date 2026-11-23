import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

type ZoneRow = { value: string; label: string }

const zoneLabel = (zone: string) => zone.replaceAll("_", " ")

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

/**
 * One time zone, picked from a list you can type into: "tok" finds
 * Asia/Tokyo. Copied from Project's picker, which is Project's own file.
 *
 * `pinned` rows come first, such as "Where I am", then the browser's own
 * zone, then every zone the browser knows in alphabetical order. A saved zone
 * the browser doesn't list is kept and shown at the top, so opening the
 * picker never changes what is stored.
 */
export function TimeZoneSelect({
  id,
  value,
  onChange,
  pinned = [],
  disabled,
  invalid,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  /** Rows above the zones, with values of their own. */
  pinned?: ZoneRow[]
  disabled?: boolean
  invalid?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const rows = useZoneRows(value, pinned)
  const current = rows.find((row) => row.value === value)

  function pick(next: string) {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
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
 * The zones a picker lists: `pinned` first, then a saved zone the browser
 * doesn't know, then the browser's own, then every zone it knows.
 */
export function useZoneRows(value: string, pinned: ZoneRow[] = []) {
  return React.useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"]
    const first = [browserTimeZone()]
    const pinnedValues = new Set(pinned.map((row) => row.value))
    const saved = pinnedValues.has(value) || all.includes(value) ? [] : [value]
    const zones = [...new Set([...saved, ...first, ...all])]
    return [...pinned, ...zones.map((zone) => ({ value: zone, label: zoneLabel(zone) }))]
  }, [pinned, value])
}

/**
 * The search box and the list of zones, for the picker above and for a row
 * that opens straight onto them (the trip ⋮'s Time zone, as Project's
 * `ZoneChoices`). Enter takes the first match, so "tor" then Enter is Toronto.
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
        // The height goes on the scrolling box itself, or the list spills past the dropdown (Tyler, 4 Nov 2026).
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
