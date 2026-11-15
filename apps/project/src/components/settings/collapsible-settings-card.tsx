"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import {
  Card,
  CardContent,
  CardTitle,
} from "@/components/ui/card"
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

type CollapsibleSettingsCardProps = {
  storageId: string
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  /** Passed straight to `Card`, so a collapsible card can be compact too. */
  size?: "default" | "sm"
  /**
   * A button at the header's right, beside the title rather than inside the
   * press that folds the card, such as a navigation editor's Reset (Tyler,
   * 9 Nov 2026, the Navigations redesign).
   */
  action?: React.ReactNode
  /**
   * Open/closed held by the caller instead of the card, for a page with a button
   * outside the card that has to reveal what it just made — the sidebar tab's
   * "Add section". Build it with `useRememberedCollapse` on the same storage key
   * so the choice is still remembered. Left off, the card holds its own.
   */
  collapse?: {
    open: boolean
    onOpenChange: (open: boolean) => void
    noFlashKey: string | undefined
  }
}

/**
 * Set to one card's `storageId` to draw that card alone, with no card round
 * it and no fold, and every other card under it not at all.
 *
 * The Admin dashboard's Styling section uses it (Tyler, 9 Nov 2026: "We'll
 * pull the styling from settings here ... The right panel is where we'll
 * adjust all the settings"): the middle lists the groups, and the right panel
 * draws the whole Styling screen with this set to the group picked, so each
 * group's sliders, previews and the values they share stay in one component.
 * A card inside the one drawn draws as a card again.
 */
export const SettingsCardOnly = React.createContext<string | null>(null)

/**
 * A settings card whose body collapses. Hovering the card reveals an arrow in
 * the header; clicking the header toggles the body, and the open/closed choice
 * is remembered per card in this browser. Mirrors the sidebar-section pattern in
 * `sidebar-group-collapsible.tsx`.
 */
export function CollapsibleSettingsCard({
  storageId,
  title,
  description,
  children,
  className,
  contentClassName,
  size,
  collapse,
  action,
}: CollapsibleSettingsCardProps) {
  const own = useRememberedCollapse(collapseStorageKey.settingsCard(storageId))
  const descriptionId = React.useId()
  const [open, setOpen, noFlashKey] = collapse
    ? [collapse.open, collapse.onOpenChange, collapse.noFlashKey]
    : own
  const only = React.useContext(SettingsCardOnly)

  if (only !== null) {
    if (only !== storageId) return null
    return (
      <SettingsCardOnly.Provider value={null}>
        <div className="grid gap-4">
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
          <div className={contentClassName}>{children}</div>
        </div>
      </SettingsCardOnly.Provider>
    )
  }

  return (
    <Card size={size} className={className}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardTitle className={cn(action && "flex items-start gap-2 pr-4 group-data-[size=sm]/card:pr-3")}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={typeof title === "string" ? title : undefined}
              aria-describedby={description ? descriptionId : undefined}
              className={cn(
                "group/trigger flex w-full cursor-pointer select-none items-start justify-between gap-3 rounded-md px-4 text-left group-data-[size=sm]/card:px-3",
                // The header runs the full width of the card, and a card hides
                // what overflows it, so the ring has to be drawn inside.
                focusRingInset
              )}
            >
              <span className="grid gap-1">
                <span>{title}</span>
                {description ? (
                  <span
                    id={descriptionId}
                    className="text-sm font-normal text-muted-foreground"
                  >
                    {description}
                  </span>
                ) : null}
              </span>
              <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover/card:opacity-100 group-focus-visible/trigger:opacity-100 group-data-[state=closed]/trigger:-rotate-90" />
            </button>
          </CollapsibleTrigger>
          {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
        </CardTitle>
        <CollapsibleContent data-collapse-key={noFlashKey}>
          <CardContent className={cn("pt-4", contentClassName)}>
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
