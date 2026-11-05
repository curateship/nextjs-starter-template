import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm"
import { z } from "zod"

import {
  AD_ABOUT_MAX,
  AD_FILE_KIND_MESSAGE,
  AD_FILE_NOT_FOUND_MESSAGE,
  AD_LOOK_NOT_FOUND_MESSAGE,
  AD_NOT_FOUND_MESSAGE,
  AD_LOOKS_FULL_MESSAGE,
  AD_SHELF_FULL_MESSAGE,
  TEXT_AD_MAX,
  adReadWords,
  readAdRules,
  type AdReadSeconds,
  textAdLookSchema,
  type AdRules,
  type TextAdLook,
} from "@/lib/video/ads"
import { loudnormMeasureFilter, parseLoudnormMeasurement } from "@/lib/video/audio-loudness"
import type { RetentionPoint } from "@/lib/video/retention"
import type { VoiceSettings } from "@/lib/video/voice"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia, storagePathForUrl } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { runFfmpeg } from "@/server/video/ffmpeg"
import { getOwnedVideo } from "@/server/video/project-videos"
import {
  requireVideoBudget,
  videoSpendMetadata,
  type SpendTag,
} from "@/server/video/project-spend"
import { inputArgs } from "@/server/video/render-sources"
import {
  videoAdLooks,
  videoAds,
  videoExportYoutube,
  videoMediaLoudness,
  videoRenderJobs,
  videoSettings,
} from "@/server/video/schema"
import { openSoundSource } from "@/server/video/sound-source"
import { askWriter } from "@/server/video/writer"
import { speak } from "@/server/video/voice"

/**
 * The Ads panel's server side (`workspace/docs/ads.md`): each person's ads
 * shelf and saved text ad looks, the ad rules on Settings → App settings →
 * Ads, how loud a file is, the AI that writes a text ad or a sponsor read,
 * and the viewer curves that say where people keep watching.
 */


const SHELF_LIMIT = 200
const LOOK_LIMIT = 50

/** One ad on the shelf, as the panel draws it. */
export type ShelfAd = {
  id: string
  kind: "clip" | "text"
  name: string
  media: { id: string; url: string; file_type: "video" | "audio" } | null
  text: string | null
  look: TextAdLook | null
  /** Set on a read the AI made: what it says and who says it. */
  read: { script: string; voice_id: string; voice_name: string } | null
  created_at: string
}

export type AdLook = { id: string; name: string; look: TextAdLook }

// --------------------------------------------------------------- shelf ---

export async function listAds(
  userId: string,
  database: CustomShellDb = db
): Promise<ShelfAd[]> {
  const rows = await database
    .select({ ad: videoAds, media: customShellMedia })
    .from(videoAds)
    .leftJoin(customShellMedia, eq(customShellMedia.id, videoAds.mediaId))
    .where(eq(videoAds.userId, userId))
    .orderBy(desc(videoAds.createdAt), desc(videoAds.id))
    .limit(SHELF_LIMIT)
  return Promise.all(
    rows.map(async ({ ad, media }) => {
      const served = media ? await serializeMedia(media) : null
      return {
        id: ad.id,
        kind: ad.kind,
        name: ad.name,
        media:
          served && (served.file_type === "video" || served.file_type === "audio")
            ? { id: served.id, url: served.url, file_type: served.file_type }
            : null,
        text: ad.text,
        look: ad.look ? textAdLookSchema.safeParse(ad.look).data ?? null : null,
        read:
          ad.readScript && ad.readVoiceId
            ? {
                script: ad.readScript,
                voice_id: ad.readVoiceId,
                voice_name: ad.readVoiceName ?? "",
              }
            : null,
        created_at: ad.createdAt.toISOString(),
      }
    })
  )
}

async function requireRoom(userId: string, database: CustomShellDb) {
  const held = await database
    .select({ id: videoAds.id })
    .from(videoAds)
    .where(eq(videoAds.userId, userId))
    .limit(SHELF_LIMIT)
  if (held.length >= SHELF_LIMIT) throw new Error(AD_SHELF_FULL_MESSAGE)
}

async function requireOwnedFile(userId: string, mediaId: string, database: CustomShellDb) {
  const [media] = await database
    .select({ fileType: customShellMedia.fileType, name: customShellMedia.originalName })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, userId)))
    .limit(1)
  if (!media) throw new Error(AD_FILE_NOT_FOUND_MESSAGE)
  if (media.fileType !== "video" && media.fileType !== "audio") {
    throw new Error(AD_FILE_KIND_MESSAGE)
  }
  return media
}

/** A sponsor clip from the media library onto the shelf. */
export async function addClipAd(
  userId: string,
  mediaId: string,
  database: CustomShellDb = db
): Promise<string> {
  const media = await requireOwnedFile(userId, mediaId, database)
  await requireRoom(userId, database)
  const id = randomUUID()
  await database.insert(videoAds).values({
    id,
    userId,
    kind: "clip",
    name: media.name.slice(0, 255),
    mediaId,
    createdAt: now(),
  })
  return id
}

/** A sponsor clip picked from the media library by its address. */
export async function addClipAdFromUrl(
  userId: string,
  url: string,
  database: CustomShellDb = db
): Promise<string> {
  // The shell's findOwnedImageByUrl answers for pictures only, and an ad is a
  // video or a sound, so the file is looked up here by its bucket key.
  const storagePath = await storagePathForUrl(url)
  if (!storagePath) throw new Error(AD_FILE_NOT_FOUND_MESSAGE)
  const [found] = await database
    .select({ id: customShellMedia.id })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.userId, userId), eq(customShellMedia.storagePath, storagePath)))
    .limit(1)
  if (!found) throw new Error(AD_FILE_NOT_FOUND_MESSAGE)
  return addClipAd(userId, found.id, database)
}

/** A text ad, its words and look, onto the shelf. */
export async function addTextAd(
  userId: string,
  saved: { text: string; look: TextAdLook },
  database: CustomShellDb = db
): Promise<string> {
  const text = saved.text.trim().slice(0, TEXT_AD_MAX)
  await requireRoom(userId, database)
  const id = randomUUID()
  await database.insert(videoAds).values({
    id,
    userId,
    kind: "text",
    name: text.slice(0, 255),
    text,
    look: textAdLookSchema.parse(saved.look),
    createdAt: now(),
  })
  return id
}

/** Off the shelf. A clip's file stays in the media library, and ads already in videos stay. */
export async function removeShelfAd(
  userId: string,
  id: string,
  database: CustomShellDb = db
) {
  const removed = await database
    .delete(videoAds)
    .where(and(eq(videoAds.id, id), eq(videoAds.userId, userId)))
    .returning({ id: videoAds.id })
  if (!removed.length) throw new Error(AD_NOT_FOUND_MESSAGE)
}

// -------------------------------------------------------- text ad looks ---

export async function listAdLooks(
  userId: string,
  database: CustomShellDb = db
): Promise<AdLook[]> {
  const rows = await database
    .select()
    .from(videoAdLooks)
    .where(eq(videoAdLooks.userId, userId))
    .orderBy(desc(videoAdLooks.createdAt))
    .limit(LOOK_LIMIT)
  return rows.flatMap((row) => {
    const look = textAdLookSchema.safeParse(row.look)
    return look.success ? [{ id: row.id, name: row.name, look: look.data }] : []
  })
}

export async function saveAdLook(
  userId: string,
  saved: { name: string; look: TextAdLook },
  database: CustomShellDb = db
): Promise<AdLook> {
  const held = await database
    .select({ id: videoAdLooks.id })
    .from(videoAdLooks)
    .where(eq(videoAdLooks.userId, userId))
    .limit(LOOK_LIMIT)
  if (held.length >= LOOK_LIMIT) throw new Error(AD_LOOKS_FULL_MESSAGE)
  const id = randomUUID()
  const look = textAdLookSchema.parse(saved.look)
  const name = saved.name.trim().slice(0, 60)
  await database.insert(videoAdLooks).values({ id, userId, name, look, createdAt: now() })
  return { id, name, look }
}

export async function removeAdLook(
  userId: string,
  id: string,
  database: CustomShellDb = db
) {
  const removed = await database
    .delete(videoAdLooks)
    .where(and(eq(videoAdLooks.id, id), eq(videoAdLooks.userId, userId)))
    .returning({ id: videoAdLooks.id })
  if (!removed.length) throw new Error(AD_LOOK_NOT_FOUND_MESSAGE)
}

// -------------------------------------------------------------- rules ---

export async function getAdRules(database: CustomShellDb = db): Promise<AdRules> {
  const [row] = await database
    .select({ rules: videoSettings.adRules })
    .from(videoSettings)
    .where(eq(videoSettings.id, "default"))
    .limit(1)
  return readAdRules(row?.rules)
}

export async function saveAdRules(rules: AdRules, database: CustomShellDb = db) {
  const at = now()
  await database
    .insert(videoSettings)
    .values({ id: "default", adRules: rules, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { adRules: rules, updatedAt: at },
    })
}

// ----------------------------------------------------------- loudness ---

/**
 * How loud one file is, in LUFS: a number, null when it is silent, or
 * "unmeasured" when it could not be read this time (ffmpeg failed, the
 * network dropped, or a video over 1GB has no smooth copy yet). Only a real
 * answer is kept, so the next ad tries again after a failure.
 */
async function measureFile(mediaId: string): Promise<number | null | "unmeasured"> {
  let source: Awaited<ReturnType<typeof openSoundSource>>
  try {
    source = await openSoundSource(mediaId)
  } catch {
    return "unmeasured"
  }
  try {
    if (source.streamsBigOriginal) return "unmeasured"
    const stderr = await runFfmpeg(
      [
        ...inputArgs(source.input),
        "-vn",
        "-af",
        loudnormMeasureFilter(),
        "-f",
        "null",
        "-",
      ],
      "The sound could not be measured."
    )
    // No measurement in what ffmpeg said means a silent file ("-inf").
    return parseLoudnormMeasurement(stderr)?.inputI ?? null
  } catch {
    return "unmeasured"
  } finally {
    await source.release()
  }
}

/**
 * How loud each file is, measured once and kept. Only the asker's own files
 * are measured; anything else comes back as null.
 */
export async function measureLoudness(
  userId: string,
  mediaIds: string[],
  database: CustomShellDb = db,
  measure: (mediaId: string) => Promise<number | null | "unmeasured"> = measureFile
): Promise<Record<string, number | null>> {
  const wanted = [...new Set(mediaIds)].slice(0, 10)
  if (!wanted.length) return {}
  const owned = await database
    .select({ id: customShellMedia.id })
    .from(customShellMedia)
    .where(
      and(
        inArray(customShellMedia.id, wanted),
        eq(customShellMedia.userId, userId),
        inArray(customShellMedia.fileType, ["video", "audio"])
      )
    )
  const ownedIds = owned.map((row) => row.id)
  const kept = ownedIds.length
    ? await database
        .select()
        .from(videoMediaLoudness)
        .where(inArray(videoMediaLoudness.mediaId, ownedIds))
    : []
  const result: Record<string, number | null> = Object.fromEntries(wanted.map((id) => [id, null]))
  for (const row of kept) result[row.mediaId] = row.lufs
  for (const id of ownedIds) {
    if (kept.some((row) => row.mediaId === id)) continue
    const lufs = await measure(id)
    if (lufs === "unmeasured") continue
    result[id] = lufs
    await database
      .insert(videoMediaLoudness)
      .values({ mediaId: id, lufs, measuredAt: now() })
      .onConflictDoNothing()
  }
  return result
}

// ------------------------------------------------------------------ AI ---

const AD_TEXT_FEATURE = "ad_text"
const AD_READ_FEATURE = "ad_read"

const textAnswer = z.object({ text: z.string().min(1).max(TEXT_AD_MAX) })
const readAnswer = z.object({ script: z.string().min(1).max(3000) })

/** The video the spend is filed under, refused when its project is over its AI limit. */
async function spendFor(userId: string, videoId?: string): Promise<SpendTag | null> {
  if (!videoId) return null
  return videoSpendMetadata(await requireVideoBudget(userId, videoId, 0))
}

/** One or two lines of ad words from a few words about the product. */
export async function writeTextAd({
  userId,
  about,
  videoId,
}: {
  userId: string
  about: string
  videoId?: string
}): Promise<string> {
  const answer = await askWriter({
    userId,
    feature: AD_TEXT_FEATURE,
    metadata: (await spendFor(userId, videoId)) ?? {},
    label: "The ad words",
    schema: textAnswer,
    prompt: [
      "Write the words for a short text ad shown along the bottom of a video for 8 seconds.",
      "At most 12 words, one or two short lines, plain and direct, no hashtags, no emoji, no quotation marks.",
      "Keep any name, code or price exactly as given.",
      `What it is about: ${about.trim().slice(0, AD_ABOUT_MAX)}`,
      'Answer as JSON: {"text": "..."}',
    ].join("\n"),
  })
  return answer.text.trim().slice(0, TEXT_AD_MAX)
}

/**
 * A sponsor read: the AI writes it to length, the cloned voice says it, and
 * it goes on the shelf as a clip ad that remembers its script and voice.
 */
export async function makeSponsorRead(
  {
    userId,
    about,
    seconds,
    voiceId,
    voiceName,
    modelId,
    settings,
    videoId,
  }: {
    userId: string
    about: string
    seconds: AdReadSeconds
    voiceId: string
    voiceName: string
    modelId: string
    settings?: VoiceSettings
    videoId?: string
  },
  database: CustomShellDb = db
): Promise<string> {
  await requireRoom(userId, database)
  const spend = await spendFor(userId, videoId)
  const words = adReadWords(seconds)
  const { script } = await askWriter({
    userId,
    feature: AD_READ_FEATURE,
    metadata: spend ?? {},
    label: "The sponsor read",
    schema: readAnswer,
    prompt: [
      `Write a ${seconds} second sponsor read for a creator to say in their own video, about ${words} words.`,
      "Spoken, first person, warm and plain. Say who the sponsor is, what it does, and one reason to try it, then how to get it.",
      "Keep any name, code, link or price exactly as given. No stage directions, no headings.",
      `What the sponsor sells: ${about.trim().slice(0, AD_ABOUT_MAX)}`,
      'Answer as JSON: {"script": "..."}',
    ].join("\n"),
  })
  const said = await speak({
    userId,
    voiceId,
    voiceName,
    modelId,
    settings,
    text: script.trim(),
    feature: AD_READ_FEATURE,
    spend,
  })
  const id = randomUUID()
  await database.insert(videoAds).values({
    id,
    userId,
    kind: "clip",
    name: `Sponsor read, ${seconds} seconds`,
    mediaId: said.mediaId,
    readScript: script.trim(),
    readVoiceId: voiceId,
    readVoiceName: voiceName,
    createdAt: now(),
  })
  return id
}

// ------------------------------------------------------ viewer curves ---

/**
 * The viewer curves of every export in this video's project that went up on
 * YouTube and has been read, one per video, for "Where viewers stay".
 */
export async function projectViewerCurves(
  userId: string,
  videoId: string,
  database: CustomShellDb = db
): Promise<{ ratio: number; watch: number }[][]> {
  const video = await getOwnedVideo(userId, videoId, database)
  const rows = await database
    .select({ videoId: videoRenderJobs.videoId, points: videoExportYoutube.points })
    .from(videoExportYoutube)
    .innerJoin(videoRenderJobs, eq(videoRenderJobs.id, videoExportYoutube.exportId))
    .where(
      and(
        eq(videoRenderJobs.projectId, video.projectId),
        eq(videoRenderJobs.userId, userId),
        isNotNull(videoExportYoutube.points)
      )
    )
    .orderBy(desc(videoExportYoutube.readAt))
  const seen = new Set<string | null>()
  const curves: { ratio: number; watch: number }[][] = []
  for (const row of rows) {
    if (seen.has(row.videoId)) continue
    seen.add(row.videoId)
    const points = (row.points ?? []) as RetentionPoint[]
    if (points.length >= 2) {
      curves.push(points.map((point) => ({ ratio: point.ratio, watch: point.watch })))
    }
  }
  return curves
}
