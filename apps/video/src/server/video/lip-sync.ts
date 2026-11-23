import { createWriteStream } from "node:fs"
import { mkdtemp, open, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

import { and, desc, eq, inArray, lt } from "drizzle-orm"

import { clipSpeed } from "@/lib/video/clip-playback"
import {
  LIP_SYNC_FAILED_MESSAGE,
  LIP_SYNC_KEY_MESSAGE,
  LIP_SYNC_MAX_MS,
  LIP_SYNC_MIN_MS,
  LIP_SYNC_MODEL,
  LIP_SYNC_NO_VOICE_MESSAGE,
  LIP_SYNC_NOT_FOUND_MESSAGE,
  LIP_SYNC_NOT_VIDEO_MESSAGE,
  LIP_SYNC_SPEED_MESSAGE,
  LIP_SYNC_TOO_LONG_MESSAGE,
  LIP_SYNC_TOO_SHORT_MESSAGE,
  lipSyncCostCents,
  voiceWindow,
  type LipSyncStatus,
} from "@/lib/video/lip-sync"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia, validateMediaContent } from "@/server/media/library"
import { deleteFromR2, getPublicMediaUrl, uploadFileToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { runFfmpeg } from "@/server/video/ffmpeg"
import { requireVideoBudget, videoSpendMetadata } from "@/server/video/project-spend"
import { inputArgs, openRenderSource } from "@/server/video/render-sources"
import { videoLipSyncs, videoProjectVideos, type VideoLipSyncRow } from "@/server/video/schema"
import { getSyncApiKey } from "@/server/video/settings"
import { isUniqueViolation } from "@/server/video/unique-violation"
import { recordVideoCharge, requireAllowanceRoom } from "@/server/video/video-meter"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * Making a clip's lips match a new voice with Sync Labs
 * (workspace/docs/lip-sync.md).
 *
 * Starting cuts the footage under the clip and the voice over the same
 * stretch, puts both in storage where Sync can fetch them, and asks Sync to
 * start. Sync works on it for a minute or more, so the editor asks how it is
 * going every few seconds (`checkLipSync`), and the first ask after Sync has
 * finished brings the finished file into the media library and writes the
 * charge on the meter. The two files sent are deleted as soon as the job ends.
 */

const SYNC_URL = "https://api.sync.so/v2/generate"
/** No 5 minute clip comes back anywhere near this big. */
const MAX_OUTPUT_BYTES = 2 * 1024 ** 3
/** Past this, a job Sync still calls unfinished is given up on, at no charge. */
const GIVE_UP_MS = 30 * 60_000

export type LipSyncView = {
  id: string
  clip_id: string
  status: LipSyncStatus
  error: string | null
  cost_cents: number
  media: { id: string; url: string; name: string; duration_ms: number } | null
}

async function requireKey() {
  const key = await getSyncApiKey()
  if (!key) throw new Error(LIP_SYNC_KEY_MESSAGE)
  return key
}

async function view(row: VideoLipSyncRow, database: CustomShellDb): Promise<LipSyncView> {
  let media: LipSyncView["media"] = null
  if (row.mediaId) {
    const [file] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, row.mediaId))
      .limit(1)
    if (file) {
      const served = await serializeMedia(file)
      media = { id: file.id, url: served.url, name: file.originalName, duration_ms: row.durationMs }
    }
  }
  return {
    id: row.id,
    clip_id: row.clipId,
    status: row.status as LipSyncStatus,
    error: row.error,
    cost_cents: row.costCents,
    media,
  }
}

/**
 * Starts matching a clip's lips to a sound clip laid over it. A clip with a
 * job still working gets that job back rather than a second charge.
 */
export async function startLipSync(
  {
    userId,
    videoId,
    clipId,
    soundClipId,
  }: { userId: string; videoId: string; clipId: string; soundClipId: string },
  database: CustomShellDb = db
): Promise<LipSyncView> {
  const apiKey = await requireKey()
  const owned = await requireVideoBudget(userId, videoId, 0, database)
  const clips = requireCanonicalTimeline(owned.timeline).tracks.flatMap((track) => track.clips)
  const clip = clips.find((one) => one.id === clipId)
  const sound = clips.find((one) => one.id === soundClipId)
  if (!clip || !sound) throw new Error(LIP_SYNC_NOT_FOUND_MESSAGE)
  if (clip.kind !== "video" || !clip.mediaId) throw new Error(LIP_SYNC_NOT_VIDEO_MESSAGE)
  if (sound.kind !== "audio" || !sound.mediaId) throw new Error(LIP_SYNC_NO_VOICE_MESSAGE)
  if (clipSpeed(clip) !== 1 || clipSpeed(sound) !== 1) throw new Error(LIP_SYNC_SPEED_MESSAGE)
  if (clip.durationMs > LIP_SYNC_MAX_MS) throw new Error(LIP_SYNC_TOO_LONG_MESSAGE)
  if (clip.durationMs < LIP_SYNC_MIN_MS) throw new Error(LIP_SYNC_TOO_SHORT_MESSAGE)
  const window = voiceWindow(clip, sound)
  if (window.soundMs <= 0) throw new Error(LIP_SYNC_NO_VOICE_MESSAGE)

  const [working] = await database
    .select()
    .from(videoLipSyncs)
    .where(
      and(
        eq(videoLipSyncs.videoId, videoId),
        eq(videoLipSyncs.clipId, clipId),
        eq(videoLipSyncs.status, "working")
      )
    )
    .limit(1)
  if (working) return view(working, database)

  // Jobs still working are on nobody's meter until they land, so their
  // expected cost is counted in with this one, or several presses at once
  // would each see the same untouched allowance.
  const cents = lipSyncCostCents(clip.durationMs)
  const owed = await workingCents(userId, videoId, database)
  await requireAllowanceRoom(userId, cents, owed.person)
  await requireVideoBudget(userId, videoId, cents, database, owed.video)

  const files = await database
    .select()
    .from(customShellMedia)
    .where(
      and(
        eq(customShellMedia.userId, userId),
        inArray(customShellMedia.id, [clip.mediaId, sound.mediaId])
      )
    )
  const footage = files.find((file) => file.id === clip.mediaId)
  const voice = files.find((file) => file.id === sound.mediaId)
  if (!footage || !voice) throw new Error(LIP_SYNC_NOT_FOUND_MESSAGE)

  const id = uuid()
  const sent = [`${userId}/lip-sync-${id}-video.mp4`, `${userId}/lip-sync-${id}-voice.wav`]

  // The clip is claimed before anything is made or sent: the database keeps
  // one working job per clip, so two presses at the same moment make one job.
  // The row holds the expected cost until Sync says what it really was.
  const at = now()
  let row: VideoLipSyncRow
  try {
    ;[row] = await database
      .insert(videoLipSyncs)
      .values({
        id,
        userId,
        videoId,
        clipId,
        soundClipId,
        status: "working",
        durationMs: Math.round(clip.durationMs),
        costCents: cents,
        sentPaths: sent,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const latest = await latestLipSync(userId, videoId, clipId, database)
    if (latest) return latest
    throw error
  }

  const dir = await mkdtemp(path.join(tmpdir(), "lip-sync-"))
  try {
    const footageFile = path.join(dir, "video.mp4")
    const voiceFile = path.join(dir, "voice.wav")
    const seconds = (ms: number) => (ms / 1000).toFixed(3)
    const footageSource = await openRenderSource(footage, { draft: false })
    try {
      // The footage under the clip, without its own sound.
      await runFfmpeg(
        [
          "-y",
          "-ss", seconds(clip.trimStartMs),
          "-t", seconds(clip.durationMs),
          ...inputArgs(footageSource.input),
          "-an",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
          footageFile,
        ],
        LIP_SYNC_FAILED_MESSAGE
      )
    } finally {
      await footageSource.release().catch(() => undefined)
    }
    const voiceSource = await openRenderSource(voice, { draft: false })
    try {
      // The voice over the same stretch, with silence before and after it.
      const delay = Math.round(window.silenceBeforeMs)
      await runFfmpeg(
        [
          "-y",
          "-ss", seconds(window.soundFromMs),
          "-t", seconds(window.soundMs),
          ...inputArgs(voiceSource.input),
          "-af", `adelay=${delay}:all=1,apad,atrim=0:${seconds(clip.durationMs)}`,
          "-ac", "1", "-ar", "44100",
          voiceFile,
        ],
        LIP_SYNC_FAILED_MESSAGE
      )
    } finally {
      await voiceSource.release().catch(() => undefined)
    }
    await uploadFileToR2(sent[0], footageFile, "video/mp4")
    await uploadFileToR2(sent[1], voiceFile, "audio/wav")
  } catch (error) {
    console.error("Lip sync files could not be made", error)
    await end(row, LIP_SYNC_FAILED_MESSAGE, database)
    throw new Error(LIP_SYNC_FAILED_MESSAGE)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  let generationId: string
  try {
    const form = new FormData()
    form.set("model", LIP_SYNC_MODEL)
    form.set(
      "input",
      JSON.stringify([
        { type: "video", url: await getPublicMediaUrl(sent[0]) },
        { type: "audio", url: await getPublicMediaUrl(sent[1]) },
      ])
    )
    // The two are the same length; anything Sync measures over is cut.
    form.set("options", JSON.stringify({ sync_mode: "cut_off" }))
    const response = await fetch(SYNC_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) {
      const said = await response.text().then((text) => text.slice(0, 500), () => "")
      console.error("Sync Labs start", response.status, said)
      throw new Error(LIP_SYNC_FAILED_MESSAGE)
    }
    const answer = (await response.json()) as { id?: unknown }
    if (typeof answer.id !== "string" || !answer.id) throw new Error(LIP_SYNC_FAILED_MESSAGE)
    generationId = answer.id
  } catch (error) {
    if (!(error instanceof Error && error.message === LIP_SYNC_FAILED_MESSAGE)) {
      console.error("Sync Labs could not be asked", error)
    }
    await end(row, LIP_SYNC_FAILED_MESSAGE, database)
    throw new Error(LIP_SYNC_FAILED_MESSAGE)
  }

  const [asked] = await database
    .update(videoLipSyncs)
    .set({ generationId, updatedAt: now() })
    .where(eq(videoLipSyncs.id, row.id))
    .returning()
  return view(asked ?? row, database)
}

/** The expected cost of this person's jobs still working, and of this video's. */
async function workingCents(userId: string, videoId: string, database: CustomShellDb) {
  const rows = await database
    .select({ videoId: videoLipSyncs.videoId, cents: videoLipSyncs.costCents })
    .from(videoLipSyncs)
    .where(and(eq(videoLipSyncs.userId, userId), eq(videoLipSyncs.status, "working")))
  return {
    person: rows.reduce((sum, row) => sum + row.cents, 0),
    video: rows.filter((row) => row.videoId === videoId).reduce((sum, row) => sum + row.cents, 0),
  }
}

/** The newest job for this clip, so a window opened again picks it back up. */
export async function latestLipSync(
  userId: string,
  videoId: string,
  clipId: string,
  database: CustomShellDb = db
): Promise<LipSyncView | null> {
  const [row] = await database
    .select()
    .from(videoLipSyncs)
    .where(
      and(
        eq(videoLipSyncs.userId, userId),
        eq(videoLipSyncs.videoId, videoId),
        eq(videoLipSyncs.clipId, clipId)
      )
    )
    .orderBy(desc(videoLipSyncs.createdAt))
    .limit(1)
  return row ? view(row, database) : null
}

/**
 * How a job stands, asking Sync when it is still working. The ask that finds
 * it finished brings the file in, writes the charge, and deletes what was sent.
 */
export async function checkLipSync(
  userId: string,
  jobId: string,
  database: CustomShellDb = db,
  at = now()
): Promise<LipSyncView> {
  const [row] = await database
    .select()
    .from(videoLipSyncs)
    .where(and(eq(videoLipSyncs.id, jobId), eq(videoLipSyncs.userId, userId)))
    .limit(1)
  if (!row) throw new Error(LIP_SYNC_NOT_FOUND_MESSAGE)
  if (row.status !== "working" || !row.generationId) return view(row, database)

  const apiKey = await requireKey()
  const response = await fetch(`${SYNC_URL}/${encodeURIComponent(row.generationId)}`, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(30_000),
  })
  // A hiccup asking is not a failure; the next ask tries again.
  if (!response.ok) return view(row, database)
  const answer = (await response.json()) as {
    status?: string
    outputUrl?: string
    outputDuration?: number
    error?: string
  }

  const tooLong = at.getTime() - row.createdAt.getTime() > GIVE_UP_MS
  if (answer.status === "COMPLETED" && answer.outputUrl?.startsWith("https://")) {
    const landed = await land(row, answer.outputUrl, answer.outputDuration, database)
    // Finished at Sync but never brought in, such as an address that has
    // run out: given up on like any job past its time, so it never asks forever.
    if (landed.status === "working" && tooLong) return end(row, LIP_SYNC_FAILED_MESSAGE, database)
    return landed
  }
  if (answer.status === "FAILED" || answer.status === "REJECTED" || tooLong) {
    console.error("Sync Labs job ended without a video", row.generationId, answer.status, answer.error)
    return end(row, LIP_SYNC_FAILED_MESSAGE, database)
  }
  return view(row, database)
}

/** A job that ended without a video: nothing charged, the sent files deleted. */
async function end(row: VideoLipSyncRow, error: string, database: CustomShellDb) {
  const [ended] = await database
    .update(videoLipSyncs)
    .set({ status: "failed", error, costCents: 0, sentPaths: [], updatedAt: now() })
    .where(and(eq(videoLipSyncs.id, row.id), eq(videoLipSyncs.status, "working")))
    .returning()
  if (ended) {
    await Promise.all(row.sentPaths.map((one) => deleteFromR2(one).catch(() => undefined)))
    const [video] = await database
      .select()
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.id, row.videoId))
      .limit(1)
    await recordVideoCharge({
      userId: row.userId,
      company: "sync",
      feature: "lip_sync",
      model: LIP_SYNC_MODEL,
      status: "failed",
      cents: 0,
      metadata: video ? videoSpendMetadata(video) : {},
    })
  }
  return view(ended ?? row, database)
}

/** Thrown inside the landing step when another ask landed the job first. */
class AlreadyLanded extends Error {}

/** Brings the finished video into the library and marks the job ready. */
async function land(
  row: VideoLipSyncRow,
  outputUrl: string,
  outputDuration: number | undefined,
  database: CustomShellDb
) {
  const dir = await mkdtemp(path.join(tmpdir(), "lip-sync-done-"))
  const filename = `${uuid()}-lips-matched.mp4`
  const storagePath = `${row.userId}/${filename}`
  try {
    // Sync's answer names the address, so it is fetched with no redirects
    // followed, no more than the biggest file a 5 minute job makes, and checked
    // to be a video before it is kept.
    const download = await fetch(outputUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(10 * 60_000),
    })
    if (!download.ok || !download.body) throw new Error(LIP_SYNC_FAILED_MESSAGE)
    const file = path.join(dir, "out.mp4")
    let received = 0
    const capped = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        received += chunk.byteLength
        done(received > MAX_OUTPUT_BYTES ? new Error("Sync's video is too big") : null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(download.body as never), capped, createWriteStream(file))
    const { size } = await stat(file)
    const head = Buffer.alloc(16)
    const handle = await open(file, "r")
    try {
      await handle.read(head, 0, 16, 0)
    } finally {
      await handle.close()
    }
    validateMediaContent("video/mp4", new Uint8Array(head))
    await uploadFileToR2(storagePath, file, "video/mp4")

    const [video] = await database
      .select()
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.id, row.videoId))
      .limit(1)
    const clip = video
      ? requireCanonicalTimeline(video.timeline)
          .tracks.flatMap((track) => track.clips)
          .find((one) => one.id === row.clipId)
      : undefined
    const at = now()
    const media = {
      id: uuid(),
      workspaceId: await workspaceIdForRequest(row.userId),
      userId: row.userId,
      filename,
      originalName: `${clip?.name ?? "Clip"} (lips matched).mp4`,
      altText: null,
      fileSize: size,
      mimeType: "video/mp4",
      fileType: "video",
      storagePath,
      emailProtectedAt: null,
      createdAt: at,
      updatedAt: at,
    }
    // Sync charges by the finished length; without it, the length sent.
    const cents =
      typeof outputDuration === "number" && outputDuration > 0
        ? lipSyncCostCents(outputDuration * 1000)
        : lipSyncCostCents(row.durationMs)
    // The file's row first, then the job pointing at it. When another ask has
    // already landed the job, the whole step is taken back.
    const landed = await database
      .transaction(async (tx) => {
        await tx.insert(customShellMedia).values(media)
        const [claimed] = await tx
          .update(videoLipSyncs)
          .set({ status: "ready", mediaId: media.id, costCents: cents, sentPaths: [], updatedAt: at })
          .where(and(eq(videoLipSyncs.id, row.id), eq(videoLipSyncs.status, "working")))
          .returning()
        if (!claimed) throw new AlreadyLanded()
        return claimed
      })
      .catch((error: unknown) => {
        if (error instanceof AlreadyLanded) return null
        throw error
      })
    if (!landed) {
      // Another ask landed it first.
      await deleteFromR2(storagePath).catch(() => undefined)
      const [current] = await database.select().from(videoLipSyncs).where(eq(videoLipSyncs.id, row.id))
      return view(current ?? row, database)
    }
    await recordVideoCharge({
      userId: row.userId,
      company: "sync",
      feature: "lip_sync",
      model: LIP_SYNC_MODEL,
      status: "success",
      cents,
      metadata: video ? videoSpendMetadata(video) : {},
    })
    await Promise.all(row.sentPaths.map((one) => deleteFromR2(one).catch(() => undefined)))
    return view(landed, database)
  } catch (error) {
    console.error("A matched video could not be brought in", row.id, error)
    await deleteFromR2(storagePath).catch(() => undefined)
    // Left working, so the next ask tries to bring it in again.
    return view(row, database)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** How often a working job is asked about when no editor is asking. */
const SWEEP_EVERY_MS = 60_000
/** A job that never got as far as Sync is given up on after this long. */
const NEVER_SENT_MS = 10 * 60_000

/**
 * Rides the background ticker: asks Sync about jobs nobody's editor is
 * asking about, so a job whose window was closed still lands in the media
 * library and on the meter, or ends at no charge, and the files sent to Sync
 * are always deleted. A few at a time, each at most once a minute.
 */
export async function lipSyncTick(database: CustomShellDb = db, at = now()) {
  const stale = await database
    .select()
    .from(videoLipSyncs)
    .where(
      and(
        eq(videoLipSyncs.status, "working"),
        lt(videoLipSyncs.updatedAt, new Date(at.getTime() - SWEEP_EVERY_MS))
      )
    )
    .orderBy(videoLipSyncs.updatedAt)
    .limit(5)
  for (const row of stale) {
    try {
      if (!row.generationId) {
        if (at.getTime() - row.createdAt.getTime() > NEVER_SENT_MS) {
          await end(row, LIP_SYNC_FAILED_MESSAGE, database)
        }
        continue
      }
      const checked = await checkLipSync(row.userId, row.id, database, at)
      if (checked.status === "working") {
        await database
          .update(videoLipSyncs)
          .set({ updatedAt: at })
          .where(and(eq(videoLipSyncs.id, row.id), eq(videoLipSyncs.status, "working")))
      }
    } catch (error) {
      console.error("Lip sync sweep failed", row.id, error)
    }
  }
}
