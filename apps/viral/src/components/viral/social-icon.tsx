import { AtSignIcon, BriefcaseBusinessIcon, CameraIcon, MessagesSquareIcon, MusicIcon, SquarePlayIcon } from "lucide-react"

import type { CreatorPlatform } from "@/lib/viral/creators"
import type { Social } from "@/lib/viral/socials"

/**
 * A social's mark, the same size as the text beside it, as Promo's network
 * icon is (lucide has no brand marks): on its row in the left panel's Socials card and before a video's
 * title in the right panel. Instagram shows only for a pasted reel.
 */
export function SocialIcon({
  social,
  className = "size-4 shrink-0 text-muted-foreground",
}: {
  social: CreatorPlatform | Social
  className?: string
}) {
  if (social === "youtube") return <SquarePlayIcon className={className} aria-hidden="true" />
  if (social === "tiktok") return <MusicIcon className={className} aria-hidden="true" />
  if (social === "x") return <AtSignIcon className={className} aria-hidden="true" />
  if (social === "reddit") return <MessagesSquareIcon className={className} aria-hidden="true" />
  if (social === "linkedin") return <BriefcaseBusinessIcon className={className} aria-hidden="true" />
  return <CameraIcon className={className} aria-hidden="true" />
}
