import type { LucideIcon } from "lucide-react"
import Facebook from "lucide-react/dist/esm/icons/facebook.js"
import Github from "lucide-react/dist/esm/icons/github.js"
import Globe from "lucide-react/dist/esm/icons/globe.js"
import Instagram from "lucide-react/dist/esm/icons/instagram.js"
import Linkedin from "lucide-react/dist/esm/icons/linkedin.js"
import Music2 from "lucide-react/dist/esm/icons/music-2.js"
import Twitter from "lucide-react/dist/esm/icons/twitter.js"
import Youtube from "lucide-react/dist/esm/icons/youtube.js"

const SOCIAL_ICON_MAP: Record<string, { label: string; Icon: LucideIcon }> = {
  facebook: { label: "Facebook", Icon: Facebook },
  instagram: { label: "Instagram", Icon: Instagram },
  twitter: { label: "Twitter", Icon: Twitter },
  linkedin: { label: "LinkedIn", Icon: Linkedin },
  youtube: { label: "YouTube", Icon: Youtube },
  tiktok: { label: "TikTok", Icon: Music2 },
  github: { label: "GitHub", Icon: Github },
}

// Maps a free-text platform name to its icon + label; unknown platforms get a
// capitalized label with a generic globe icon.
export function getSocialMeta(platform?: string) {
  const normalizedPlatform = platform?.toLowerCase() || ""
  return (
    SOCIAL_ICON_MAP[normalizedPlatform] || {
      label: platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Social Link",
      Icon: Globe,
    }
  )
}
