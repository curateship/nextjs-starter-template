import * as React from "react"
import { CheckIcon, ChevronRightIcon } from "lucide-react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * Copied from Project (`apps/project/src/components/project/pick-rows.tsx`) for
 * the Admin 3 panel design on Travel's menus (Tyler, 6 Nov 2026: "Look at the
 * serttings dropdown, its not ui standard for example. fix them all").
 *
 * A titled group of rows in one bordered list, as Tyler drew the task's ⋮
 * General tab on 6 Nov 2026 (`assets/pasted-image-1793985847218883000.png`):
 * a small muted heading, then the rows with a line between each. `after`
 * sits under the list, such as a hand-over's note.
 */
export function PickGroup({ title, after, children }: { title: string; after?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h3 className="px-0.5 text-sm font-medium text-muted-foreground">{title}</h3>
      {/* Light grey, as every settings list is (Tyler, 6 Nov 2026: "make this bg light gray"). */}
      <div className="divide-y overflow-hidden rounded-xl border bg-muted/50">{children}</div>
      {after}
    </section>
  )
}

/**
 * The media library, Unsplash, the date picker and selects open their own
 * boxes from inside a row; using them isn't leaving the menu (as Travel's
 * folding menu kept it, 3 Nov 2026).
 */
export function keepOpenForInnerBoxes(event: { target: EventTarget | null; preventDefault: () => void }) {
  const target = event.target
  if (
    target instanceof Element &&
    target.closest("[role=dialog], [role=alertdialog], [data-slot=select-content], [data-slot=popover-content], [data-slot=dropdown-menu-content]")
  ) {
    event.preventDefault()
  }
}

export type RowLook = {
  label: string
  value: React.ReactNode
  /** Greys the value, as "None" is. */
  empty?: boolean
  /** Can't be changed here: no arrow, nothing opens. */
  disabled?: boolean
}

/** The row itself: its name on the left, its value on the right with an arrow. */
export const RowButton = React.forwardRef<HTMLButtonElement, RowLook & { open: boolean } & Omit<React.ComponentProps<"button">, "value">>(
  function RowButton({ label, value, empty = false, disabled = false, open, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm enabled:hover:bg-muted disabled:cursor-default",
          open && "bg-muted",
          focusRingInset,
          className
        )}
        {...props}
      >
        <span className="shrink-0 text-muted-foreground">{label}</span>
        <span className={cn("flex min-w-0 flex-1 items-center justify-end gap-2 truncate", empty && "text-muted-foreground/70")}>
          {value}
        </span>
        {disabled ? null : <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />}
      </button>
    )
  }
)

/**
 * A row whose choices open at once, one press to pick (Tyler, 6 Nov 2026: "It
 * doesnt need 2 steps to select. It should be one step to select"): the list
 * drops from the row, the current one ticked, and a pick saves and closes.
 */
export function PickMenuRow({
  options,
  selected,
  onPick,
  ...look
}: RowLook & {
  options: { value: string; label: React.ReactNode }[]
  selected: string
  onPick: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={look.disabled}>
        <RowButton {...look} open={open} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={16} className="max-h-[min(60vh,24rem)] min-w-48">
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => option.value !== selected && onPick(option.value)}>
            {option.label}
            {option.value === selected ? <CheckIcon className="ml-auto size-4" aria-label="Picked" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A row that opens a small box holding its own fields, for what is more than
 * one choice: a typed address, or a whole card such as the Plan. Leaving a
 * field saves it, and Escape closes the box only.
 */
export function PickRow({ children, ...look }: RowLook & { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Leaving a field saves it, so closing first leaves the field being typed in.
        if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur()
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild disabled={look.disabled}>
        <RowButton {...look} open={open} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        collisionPadding={16}
        onInteractOutside={keepOpenForInnerBoxes}
        className="grid w-[min(20rem,calc(100vw-2rem))] gap-4 p-3"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
