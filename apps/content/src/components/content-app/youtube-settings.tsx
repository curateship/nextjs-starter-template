import { CardGroup } from "@/components/ui/card"
import VideoYoutubeSettings from "@/components/video-retention/youtube-settings"
import ViralYoutubeSettings from "@/components/viral/settings/youtube-settings"

/**
 * Settings → YouTube in Content: Research's YouTube key and today's units
 * (`workspace/docs/finding-content.md`), then the channel the retention curves
 * are read from (`workspace/docs/retention-curve.md`). Video and Viral each had
 * a YouTube tab of their own, and one app can hold only one tab of that name
 * (`workspace/docs/content-app.md`).
 */
export default function YoutubeSettings() {
  return (
    <CardGroup>
      <ViralYoutubeSettings />
      <VideoYoutubeSettings />
    </CardGroup>
  )
}
