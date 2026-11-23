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

/**
 * A titled block inside a settings card that folds away, with a line above it.
 *
 * The shell's `SettingsCardSection` is the same block without the folding, and
 * this app may not add it there. A page's card holds four or five of these —
 * the Directory page's are its order, its category cards, its map and its place
 * search — and Tyler asked on 27 Sep 2026 for every one of them to fold, the
 * same as the cards around them.
 *
 * Open or closed is remembered per section in this browser, through the same
 * store and the same key shape the cards use, so the no-flash script in `<head>`
 * hides a closed one before the first paint.
 *
 * The line runs edge to edge. A divider inside a padded card stops short of the
 * card's sides and reads as a broken line, so it is pulled out to the card's
 * 16px inset and the content put back inside it.
 */
export function CollapsibleSettingsSection({
  storageId,
  title,
  description,
  children,
  className,
  contentClassName,
}: {
  /** Remembers this section's own open or closed, per browser. */
  storageId: string
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    collapseStorageKey.settingsCard(storageId)
  )
  const descriptionId = React.useId()

  return (
    <div className={cn("group/section -mx-4 border-t px-4 pt-4", className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-describedby={description ? descriptionId : undefined}
            className={cn(
              "group/trigger flex w-full cursor-pointer items-start justify-between gap-3 rounded-md text-left select-none",
              focusRingInset
            )}
          >
            <span className="grid gap-1">
              <span className="font-heading text-base leading-snug font-medium">
                {title}
              </span>
              {description ? (
                <span
                  id={descriptionId}
                  className="text-sm font-normal text-muted-foreground"
                >
                  {description}
                </span>
              ) : null}
            </span>
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover/section:opacity-100 group-focus-visible/trigger:opacity-100 group-data-[state=closed]/trigger:-rotate-90" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent data-collapse-key={noFlashKey}>
          <div className={cn("mt-4", contentClassName)}>{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
