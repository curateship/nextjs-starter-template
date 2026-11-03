import * as React from "react"
import { ChevronRightIcon, EllipsisVerticalIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * Travel's one dropdown menu, drawn like Project's task menu. The activity's ⋮,
 * Trip settings, the schedule's "+ Add" and its ⋮ are all this one
 * component, so they can't drift apart (Tyler,
 * 3 Nov 2026: "every time you created a dropdown, you made something different
 * so all of the dropdown has slightly different ui").
 *
 * - 294px wide: Project's 363px made 10% narrower twice ("Reduce the dropdown
 *   by 10%", then again).
 * - Folding rows with no lines between them and no gap ("the items dont have
 *   dividers except the divider that seperate the delete"; "reduce space
 *   between items a bit").
 * - Then one line edge to edge, then the actions under it, Delete last in red
 *   ("duplicate goes here").
 */
export function FoldingMenu({
  label,
  busy = false,
  align = "end",
  fit = false,
  trigger,
  onCloseAutoFocus,
  open,
  onOpenChange,
  children,
}: {
  /** What the menu is for, read out by screen readers, such as "More for this trip". */
  label: string
  /** Shows a spinner in place of the dots while an action runs. */
  busy?: boolean
  /**
   * "end" lines the menu's right edge up with the ⋮ and opens it leftward, for a ⋮ at the right of the
   * screen. "start" lines its left edge up with the ⋮ and opens it rightward, for the trip's ⋮ in the left
   * panel (Tyler, 3 Nov 2026: "dropdown to appear aligned right side").
   */
  align?: "start" | "end"
  /**
   * A menu of actions alone is as wide as its longest row, rather than 294px (Tyler, 3 Nov 2026, of "+ Add":
   * "Too much space here"). A menu with folding rows stays 294px, so their fields have room.
   */
  fit?: boolean
  /** The button that opens it, when it isn't the ⋮, such as "+ Add". */
  trigger?: React.ReactNode
  /** Called as it closes, before focus goes back to its button; preventDefault keeps focus where an action put it. */
  onCloseAutoFocus?: (event: Event) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="icon" aria-label={label}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <EllipsisVerticalIcon className="size-4" />}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label={label}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn("max-w-[calc(100vw-1rem)] gap-0 p-0 text-[13px]", fit ? "w-max min-w-40" : "w-[294px]")}
        // The media library, Unsplash, the date picker, time zones and selects open their own boxes from in
        // here; using them isn't leaving the menu.
        onInteractOutside={(event) => {
          const target = event.target
          if (
            target instanceof Element &&
            target.closest("[role=dialog], [role=alertdialog], [data-slot=select-content], [data-slot=popover-content]")
          ) {
            event.preventDefault()
          }
        }}
      >
        {/* The viewport holds the height, so a tall menu scrolls inside the screen rather than running off it. */}
        <ScrollArea viewportClassName="max-h-[min(75vh,40rem)]">
          <div className="grid p-2">{children}</div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/** Which folding rows are open. Each opens and closes on its own. */
export function useOpenSections<Section extends string>() {
  const [shown, setShown] = React.useState<ReadonlySet<Section>>(new Set())
  const toggle = React.useCallback(
    (section: Section) =>
      setShown((was) => {
        const next = new Set(was)
        if (next.has(section)) next.delete(section)
        else next.add(section)
        return next
      }),
    []
  )
  return [shown, toggle] as const
}

/** One folding row: its name on the left, what it holds now on the right, the fields under it when open. */
export function MenuSection({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string
  value: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        {/* The same height, rounding and hover as the action rows under the line. */}
        <button
          type="button"
          className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        >
          <span className="shrink-0">{label}</span>
          <span className="ml-auto min-w-0 truncate text-muted-foreground">{value}</span>
          <ChevronRightIcon
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      {/* The same 8px on every side, so the fields line up 16px from the menu's edge (task "Misc": "The paddings here must be all equal"). */}
      <CollapsibleContent className="p-2 text-sm">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** The one line in the menu, edge to edge, between the folding rows and the actions. */
export function MenuLine() {
  return <div className="-mx-2 my-1 border-t" />
}

/** An action under the line, such as Duplicate. `destructive` draws it red, for Delete. */
export function MenuAction({
  icon,
  destructive = false,
  disabled,
  onClick,
  children,
}: {
  icon: React.ReactNode
  destructive?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "w-full justify-start text-[13px] font-normal",
        destructive && "text-destructive hover:text-destructive"
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </Button>
  )
}
