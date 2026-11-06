import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/**
 * A folding card on one of Project's side panels: "Chat · 4",
 * "My week · Oct 12 to 13", "Today's check-in" with a Late badge. The same
 * grey box, border, 15px heading and arrow as the shell's `InspectorCard`,
 * with two things Tyler's drawings of 13 Oct 2026 add to the heading: a muted
 * note after the title, and a badge before the arrow. Open or shut is
 * remembered in this browser under `storageId`.
 *
 * The card's own buttons and the arrow show only while the card is pointed
 * at, or holds the keyboard's visible focus (a click leaves none), folded or
 * open. Tyler drew the task panel's cards that way on 14 Oct 2026 and made it
 * every card's rule on 20 Oct 2026; a button whose dropdown is open stays in
 * view. On a screen with no pointer to hover, they always show.
 */
export function PanelCard({
  storageId,
  title,
  meta,
  after,
  badge,
  action,
  actionOpen = false,
  className,
  children,
}: {
  /** Plain characters only; it names the card's remembered open or shut state. */
  storageId: string
  title: string
  /** Muted, after a dot: "4", "Oct 12 to 13". */
  meta?: React.ReactNode
  /** After the title with a gap and no dot, such as a status: "Status   ● At risk". */
  after?: React.ReactNode
  /** Beside the arrow, such as Late. */
  badge?: React.ReactNode
  /** A button of the card's own beside the arrow, such as a cog that opens a dropdown. */
  action?: React.ReactNode
  /** The action's dropdown is open, so a `quiet` card keeps it in view. */
  actionOpen?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard(storageId))
  const quietClass = "opacity-0 transition-opacity group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 [@media(hover:none)]:opacity-100"
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "group/card min-w-0 rounded-lg border bg-muted/40 p-4",
        // Fields sit on the page background, so a box to type in never looks
        // like part of the grey card.
        "[&_[data-slot=input]]:bg-background [&_[data-slot=select-trigger]]:bg-background [&_[data-slot=textarea]]:bg-background",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn("flex w-full cursor-pointer items-center rounded-md text-left select-none", focusRingInset)}
            >
              <span className="min-w-0 flex-1 truncate">
                {title}
                {meta ? <span className="font-normal text-muted-foreground"> · {meta}</span> : null}
                {after ? <span className="ml-2">{after}</span> : null}
              </span>
            </button>
          </CollapsibleTrigger>
        </h2>
        {badge}
        {action ? <span className={cn("flex", !actionOpen && quietClass)}>{action}</span> : null}
        {/* The heading is the button that folds the card; the arrow is the
            same press for the pointer, and left out of the keyboard's way. */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className={cn("flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md", quietClass)}
          >
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/card:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent data-collapse-key={noFlashKey}>
        <div className="mt-4 grid gap-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A row of buttons under what they act on, wrapping in a narrow panel. */
export function PanelCardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
}
