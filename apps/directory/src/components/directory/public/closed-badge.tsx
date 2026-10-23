import { DoorClosedIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

/**
 * Said under a closed listing's name, with an icon so the colour is never the
 * only signal. The words are the whole point of the page staying up.
 */
export function ClosedBadge() {
  return (
    <Badge variant="destructive">
      <DoorClosedIcon aria-hidden="true" />
      Permanently closed
    </Badge>
  )
}
