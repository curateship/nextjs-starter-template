import { CardGroup } from "@/components/ui/card"
import { YoutubeChannelCard } from "@/components/video-retention/youtube-channel-card"

/**
 * Settings → YouTube: the channel the retention curves are read from
 * (`workspace/docs/retention-curve.md`).
 */
export default function YoutubeSettings() {
  return (
    <CardGroup>
      <YoutubeChannelCard />
    </CardGroup>
  )
}
