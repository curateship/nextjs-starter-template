import * as React from "react"
import { EllipsisVerticalIcon } from "lucide-react"

import { keepOpenForInnerBoxes } from "@/components/trade/notes/pick-rows"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * One line in the middle panel's ⋮: a picture, a word, and sometimes a quiet
 * detail such as the wallet in use, or chips such as the market's folders. It
 * is the trigger the wallet menu and Close all are handed, so each still opens
 * its own box, unchanged. Rows are 32px, one step tighter than the 36px they
 * were (Tyler, 10 Nov 2026: "Reduce the spacing a bit and give the folders
 * label a chip design").
 */
export const MenuRow = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    icon: React.ReactNode
    label: string
    detail?: string
    /**
     * Names drawn as chips at the row's end, in place of `detail`. The first
     * shows, and a count such as "+1" stands for the rest, since the menu has
     * room for one.
     */
    chips?: readonly string[]
  }
>(({ icon, label, detail, chips, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    {...props}
    className={cn(
      "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-muted",
      className
    )}
  >
    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
      {icon}
    </span>
    <span className="shrink-0">{label}</span>
    {chips?.length ? (
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
        <Badge variant="secondary" className="min-w-0 shrink justify-start">
          <span className="truncate">{chips[0]}</span>
        </Badge>
        {chips.length > 1 ? (
          <Badge variant="secondary">+{chips.length - 1}</Badge>
        ) : null}
      </span>
    ) : detail ? (
      <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">
        {detail}
      </span>
    ) : null}
  </button>
))
MenuRow.displayName = "MenuRow"

/**
 * The ⋮ at the end of the dashboard's one middle header (Tyler, 7 Nov 2026:
 * "Move the close all into a 3 dotted dropdown in the middle header", then
 * "Move the wallet into the 3 dotted dropdown"), and since 8 Nov 2026 the
 * market's Folders and Pin to top, from the right panel that went. It is the
 * last thing in the header, as the Admin 3 panel design puts it. A box a row opens stays open
 * over it, so the menu does not close under the wallet list or Close all.
 */
export function MiddleMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="More for this dashboard"
// The panel header nudges a ⋮ into the gaps beside it, so it
              // sits 24px from the icons before it (`DashboardCardHeader`).
              data-more-button=""
              className={cn("shrink-0 rounded-lg", open && "bg-muted")}
            >
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Wallet, Folders, Pin to top and Close all</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        collisionPadding={16}
        onInteractOutside={keepOpenForInnerBoxes}
        className="grid w-60 gap-0.5 p-1"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
