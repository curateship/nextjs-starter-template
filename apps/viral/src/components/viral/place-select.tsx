import * as React from "react"
import { CheckIcon, SearchIcon } from "lucide-react"

import { keepOpenForInnerBoxes, RowButton, type RowLook } from "@/components/shared/notes/pick-rows"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import { ANYWHERE, type PlaceOption } from "@/lib/viral/places"

/**
 * One country or one language, picked from a list you can type into: "uni"
 * finds United Kingdom and United States (Tyler, 6 Nov 2026: "Every country
 * + language"). A row of the project's ⋮ that opens straight onto the list,
 * as the Admin 3 panel design has a long list do ("A long list opens with a
 * search box over it"), copied from Travel's `PickChoicesRow` with its time
 * zone list (`apps/travel/src/components/travel/pick-rows.tsx`).
 *
 * Anywhere comes first and is null. A saved code the list doesn't have is
 * kept and shown at the top, so opening the list never changes what is
 * stored.
 */
export function PickPlaceRow({
  value,
  options,
  onPick,
  searchLabel,
  noMatch,
  ...look
}: Omit<RowLook, "value"> & {
  value: string | null
  options: readonly PlaceOption[]
  onPick: (value: string | null) => void
  /** "Search countries", the search box's placeholder and name. */
  searchLabel: string
  /** "No country matches." */
  noMatch: string
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const rows = React.useMemo(() => {
    const kept = value && !options.some((row) => row.value === value) ? [{ value, label: value }] : []
    return [{ value: null, label: ANYWHERE }, ...kept, ...options] as { value: string | null; label: string }[]
  }, [options, value])

  const needle = search.trim().toLowerCase()
  const shown = needle ? rows.filter((row) => row.label.toLowerCase().includes(needle) || row.value?.toLowerCase() === needle) : rows
  const current = rows.find((row) => row.value === value)

  function pick(next: string | null) {
    setOpen(false)
    setSearch("")
    if (next !== value) onPick(next)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch("")
      }}
    >
      <PopoverTrigger asChild disabled={look.disabled}>
        <RowButton {...look} value={current?.label ?? value ?? ANYWHERE} empty={!value} open={open} />
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} onInteractOutside={keepOpenForInnerBoxes} className="w-72 gap-0 p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            // An own Escape: the box's search empties first, the menu stays.
            data-own-escape=""
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              // Enter takes the first match, so "jap" then Enter is Japan.
              if (event.key === "Enter" && shown[0]) {
                event.preventDefault()
                pick(shown[0].value)
              }
            }}
            placeholder={searchLabel}
            aria-label={searchLabel}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{noMatch}</p>
        ) : (
          // The height goes on the scrolling box itself, or the list spills past the dropdown.
          <ScrollArea viewportClassName="max-h-60">
            <div role="listbox" aria-label={searchLabel} className="grid gap-0.5 p-1">
              {shown.map((row) => {
                const on = row.value === value
                return (
                  <button
                    key={row.value ?? "anywhere"}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => pick(row.value)}
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
      </PopoverContent>
    </Popover>
  )
}
