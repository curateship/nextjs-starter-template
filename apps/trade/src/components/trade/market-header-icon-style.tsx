import * as React from "react"

import { Button } from "@/components/ui/button"
import { WARNING } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

export const marketHeaderIconButtonClassName =
  "bg-muted/60 text-amber-600 hover:text-amber-700 disabled:opacity-100"

export function marketHeaderIconClassName(saved: boolean) {
  return cn("size-4", saved && `fill-amber-500 ${WARNING}`)
}

export const MarketHeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<typeof Button>, "variant" | "size">
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    {...props}
    variant="outline"
    size="icon"
    className={cn(marketHeaderIconButtonClassName, className)}
  />
))
MarketHeaderIconButton.displayName = "MarketHeaderIconButton"
