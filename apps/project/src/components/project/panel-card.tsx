import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/**
 * A folding card on one of Project's side panels: "Steps · 0 of 2 done",
 * "My week · Oct 12 to 13", "Today's check-in" with a Late badge. The same
 * grey box, border, 15px heading and always-drawn arrow as the shell's
 * `InspectorCard`, with two things Tyler's drawings of 13 Oct 2026 add to
 * the heading: a muted note after the title, and a badge before the arrow.
 * Open or shut is remembered in this browser under `storageId`.
 */
export function PanelCard({
  storageId,
  title,
  meta,
  badge,
  className,
  children,
}: {
  /** Plain characters only; it names the card's remembered open or shut state. */
  storageId: string
  title: string
  /** Muted, after a dot: "0 of 2 done", "4", "Oct 12 to 13". */
  meta?: React.ReactNode
  /** Beside the arrow, such as Late. */
  badge?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard(storageId))
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
      <h2 className="text-[15px] font-semibold">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md text-left select-none",
              focusRingInset
            )}
          >
            <span className="min-w-0 flex-1 truncate">
              {title}
              {meta ? <span className="font-normal text-muted-foreground"> · {meta}</span> : null}
            </span>
            {badge}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/card:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent data-collapse-key={noFlashKey}>
        <div className="mt-4 grid gap-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
