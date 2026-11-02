import { ListFilterIcon } from "lucide-react"
import type * as React from "react"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * The Filter button of a three-column dashboard's middle header, and the
 * dropdown it opens (UI standard, "Three-column dashboards"). The screen fills
 * it with a row per filter (a label, then its Select) or a builder of its
 * own, and this frame adds Clear and the screen's save button ("Save as
 * view", or Contacts' "Save to segment"). A Group row joins it the day a
 * screen that groups moves onto it. The button counts the filters set, and in a
 * narrow header (`@max-3xl`) keeps its icon and drops its word.
 *
 * Project's `TaskFilterPopover` is the drawing this frame was taken from.
 */
export function FilterPopover({
  count,
  open,
  onOpenChange,
  onClear,
  save,
  contentClassName,
  children,
}: {
  /** How many filters are set, shown after the word. */
  count: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onClear: () => void
  /** The save button beside Clear. */
  save: React.ReactNode
  /** Wider than the usual 20rem, for a builder rather than rows. */
  contentClassName?: string
  children: React.ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          aria-label={count ? `Filter, ${count} set` : "Filter"}
        >
          <ListFilterIcon className="size-4" />
          <span className="@max-3xl:sr-only">Filter</span>
          {count ? <span className="text-muted-foreground">{count}</span> : null}
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("grid w-80 gap-3 p-3", contentClassName)}>
        {children}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onClear}>
            Clear
          </Button>
          {save}
        </div>
      </PopoverContent>
    </Popover>
  )
}
