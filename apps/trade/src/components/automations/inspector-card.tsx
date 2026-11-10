import * as React from "react"
import { ChevronDown } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { focusRingInset } from "@/lib/layout/focus-ring"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/*
 * The two pieces every node's settings panel is built from.
 *
 * Their own file rather than the inspector's, because a node points at its
 * panel and the inspector reads that pointer — so a panel reaching back into
 * the inspector for these would be a circle. True of the shell's own nodes and
 * of one an app adds alike.
 */

/**
 * A titled card wrapping one group of node settings — the inspector's version
 * of the modal "every section is its own card" rule. Node tasks compose their
 * field panels from one or more of these.
 *
 * A titled card folds away: hovering it reveals an arrow in the heading,
 * clicking the heading opens and shuts the fields, and the choice is remembered
 * per card in this browser. Same behaviour, and the same arrow, as the cards in
 * Styling settings (`collapsible-settings-card.tsx`).
 */
export function InspectorCard({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    // Plain characters only — the script that keeps a shut card shut before the
    // first paint skips any key it does not recognise on sight.
    collapseStorageKey.settingsCard(
      `automation-node-${(title ?? "").toLowerCase().replace(/[^\w-]+/g, "-")}`
    )
  )

  // The card is grey so the fields sitting on it can be white and read as the
  // parts you type into. Setting that here, once, means a node task writing new
  // fields gets it for free and cannot forget.
  // One column the card's own width: a long field or note wraps inside it
  // rather than stretching the card past a narrow right panel. Its grey, its
  // border and the border's colour come from Settings → Styling → Panel
  // cards, as every grey card in a right panel does (`data-slot="panel-card"`
  // in theme.css; Tyler, 9 Nov 2026: "the right panel card should be wired
  // to the card settings"), so it names no colour of its own.
  const shell = cn(
    "grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg p-3",
    "[&_[data-slot=input]]:bg-background [&_[data-slot=select-trigger]]:bg-background [&_[data-slot=textarea]]:bg-background"
  )
  if (!title)
    return (
      <section data-slot="panel-card" className={shell}>
        {children}
      </section>
    )

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="panel-card"
      className={cn("group/card", shell)}
    >
      <h2 className="text-sm font-semibold">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "group/trigger flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left select-none",
              focusRingInset
            )}
          >
            <span>{title}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover/card:opacity-100 group-focus-visible/trigger:opacity-100 group-data-[state=closed]/trigger:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent data-collapse-key={noFlashKey} className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * A box of information inside a card — something the panel is telling you
 * rather than something you fill in. White on the card's grey, like the fields,
 * so it stands off the card instead of dissolving into it.
 */
export function InspectorNote({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3 text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}
