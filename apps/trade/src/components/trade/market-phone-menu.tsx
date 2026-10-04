import * as React from "react"
import { EllipsisVerticalIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

/**
 * One line in the phone's market menu: a picture, a word, and sometimes a
 * count.
 *
 * It is a button, and it is what the controls that already live in the market
 * header are given as their trigger. The control itself is unchanged — the
 * same folders menu, the same alerts menu, the same wallet menu — so pressing
 * a line here opens exactly the panel the icon button opens on a desktop.
 */
export const PhoneMenuRow = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    icon: React.ReactNode
    label: string
    /** A red count beside the word, drawn only above zero. */
    count?: number
    /** A quiet word at the end of the line: how many indicators are on. */
    detail?: string
  }
>(({ icon, label, count, detail, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    {...props}
    className={cn(
      "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
      className
    )}
  >
    <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-5">
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {count ? (
      <Badge
        variant="destructive"
        className="min-w-5 px-1 text-xs leading-none font-semibold tabular-nums"
      >
        {count > 99 ? "99+" : count}
      </Badge>
    ) : null}
    {detail ? (
      <span className="shrink-0 text-sm text-muted-foreground">{detail}</span>
    ) : null}
  </button>
))
PhoneMenuRow.displayName = "PhoneMenuRow"

/**
 * Everything the market header holds that a phone has no room for, behind the
 * three dots at the end of the row.
 *
 * It slides up from the bottom of the screen rather than hanging off the
 * button, because a list of ten lines anchored to a button 40px from the top
 * right of a phone has nowhere to go.
 *
 * **The sheet is deliberately not modal.** Every line in it opens a panel of
 * its own, and those panels are drawn at the end of the page rather than
 * inside the sheet. A modal window switches the rest of the page off for the
 * pointer, which would have left each of those panels on screen and dead to
 * the touch.
 */
export function MarketPhoneMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="More market controls"
        className="bg-muted/60 dark:bg-muted/60"
        onClick={() => setOpen(true)}
      >
        <EllipsisVerticalIcon className="size-4" />
      </Button>
      <Sheet modal={false} open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[80svh] gap-0 overflow-y-auto rounded-t-2xl p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] duration-150 ease-out motion-reduce:animate-none motion-reduce:transition-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Market controls</SheetTitle>
          </SheetHeader>
          {/* The grab bar. It is the handle a phone screen uses to say the
              panel came up from the bottom and goes back down there. */}
          <div
            aria-hidden
            className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
          />
          <div className="grid gap-0.5">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}
