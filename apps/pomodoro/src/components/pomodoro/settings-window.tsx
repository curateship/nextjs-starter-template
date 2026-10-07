import * as React from "react"
import { SettingsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * The settings button on a task or project row and the window it opens,
 * anchored under the button so the list stays put while you edit. Tyler
 * asked for this on 7 Oct 2026 in place of the row turning into fields.
 *
 * Closing it, by Cancel, Escape or a click outside, drops whatever was typed;
 * the form inside closes it on Save only once the change has landed.
 */
export function SettingsWindow({
  label,
  open,
  onOpenChange,
  children,
}: {
  /** "Edit Billing run": the button's name and the window's. */
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <SettingsIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        // Never closer than 16px to the edge of the screen, the same edge the
        // page keeps on a phone.
        collisionPadding={16}
        aria-label={label}
        className="w-80 max-w-[calc(100vw-2rem)] gap-4 p-4"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
