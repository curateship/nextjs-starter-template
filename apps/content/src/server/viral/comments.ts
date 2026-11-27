import { and, eq } from "drizzle-orm"

import { viralSays, YOUTUBE_QUOTA_MESSAGE } from "@/lib/viral/viral"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { viralVideoComments, type ViralCommentRow } from "@/server/viral/schema"
import { getYoutubeApiKey } from "@/server/viral/settings"
import { listYoutubeTopComments } from "@/server/viral/youtube"
import { recordYoutubeUnits, youtubeUnitsLeftToday } from "@/server/viral/youtube-units"

/**
 * The Top comments card on the right panel (`workspace/docs/finding-content.md`).
 * Tyler, 4 Nov 2026: "20 comments only", with no AI reading them.
 *
 * - **YouTube.** One `commentThreads` read, 1 unit, the first time the video
 *   opens. The answer is kept for a day, so opening it again costs nothing.
 * - **TikTok and Instagram.** Neither shares comments without signing in.
 *   yt-dlp read 0 of a TikTok video's 5,484 comments signed out on 4 Nov
 *   2026, so the card says so instead of asking.
 * - **The sample project.** Its videos are made up, so it gets made-up
 *   comments and nothing is asked.
 */

const KEEP_MS = 24 * 60 * 60 * 1000

export type ViralComments =
  | { state: "ready"; comments: ViralCommentRow[]; readAt: string }
  | { state: "disabled" }
  | { state: "unavailable"; reason: string }

export async function loadVideoComments(
  video: { platform: string; platformVideoId: string; sample: boolean },
  at: Date = now()
): Promise<ViralComments> {
  if (video.sample) return { state: "ready", comments: sampleComments(), readAt: at.toISOString() }
  if (video.platform !== "youtube") {
    return {
      state: "unavailable",
      reason: `${video.platform === "tiktok" ? "TikTok" : "Instagram"} doesn't share its comments without signing in, so they can't be read here. Open the video on ${video.platform === "tiktok" ? "TikTok" : "Instagram"} to read them.`,
    }
  }

  const [kept] = await db
    .select()
    .from(viralVideoComments)
    .where(and(eq(viralVideoComments.platform, video.platform), eq(viralVideoComments.platformVideoId, video.platformVideoId)))
  if (kept && at.getTime() - kept.readAt.getTime() < KEEP_MS) {
    return kept.disabled ? { state: "disabled" } : { state: "ready", comments: kept.comments, readAt: kept.readAt.toISOString() }
  }

  const apiKey = await getYoutubeApiKey()
  if (!apiKey) throw viralSays("Reading comments needs the YouTube key. Paste one in Settings → YouTube first.")
  if ((await youtubeUnitsLeftToday(at)) < 1) throw viralSays(YOUTUBE_QUOTA_MESSAGE)

  const answer = await listYoutubeTopComments(video.platformVideoId, apiKey)
  await recordYoutubeUnits(1, "viral_comments")
  await db
    .insert(viralVideoComments)
    .values({ platform: video.platform, platformVideoId: video.platformVideoId, comments: answer.comments, disabled: answer.disabled, readAt: at })
    .onConflictDoUpdate({
      target: [viralVideoComments.platform, viralVideoComments.platformVideoId],
      set: { comments: answer.comments, disabled: answer.disabled, readAt: at },
    })
  return answer.disabled ? { state: "disabled" } : { state: "ready", comments: answer.comments, readAt: at.toISOString() }
}

function sampleComments(): ViralCommentRow[] {
  return [
    { author: "Sam at a desk", text: "Did this between two meetings and my back already feels better.", likes: 4_120, postedAt: null },
    { author: "Priya K", text: "Can you do one for wrists? Typing all day is killing mine.", likes: 2_310, postedAt: null },
    { author: "Office Dad", text: "Sent this to my whole team.", likes: 1_045, postedAt: null },
    { author: "Lee", text: "How many times a day should I do it?", likes: 388, postedAt: null },
  ]
}
