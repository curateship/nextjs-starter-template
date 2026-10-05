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
 * One card in a workspace screen's right-hand options panel.
 *
 * It is a grey box with a border, a heading and an arrow, rather than the white
 * `CollapsibleSettingsCard` the Settings screens use. The difference is the
 * background it sits on: a settings page is a column of white cards on a grey
 * canvas, while an options panel is a white panel beside a canvas, and a white
 * card on a white panel reads as one long list rather than as a set of groups.
 *
 * It started in the newsletter editor and moved here on 5 October 2026, when
 * the front page editor's panel became the second to use it. Tyler asked for
 * the two to match; before that the page editor's panel was white cards and the
 * newsletter's was these, side by side in the same app.
 *
 * The arrow is always drawn, never revealed on hover. A card that looks like a
 * heading until the pointer crosses it is a card nobody knows they can shut.
 */
export function InspectorCard({
  storageId,
  title,
  description,
  children,
}: {
  /**
   * Names this card in the remembered open/shut state. Plain characters only:
   * the script that keeps a shut card shut before the first paint skips any
   * key it does not recognise on sight.
   */
  storageId: string
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    collapseStorageKey.settingsCard(storageId)
  )

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "group/card rounded-lg border bg-muted/40 p-4",
        // Fields sit on the page background rather than the transparent the
        // shared Input defaults to. On a grey card, transparent means the card
        // shows through and a box you type into looks like a box you cannot.
        // Set here, once, so a field added to one of these panels later cannot
        // forget.
        "[&_[data-slot=input]]:bg-background [&_[data-slot=select-trigger]]:bg-background [&_[data-slot=textarea]]:bg-background"
      )}
    >
      <h2 className="text-[15px] font-semibold">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left select-none",
              focusRingInset
            )}
          >
            <span>{title}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/card:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent data-collapse-key={noFlashKey}>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        <div className="mt-4 grid gap-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
