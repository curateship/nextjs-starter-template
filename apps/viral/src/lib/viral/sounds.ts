import { OUTLIER_BADGE_MIN, soundKey, type ViralSound, type ViralVideo } from "@/lib/viral/viral"

/**
 * Trending sounds, the Sounds tab (Tyler, 4 Nov 2026: "A Sounds tab";
 * `workspace/docs/finding-content.md`). Each sound under a project's videos,
 * with how many winners use it. Pure, so the browser works it out from the
 * videos it already has.
 */

/** A score this high counts as a winner even when the channel's usual is unknown. */
export const WINNER_SCORE = 70

/** The Outlier badge (twice the channel's usual or more), or a score of 70 or more. */
export function isWinner(video: Pick<ViralVideo, "outlier" | "score">): boolean {
  return (video.outlier.times !== null && video.outlier.times >= OUTLIER_BADGE_MIN) || video.score.score >= WINNER_SCORE
}

export type TrendingSound = { key: string; sound: ViralSound; videos: number; winners: number }

/** Most winners first, then most videos, then by name. */
export function trendingSounds(videos: ViralVideo[]): TrendingSound[] {
  const byKey = new Map<string, TrendingSound>()
  for (const video of videos) {
    if (!video.sound) continue
    const key = soundKey(video.sound)
    const entry = byKey.get(key) ?? { key, sound: video.sound, videos: 0, winners: 0 }
    entry.videos += 1
    if (isWinner(video)) entry.winners += 1
    byKey.set(key, entry)
  }
  return [...byKey.values()].sort(
    (left, right) =>
      right.winners - left.winners || right.videos - left.videos || left.sound.name.localeCompare(right.sound.name)
  )
}
