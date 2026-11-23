import * as React from "react"

import { cn } from "@/lib/utils/tailwind"

// Directory-only card helpers (no custom-shell counterpart). They live here so
// ui/card.tsx stays byte-aligned with custom-shell's primitive.

const CardSection = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="card-section" className={cn("p-6", className)} {...props} />
)
CardSection.displayName = "CardSection"

const CardTableHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-table-header"
      className={cn("grid gap-4 border-b bg-muted/30 px-6 py-4 text-sm font-medium text-muted-foreground", className)}
      {...props}
    />
  )
)
CardTableHeader.displayName = "CardTableHeader"

export { CardSection, CardTableHeader }
