import { BadgeCheckIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

/**
 * The mark on a listing the business itself looks after.
 *
 * **It says nothing about who.** A visitor is told the page is kept up to date
 * by the business, never the owner's name or address — that is somebody's
 * personal detail and it is not what the mark is for.
 *
 * The icon never carries the meaning on its own: there is a word beside it, and
 * a sentence behind it for anybody who wants to know what it means. An
 * unclaimed listing draws nothing at all — no grey outline, no empty space —
 * because "not claimed" is not a state worth taking up room.
 */
export function ClaimedBadge({ size = "default" }: { size?: "default" | "small" }) {
  return (
    <Badge
      variant="secondary"
      className={size === "small" ? "gap-1 px-1.5 text-[11px]" : "gap-1"}
      title="The business itself keeps this page up to date."
    >
      <BadgeCheckIcon className="size-3.5" aria-hidden="true" />
      Claimed
    </Badge>
  )
}
