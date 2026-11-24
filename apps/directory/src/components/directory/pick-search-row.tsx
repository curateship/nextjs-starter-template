import * as React from "react"
import { CheckIcon, SearchIcon } from "lucide-react"

import { keepOpenForInnerBoxes, RowButton, type RowLook } from "@/components/shared/notes/pick-rows"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * A long value in a ⋮ row, cut at its end with "…". Bare text in the shell's
 * row is pushed to the right and loses its start instead.
 */
export function RowText({ children }: { children: string }) {
  return <span className="min-w-0 truncate">{children}</span>
}

export type SearchChoice = {
  value: string
  label: string
  /** How far under its parent it sits, for a tree such as the categories. */
  depth?: number
}

/**
 * A ⋮ row whose long list opens with a search box over it, and scrolls in
 * the shell's ScrollArea, not the browser's own bar (Tyler, 24 Nov 2026:
 * "this should use areascroll", of a category's Sits under). It is the
 * design's `PickChoicesRow` with Travel's `ZoneChoices`: the current one
 * ticked, one press picks and closes, Enter picks the first match. A tree
 * shows its depth by indent, and a search answers with the matches alone.
 */
export function PickSearchRow({
  choices,
  selected,
  onPick,
  searchLabel,
  noMatch,
  ...look
}: RowLook & {
  choices: SearchChoice[]
  selected: string
  onPick: (value: string) => void
  /** "Search categories". */
  searchLabel: string
  /** "No category matches." */
  noMatch: string
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const needle = search.trim().toLowerCase()
  const shown = needle ? choices.filter((choice) => choice.label.toLowerCase().includes(needle)) : choices
  const pick = (value: string) => {
    setOpen(false)
    if (value !== selected) onPick(value)
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
        <RowButton {...look} open={open} />
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} onInteractOutside={keepOpenForInnerBoxes} className="w-72 gap-0 p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
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
          // The height goes on the scrolling box itself, never its root, or the list spills past the box.
          <ScrollArea className="min-h-0" viewportClassName="max-h-[min(60vh,24rem)]">
            <div role="listbox" aria-label={look.label} className="grid gap-0.5 p-1">
              {shown.map((choice) => {
                const on = choice.value === selected
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => pick(choice.value)}
                    style={needle || !choice.depth ? undefined : { paddingLeft: `${0.5 + choice.depth}rem` }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      focusRingInset
                    )}
                  >
                    <span className="truncate">{choice.label}</span>
                    {on ? <CheckIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Picked" /> : null}
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
