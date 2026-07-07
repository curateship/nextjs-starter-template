import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/tailwind"

// The one visual identity for paid Featured placement across listing cards,
// related listings, the detail page, and the owner account block.
export function FeaturedBadge({ className, children = "Featured" }: { className?: string; children?: ReactNode }) {
  return (
    <Badge className={cn("w-fit bg-amber-100 text-amber-800 hover:bg-amber-100", className)}>
      {children}
    </Badge>
  )
}
