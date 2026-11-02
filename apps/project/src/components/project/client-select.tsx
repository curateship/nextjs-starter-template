import * as React from "react"
import { CheckIcon, ChevronDownIcon, PlusIcon, SearchIcon } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import { LIMITS } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

type Row = { value: string | null; label: string; isNew?: boolean }

/** What the picker names: a project's client, or its category (Misc 5, 2 Nov 2026). */
const WORDS = {
  client: { none: "No client", find: "Find or type a client", list: "Clients", max: LIMITS.clientName },
  category: { none: "No category", find: "Find or type a category", list: "Categories", max: LIMITS.categoryName },
} as const

/**
 * A project's client or category: picked from the names already used, or
 * typed new. Typing a name the list doesn't have offers "Use "Hart Dental""
 * first, and Enter takes the first row. Picking a name that differs only in
 * capitals takes the one already used, so one name never splits into two
 * groups. Built like `TimeZoneSelect`.
 */
export function ClientSelect({
  id,
  kind = "client",
  value,
  names,
  onChange,
  disabled,
}: {
  id?: string
  kind?: keyof typeof WORDS
  value: string | null
  /** The names to pick from. */
  names: string[]
  onChange: (name: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const words = WORDS[kind]

  const typed = search.trim().slice(0, words.max)
  const needle = typed.toLowerCase()
  const known = names.find((name) => name.toLowerCase() === needle)
  const rows: Row[] = [
    ...(typed && !known ? [{ value: typed, label: `Use "${typed}"`, isNew: true }] : []),
    ...(needle ? [] : [{ value: null, label: words.none }]),
    ...names.filter((name) => !needle || name.toLowerCase().includes(needle)).map((name) => ({ value: name, label: name })),
  ]

  function pick(next: string | null) {
    setOpen(false)
    setSearch("")
    if (next !== value) onChange(next)
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
          disabled={disabled}
          className={cn(
            "flex h-8 w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none select-none sm:w-64",
            "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
            focusRing
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ?? words.none}</span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            maxLength={words.max}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && rows[0]) {
                event.preventDefault()
                pick(rows[0].value)
              }
            }}
            placeholder={words.find}
            aria-label={words.find}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ScrollArea className="max-h-60">
          <div role="listbox" aria-label={words.list} className="grid gap-0.5 p-1">
            {rows.map((row) => {
              const selected = !row.isNew && row.value === value
              return (
                <button
                  key={`${row.isNew ? "new:" : ""}${row.value ?? ""}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(row.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    focusRingInset
                  )}
                >
                  {row.isNew ? (
                    <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <CheckIcon className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                  )}
                  <span className={cn("truncate", row.value === null && "text-muted-foreground")}>{row.label}</span>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
