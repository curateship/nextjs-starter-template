import * as React from "react"
import { EllipsisVerticalIcon } from "lucide-react"

import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { keepOpenForInnerBoxes } from "@/components/trade/notes/pick-rows"
import { cn } from "@/lib/utils"

/*
 * Copied from Project (`apps/project/src/components/project/my-settings-menu.tsx`)
 * for the Admin 3 panel design: Travel's trip ⋮ and activity ⋮ are this
 * menu (Tyler, 6 Nov 2026).
 */
export type MySettingsTab = { value: string; label: string; content: React.ReactNode }

/**
 * The ⋮ with tabbed settings that My settings is, shared by the task panel's
 * ⋮ (Tyler, 6 Nov 2026: "It needs to copy the Ui of the left panel tabs").
 * `open` and `onOpenChange` let the page close it from outside, and
 * `onCloseAutoFocus` send the keyboard somewhere other than the ⋮.
 */
export function TabbedMenu({
  label,
  tabs,
  align = "start",
  width = "22.7rem",
  open: openFromOutside,
  onOpenChange,
  onCloseAutoFocus,
}: {
  label: string
  tabs: MySettingsTab[]
  align?: "start" | "end"
  /** Its widest, as a CSS length; a phone gets the screen less 2rem. */
  width?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const [ownOpen, setOwnOpen] = React.useState(false)
  const open = openFromOutside ?? ownOpen
  const [tab, setTab] = React.useState(tabs[0]?.value ?? "")
  function change(next: boolean) {
    if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (next) setTab(tabs[0]?.value ?? "")
    if (openFromOutside === undefined) setOwnOpen(next)
    onOpenChange?.(next)
  }
  const shown = tabs.find((item) => item.value === tab) ?? tabs[0]
  return (
    <Popover open={open} onOpenChange={change}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={label} className={cn(open && "bg-muted")}>
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align={align}
        collisionPadding={16}
        aria-label={label}
        onCloseAutoFocus={onCloseAutoFocus}
        onInteractOutside={keepOpenForInnerBoxes}
        // A box inside that uses Escape itself, such as a new habit's name, keeps it.
        onEscapeKeyDown={(event) => {
          // The key's own target: the box may already be gone by the time this runs.
          if (event.target instanceof Element && event.target.closest("[data-own-escape]")) event.preventDefault()
        }}
        // 28rem, then 10% narrower twice (Tyler, 6 Nov 2026: "reduce the dropdown by 10%
        // width", then "Reduce width by 10% more").
        style={{ width: `min(${width}, calc(100vw - 2rem))` }}
        className="gap-0 p-0"
      >
        {/* Underlined, from the left, 32px apart (Tyler, 6 Nov 2026: "the tabs align to
            left and add more spacings, its too condensed", then "a bit more space for the
            tabs"). The line under the tab showing sits on the row's own divider. */}
        <div className="flex h-12 items-stretch border-b px-4">
          <DashboardTabs
            style="underline"
            className="my-0 [&_[role=tablist]]:gap-8"
            value={shown?.value ?? ""}
            onValueChange={setTab}
            tabs={tabs.map(({ value, label }) => ({ value, label }))}
          />
        </div>
        <ScrollArea className="min-h-0" viewportClassName="max-h-[min(75vh,44rem)]">
          {/* Plain rows, no lines between them (Tyler, 6 Nov 2026: "Remove email and dividers"). */}
          <div className="grid grid-cols-[minmax(0,1fr)] py-1">{shown?.content}</div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
