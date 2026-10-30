import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/**
 * One part of the Daily card, such as deep work or the routine, on a light
 * gray ground with a border, drawn like the panel's other cards (Tyler, 30
 * Oct 2026: "It looks too busy with all the sections, we need to clean it
 * up. try putting them in light gray bg", then "the daily section cards is
 * missing border").
 */
const BOX = "grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border bg-muted/40 p-3"

/**
 * A section with a `title` folds: pressing the heading, or the arrow that
 * shows while it is pointed at, folds it to its heading, and this browser
 * remembers it under `foldId` (Tyler, 30 Oct 2026: "Add collapsible to the
 * cards in my daily card"). `action` sits at the heading's right, such as Tick
 * yesterday. A section with no heading, such as the afternoon's progress line,
 * doesn't fold.
 */
export function DailySection({
  title,
  foldId,
  action,
  className,
  children,
}: {
  title?: React.ReactNode
  /** Plain characters; names the section's remembered open or folded state. */
  foldId?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  if (!title || !foldId) return <div className={cn(BOX, className)}>{children}</div>
  return (
    <FoldingSection title={title} foldId={foldId} action={action} className={className}>
      {children}
    </FoldingSection>
  )
}

function FoldingSection({
  title,
  foldId,
  action,
  className,
  children,
}: {
  title: React.ReactNode
  foldId: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard(`project-daily-${foldId}`))
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn(BOX, "group/section", className)}>
      <div className="flex min-h-5 items-center gap-2">
        <h3 className="min-w-0 flex-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full cursor-pointer items-center rounded-md text-left text-xs font-medium tracking-wide text-muted-foreground uppercase select-none",
                focusRingInset
              )}
            >
              <span className="min-w-0 flex-1 truncate">{title}</span>
            </button>
          </CollapsibleTrigger>
        </h3>
        {action}
        {/* The heading is the button; the arrow is the same press for the pointer,
            left out of the keyboard's way, and shown while the section is pointed at. */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity group-hover/section:opacity-100 group-has-[:focus-visible]/section:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/section:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent data-collapse-key={noFlashKey} className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
