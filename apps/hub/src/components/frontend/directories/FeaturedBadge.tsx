import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/tailwind"

// The one visual identity for paid Featured placement across listing cards,
// related listings, the detail page, and the owner account block.
export function FeaturedBadge({ className, children = "Featured" }: { className?: string; children?: ReactNode }) {
  return (
    <Badge className={cn("w-fit bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40", className)}>
      {children}
    </Badge>
  )
}
