import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * Every zone name this browser knows, read once. `UTC` is added because some
 * engines leave it out of the list although every one of them accepts it.
 */
let zoneList: string[] | null = null
function allZones() {
  if (!zoneList) {
    let zones: string[] = []
    try {
      zones = Intl.supportedValuesOf("timeZone")
    } catch {
      zones = []
    }
    zoneList = zones.includes("UTC") ? zones : ["UTC", ...zones]
  }
  return zoneList
}

/** "America/New_York" reads as "America/New York". The saved value is untouched. */
function zoneLabel(zone: string) {
  return zone.replaceAll("_", " ")
}

/**
 * The timezone in Settings → Profile: pick one from a list you can search,
 * rather than type an exact code.
 *
 * Single-pick, so it is not the shared `MultiCombobox`, but it is built the
 * same way, from the Popover and ScrollArea, with the trigger wearing the
 * Select's own classes so it sits at the standard 32px.
 *
 * - The browser's own zone comes first, marked as yours.
 * - **A saved zone the list does not know is kept and shown**, at the top and
 *   ticked. An engine's list changes over time and an old row can name a zone
 *   that has since been merged; a picker that quietly swapped it would move
 *   somebody's day boundary the next time they pressed Save.
 * - Search matches anywhere in the name, with spaces for underscores, so
 *   "lisbon" and "new york" both find their zone.
 */
export function TimezonePicker({
  id,
  value,
  browserZone,
  onChange,
  invalid,
  disabled,
}: {
  id?: string
  value: string
  browserZone: string
  onChange: (zone: string) => void
  invalid?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const listRef = React.useRef<HTMLDivElement>(null)

  const rows = React.useMemo(() => {
    const zones = allZones()
    const known = new Set(zones)
    const first = [
      ...(value && !known.has(value) ? [value] : []),
      ...(known.has(browserZone) && browserZone !== value ? [browserZone] : []),
    ]
    const picked = known.has(value) ? [value] : []
    const lead = [...new Set([...first, ...picked])]
    return [...lead, ...zones.filter((zone) => !lead.includes(zone))]
  }, [value, browserZone])

  const needle = search.trim().toLowerCase().replaceAll("_", " ")
  const shown = needle
    ? rows.filter((zone) => zoneLabel(zone).toLowerCase().includes(needle))
    : rows

  const pick = (zone: string) => {
    onChange(zone)
    setOpen(false)
    setSearch("")
  }

  // Up and down move between the options; the search box hands over to the
  // first one. Enter and Space press the focused option, as any button does.
  const moveFocus = (from: HTMLElement | null, step: 1 | -1) => {
    const options = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role=option]"
      ) ?? []),
    ]
    if (!options.length) return
    const index = from ? options.indexOf(from as HTMLButtonElement) : -1
    const next = options[Math.min(options.length - 1, Math.max(0, index + step))]
    next?.focus()
    next?.scrollIntoView({ block: "nearest" })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch("")
      }}
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
            "flex h-8 w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none select-none sm:w-80",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50",
            "dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            focusRing
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? zoneLabel(value) : "Pick a timezone"}
          </span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                moveFocus(null, 1)
              } else if (event.key === "Enter" && shown[0]) {
                event.preventDefault()
                pick(shown[0])
              }
            }}
            placeholder="Search, e.g. Lisbon"
            aria-label="Search timezones"
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No timezone matches that
          </p>
        ) : (
          <ScrollArea className="max-h-64">
            <div
              ref={listRef}
              role="listbox"
              aria-label="Timezones"
              className="grid gap-0.5 p-1"
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault()
                  moveFocus(
                    event.target as HTMLElement,
                    event.key === "ArrowDown" ? 1 : -1
                  )
                }
              }}
            >
              {shown.map((zone) => {
                const on = zone === value
                return (
                  <button
                    key={zone}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => pick(zone)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      focusRingInset
                    )}
                  >
                    <span className="truncate">
                      {zoneLabel(zone)}
                      {zone === browserZone ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · your browser
                        </span>
                      ) : null}
                    </span>
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
