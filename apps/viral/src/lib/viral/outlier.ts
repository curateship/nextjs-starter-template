import { OUTLIER_BADGE_MIN, typical, type ViralOutlier } from "@/lib/viral/viral"

/**
 * The Outlier figure: a video's views against its channel's typical video
 * (`workspace/docs/sorts-and-score.md`). A channel that usually gets 10,000
 * views and has a video at 400,000 shows "40x usual". The typical video is
 * the middle value of the channel's recent uploads, leaving out the video
 * being compared, because one huge hit would drag an average up with it.
 */

/** Fewer other videos than this, and the channel's usual can't be said. */
export const OUTLIER_SAMPLE_MIN = 5

/** How long a channel's figure is reused before YouTube is asked again. */
export const CHANNEL_USUAL_KEEP_MS = 7 * 24 * 60 * 60 * 1000

/** How many of a YouTube channel's newest uploads the figure reads: one page, 2 units. */
export const CHANNEL_USUAL_UPLOADS = 30

export function outlierFor(
  video: { platformVideoId: string; views: number | null },
  recentViews: Record<string, number> | undefined
): ViralOutlier {
  if (!recentViews) return { times: null, typicalViews: null }
  const others = Object.entries(recentViews)
    .filter(([id]) => id !== video.platformVideoId)
    .map(([, views]) => views)
  if (others.length < OUTLIER_SAMPLE_MIN) return { times: null, typicalViews: null }
  const typicalViews = typical(others)
  if (typicalViews === null) return { times: null, typicalViews: null }
  if (video.views === null || typicalViews <= 0) return { times: null, typicalViews }
  return { times: video.views / typicalViews, typicalViews }
}

/**
 * A channel's usual views and how often it doubles them, for the creator page:
 * each recent video is held against the others, the same way the Outlier
 * figure is, and counts when it reached the badge's bar.
 */
export function channelUsual(recentViews: Record<string, number> | undefined): {
  typicalViews: number | null
  beatsUsual: { hits: number; of: number } | null
} {
  const views = Object.values(recentViews ?? {})
  if (views.length <= OUTLIER_SAMPLE_MIN) return { typicalViews: typical(views), beatsUsual: null }
  let hits = 0
  for (const [id, count] of Object.entries(recentViews ?? {})) {
    const times = outlierFor({ platformVideoId: id, views: count }, recentViews).times
    if (times !== null && times >= OUTLIER_BADGE_MIN) hits += 1
  }
  return { typicalViews: typical(views), beatsUsual: { hits, of: views.length } }
}
