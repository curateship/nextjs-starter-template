import * as React from "react"
import { EllipsisVerticalIcon } from "lucide-react"

import { keepOpenForInnerBoxes } from "@/components/trade/notes/pick-rows"
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
 * detail such as the wallet in use. It is the trigger the wallet menu and
 * Close all are handed, so each still opens its own box, unchanged.
 */
export const MenuRow = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    icon: React.ReactNode
    label: string
    detail?: string
  }
>(({ icon, label, detail, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    {...props}
    className={cn(
      "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-muted",
      className
    )}
  >
    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
      {icon}
    </span>
    <span className="shrink-0">{label}</span>
    {detail ? (
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
