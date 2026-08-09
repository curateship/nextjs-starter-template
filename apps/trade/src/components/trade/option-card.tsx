import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { useCardFold } from "@/components/trade/card-folds-store"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { FieldLabel } from "@/components/ui/field-label"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * One group of settings on a trading window: a titled card that folds away.
 *
 * Every option in the DCA window sits in one of these, so a long window reads
 * as a handful of decisions rather than a wall of boxes, and the ones already
 * settled can be folded out of the way.
 *
 * `toggle` is for a group that can be switched off wholesale — take profit,
 * the stop. The box and the fold are deliberately separate controls: the box
 * turns the rule on, the chevron shows its settings, and neither does the
 * other's job. One control doing both is how somebody ends up switching on a
 * rule they only wanted to read.
 */
export function OptionCard({
  id,
  title,
  hint,
  toggle,
  defaultOpen = true,
  footer,
  children,
}: {
  /** Used for the checkbox and to tie the title to it. */
  id: string
  title: string
  hint?: React.ReactNode
  toggle?: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }
  defaultOpen?: boolean
  /**
   * Drawn under the fold rather than inside it — for a note that explains
   * something printed elsewhere on the window. A warning nobody can see
   * because the card is shut warns nobody.
   */
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  // Remembered against the account when a `CardFolds` sits above this, and
  // just for as long as the window is open when one does not.
  const [open, setOpen] = useCardFold(id, defaultOpen)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="grid gap-4 rounded-lg border border-foreground/5 bg-muted/30 p-3"
    >
      <div className="flex items-center gap-2">
        {toggle ? (
          <Checkbox
            id={id}
            checked={toggle.checked}
            disabled={toggle.disabled}
            onCheckedChange={(next) => {
              const wanted = next === true
              toggle.onChange(wanted)
              // Switching a rule on shows what it is set to, rather than
              // leaving its settings behind a fold nobody thought to open.
              if (wanted) setOpen(true)
            }}
          />
        ) : null}
        <FieldLabel htmlFor={toggle ? id : undefined} className="min-w-0 flex-1" hint={hint}>
          {title}
        </FieldLabel>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={open ? `Hide ${title}` : `Show ${title}`}
            className={cn(
              "group/card shrink-0 cursor-pointer rounded-md text-muted-foreground select-none hover:text-foreground",
              focusRingInset
            )}
          >
            <ChevronDownIcon className="size-4 transition-transform duration-200 group-data-[state=closed]/card:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="grid gap-4">{children}</CollapsibleContent>
      {footer}
    </Collapsible>
  )
}
