import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FieldLabel } from "@/components/ui/field-label"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/**
 * One group of settings in a cog's dropdown, as Tyler drew it on 14 Oct 2026.
 * Shut, it reads like Trade's order-window card (`apps/trade/src/components/trade/option-card.tsx`):
 * its name, what it is set to on the right, and an arrow. Open, a 15px
 * heading, an optional line saying what it is for, then its fields one per
 * row. The shell card has no answer on the right and no tick box, so this is
 * Project's own.
 *
 * It is flat, with no box: rows sit straight on the dropdown with a line
 * between them that runs to its edges (Tyler, 20 Oct 2026: "move all of these
 * outside the cards (flatten it)"). The dropdown holding them has no padding
 * or gap of its own, so the lines reach its sides.
 *
 * Each card starts shut and remembers in this browser whether it was left
 * open. `toggle` puts a tick box before the name for a setting that is on or
 * off; the box switches it and the arrow shows its fields, never both. A card
 * with no fields has no arrow.
 */
export function OptionCard({
  id,
  title,
  hint,
  description,
  toggle,
  summary,
  children,
}: {
  /** Ties the tick box to the name, and names the remembered open or shut state. */
  id: string
  title: string
  hint?: React.ReactNode
  /** One line under the heading, while open, saying what the card is for. */
  description?: React.ReactNode
  toggle?: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }
  /** "Admin", "Oct 19": printed on the right so a shut card still answers. */
  summary?: React.ReactNode
  children?: React.ReactNode
}) {
  const [remembered, setOpen] = useRememberedCollapse(collapseStorageKey.settingsCard(id), false)
  const canFold = Boolean(children)
  const open = canFold && remembered
  const showSummary = !open && summary !== undefined && summary !== null

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      // min-w-0: a long answer is cut short rather than pushing the row past the dropdown's edge.
      className="group/option min-w-0 border-b px-4 py-3 last:border-b-0"
    >
      <div
        className={cn("flex min-h-6 items-center gap-2", canFold && "cursor-pointer")}
        // The whole strip folds the card; the tick box, the hint and the arrow keep their own jobs.
        onClick={(event) => {
          if (!canFold) return
          const target = event.target as Element
          if (target.closest("button, input, [role='checkbox']")) return
          if (toggle && target.closest("label")) return
          setOpen(!open)
        }}
      >
        {toggle ? (
          <Checkbox
            id={id}
            checked={toggle.checked}
            disabled={toggle.disabled}
            onCheckedChange={(next) => toggle.onChange(next === true)}
          />
        ) : null}
        <FieldLabel
          htmlFor={toggle ? id : undefined}
          // The label sets its own size, so the heading size is set on what is inside it.
          // The name never wraps; a long answer beside it is cut short instead.
          className="shrink-0 [&_label]:text-[15px] [&_label]:font-semibold [&_label]:whitespace-nowrap"
          hint={hint}
        >
          {title}
        </FieldLabel>
        {showSummary ? (
          <span className="ml-auto min-w-0 truncate text-sm text-muted-foreground tabular-nums">{summary}</span>
        ) : null}
        {canFold ? (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={open ? `Hide ${title}` : `Show ${title}`}
              className={cn(
                "shrink-0 cursor-pointer rounded-md text-muted-foreground hover:text-foreground",
                // With no answer beside it, the arrow still keeps to the right edge.
                !showSummary && "ml-auto",
                focusRingInset
              )}
            >
              <ChevronDownIcon className="size-4 transition-transform duration-200 group-data-[state=closed]/option:-rotate-90" />
            </button>
          </CollapsibleTrigger>
        ) : null}
      </div>
      {canFold ? (
        <CollapsibleContent>
          {description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          <div className="mt-4 grid gap-5">{children}</div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}
