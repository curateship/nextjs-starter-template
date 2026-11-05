import { and, eq, inArray, isNotNull } from "drizzle-orm"

import { adsOf, changeAd, fitAdToLength } from "@/lib/video/ads"
import {
  requireCanonicalTimeline,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { TRANSLATE_VOICE_MODEL, type TranslateLanguage } from "@/lib/video/translate"
import type { VoiceSettings } from "@/lib/video/voice"
import { uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedVideo } from "@/server/video/project-videos"
import type { SpendTag } from "@/server/video/project-spend"
import { videoAds } from "@/server/video/schema"
import { translateLines } from "@/server/video/translate"
import { speak } from "@/server/video/voice"

type Track = ProjectTimeline["tracks"][number]
type Clip = Track["clips"][number]

/** What changes on one ad in a language copy. */
export type AdInLanguage = Partial<Clip>

/**
 * A video's ads in another language, for its language copy
 * (`workspace/docs/ads.md`; Tyler, 4 Nov 2026: "Translate everything"):
 * every text ad's words translated, and every sponsor read the AI made said
 * again in that language by the same voice. Worked out before the copy's own
 * voice is paid for, so a failure here stops the copy with nothing spent on
 * it, and handed back as changes by ad, so the copy can be made from the
 * video as it is saved a moment later.
 */
export async function adsInLanguage(
  {
    userId,
    videoId,
    language,
    settings,
    spend,
  }: {
    userId: string
    videoId: string
    language: TranslateLanguage
    settings?: VoiceSettings
    spend?: SpendTag | null
  },
  database: CustomShellDb = db,
  tools: { translate: typeof translateLines; say: typeof speak } = {
    translate: translateLines,
    say: speak,
  }
): Promise<Map<string, AdInLanguage>> {
  const video = await getOwnedVideo(userId, videoId, database)
  const ads = adsOf(requireCanonicalTimeline(video.timeline).tracks)
  const changes = new Map<string, AdInLanguage>()
  if (!ads.length) return changes

  const texts = ads.filter(({ clip }) => clip.kind === "text" && clip.text?.trim())
  if (texts.length) {
    const lines = await tools.translate({
      userId,
      language,
      lines: texts.map(({ clip }) => clip.text ?? ""),
      spend,
    })
    texts.forEach(({ clip }, index) => {
      const text = lines[index]?.trim()
      if (text) changes.set(clip.id, { text, name: text })
    })
  }

  const shelfIds = [
    ...new Set(
      ads
        .filter(({ clip }) => clip.kind !== "text" && clip.ad.shelfId)
        .map(({ clip }) => clip.ad.shelfId as string)
    ),
  ]
  if (!shelfIds.length) return changes
  const reads = await database
    .select()
    .from(videoAds)
    .where(
      and(
        inArray(videoAds.id, shelfIds),
        eq(videoAds.userId, userId),
        isNotNull(videoAds.readScript),
        isNotNull(videoAds.readVoiceId)
      )
    )
  if (!reads.length) return changes
  const scripts = await tools.translate({
    userId,
    language,
    lines: reads.map((read) => read.readScript ?? ""),
    spend,
  })
  for (const [index, read] of reads.entries()) {
    const said = await tools.say({
      userId,
      voiceId: read.readVoiceId ?? "",
      voiceName: read.readVoiceName ?? "",
      speaker: "elevenlabs",
      modelId: TRANSLATE_VOICE_MODEL,
      text: scripts[index] ?? "",
      settings,
      feature: "translation_voice",
      spend,
    })
    for (const { clip } of ads) {
      if (clip.ad.shelfId !== read.id || clip.kind === "text") continue
      const swapped: Clip = {
        ...clip,
        kind: "audio",
        mediaId: said.mediaId,
        url: said.url,
        name: `${read.name} (${language})`,
        sourceDurationMs: said.durationMs,
        trimStartMs: 0,
        speed: undefined,
        durationMs: said.durationMs,
      }
      // A read that came out longer than its spot is fitted to it.
      const fitted =
        said.durationMs > clip.durationMs ? fitAdToLength(swapped, clip.durationMs) : {}
      const { id: _id, startMs: _start, ...change } = { ...swapped, ...fitted }
      changes.set(clip.id, change)
    }
  }
  return changes
}

/** The changes laid onto the copy's lanes; a pause ad's gap follows its new length. */
export function withAdsInLanguage(
  tracks: Track[],
  changes: Map<string, AdInLanguage>
): Track[] {
  let current = tracks
  for (const [clipId, change] of changes) {
    const next = changeAd(current, clipId, () => change, uuid)
    if (Array.isArray(next)) current = next
  }
  return current
}
