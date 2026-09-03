import * as React from "react"
import type { ReactNode } from "react"
import { BotIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** The right panel in a dropdown while its resizable column is collapsed. */
export function SmartOrdersMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const closeTimer = React.useRef<number | null>(null)
  const cancelClose = React.useCallback(() => {
    if (closeTimer.current === null) return
    window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }, [])
  const openFromHover = React.useCallback(() => {
    cancelClose()
    setOpen(true)
  }, [cancelClose])
  const closeFromHover = React.useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }, [cancelClose])

  React.useEffect(() => cancelClose, [cancelClose])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="bg-muted/60 dark:bg-muted/60"
          aria-label="Open smart orders and bots"
          onMouseEnter={openFromHover}
          onMouseLeave={closeFromHover}
        >
          <BotIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        sideOffset={8}
        className="w-[18.5rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
        style={{
          maxHeight: "var(--radix-popover-content-available-height)",
        }}
        onMouseEnter={openFromHover}
        onMouseLeave={closeFromHover}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
