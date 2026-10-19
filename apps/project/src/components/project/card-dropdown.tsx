import * as React from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * An icon in a card that opens a dropdown rather than a window (Tyler, 15 Oct
 * 2026), as the task's cog does: the details panel's Status cog, the
 * Milestones "+" and each milestone's cog. The form inside is drawn only while
 * open, so each opening starts from what is saved now. No tooltip: Tyler took
 * them off these cards on 19 Oct 2026.
 */
export function CardDropdown({
  label,
  icon,
  open,
  onOpenChange,
  className,
  children,
}: {
  /** The button's name, read out by a screen reader. */
  label: string
  icon: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn(
            "text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:text-foreground dark:hover:bg-transparent",
            className
          )}
        >
          {icon}
        </Button>
      </PopoverTrigger>
      {/* Clear of the row it opens from, so its name and line stay readable (Tyler, 15 Oct 2026). */}
      <PopoverContent align="end" sideOffset={10} className="w-[min(20rem,calc(100vw-2rem))] gap-4 p-4">
        {children}
      </PopoverContent>
    </Popover>
  )
}

/** The dropdown's heading: 15px, as the cards' own. */
export function CardDropdownTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-semibold">{children}</h3>
}
