import { SparklesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

/** Paid placement, named with an icon so color is never the only signal. */
export function FeaturedBadge() {
  return (
    <Badge variant="secondary">
      <SparklesIcon aria-hidden="true" />
      Featured
    </Badge>
  )
}
