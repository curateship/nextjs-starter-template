import { and, asc, desc, eq, gte, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm"
import { z } from "zod"

import {
  ELEVENLABS_KEY_MISSING_MESSAGE,
  GEMINI_KEY_MISSING_MESSAGE,
  OPENAI_KEY_MISSING_MESSAGE,
} from "@/lib/video/ai-providers"
import { pickWriter } from "@/lib/video/ai-choices"
import {
  assetName,
  projectClipAspect,
  sceneName,
  type AssetAspectRatio,
  type GeminiImageModelId,
} from "@/lib/video/asset-factories"
import {
  BRIEF_BUSY_MESSAGE,
  BRIEF_NO_SCENES_MESSAGE,
  BRIEF_NOT_FOUND_MESSAGE,
  BRIEF_NOTHING_TO_RETRY_MESSAGE,
  BRIEF_SCENES_MAX,
  briefLaneRefusal,
  briefStartMs,
  landBriefScenes,
  newScene,
  platformFor,
  sceneLeftCents,
  scenePictureCents,
  storyboardScript,
  totalSeconds,
  BRIEF_BREATH_MS,
  SCENE_PICTURE_MAX,
  sceneVoiceCents,
  type BriefFinish,
  type BriefLanding,
  type BriefPlatform,
  type BriefMusic,
  type BriefSource,
  type BriefVoice,
  type BriefScript,
  type BriefStatus,
  type SceneDraft,
  type SceneWithFiles,
  type StoredScene,
} from "@/lib/video/brief"
import type { ScenePictureOrigin } from "@/lib/video/clip-origin"
import { EDITOR_WINDOW_GONE_AFTER_MS } from "@/lib/video/editor-windows"
import { voiceOrigin } from "@/lib/video/remake-clip"
import type { ScriptCheck } from "@/lib/video/script-check"
import { formatCents } from "@/lib/video/project-spend"
import { parseTimelineForReset, type AspectRatio } from "@/lib/video/timeline-schema"
import {
  SCENES_TOKEN,
  TEMPLATE_IDEA_MAX,
  TEMPLATE_NO_SCRIPT_MESSAGE,
  TEMPLATE_NO_VOICE_MESSAGE,
  paceRange,
  readTemplateFields,
  readTemplateSnapshot,
  readingSeconds,
  templateCaptions,
  scriptScenes,
  sentencesOf,
  makingCents,
  templateCapMessage,
  templateScriptCostCents,
  tooManyScenesMessage,
  type TemplateFields,
  type TemplateSnapshot,
} from "@/lib/video/templates"
import { languageCopyName, type TranslateLanguage } from "@/lib/video/translate"
import { createDefaultVoiceSettings, rememberedVoiceSettings } from "@/lib/video/voice"
import { withLook } from "@/lib/video/visual-style"
import { getAiKey } from "@/server/ai/keys"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedMedia } from "@/server/media/library"
import { getFromR2, getPublicMediaUrl } from "@/server/media/storage"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellMedia, customShellNotifications } from "@/server/schema"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { generateImage } from "@/server/video/asset-factories/images"
import { saveGeneratedAsset } from "@/server/video/asset-factories/media"
import { attachPastedMediaToProject, serializeVideoMedia } from "@/server/video/media-list"
import { readProjectLook } from "@/server/video/project-look"
import {
  requireVideoBudget,
  videoSpendMetadata,
  type SpendTag,
} from "@/server/video/project-spend"
import {
  getOwnedVideo,
  insertVideo,
  writeVideoTimeline,
} from "@/server/video/project-videos"
import {
  videoBriefs,
  videoEditorWindows,
  videoProjectVideos,
  type VideoBriefRow,
} from "@/server/video/schema"
import { checkScript } from "@/server/video/script-check"
import {
  getAiDefaults,
  getCaptionSettings,
  getVoiceDefaults,
} from "@/server/video/settings"
import { ownedTemplate, referenceNotes, templateForVideo } from "@/server/video/templates"
import { speak, soundDurationMs } from "@/server/video/voice"
import { askWriter } from "@/server/video/writer"

/**
 * Brief to video (`workspace/docs/brief-to-video.md`).
 *
 * A brief is written into a script by whichever AI writes words, checked
 * against the script rules, and kept as a storyboard of scenes. Make it hands
 * the scenes to the background job here, which makes each one in order: a
 * still picture in the project's look, then its words read aloud. A made
 * scene is laid on the timeline by the open editor, as one Undo step, or by
 * `briefTick` when no editor has the project open, the same way a moving shot
 * lands (`animate-a-still.md`).
 */

const BRIEF_SCRIPT_FEATURE = "brief_script"
const BRIEF_SCRIPT_LABEL = "Brief script"
/** A scene takes well under a minute; the lease is renewed after each one. */
const LEASE_MS = 5 * 60_000
/** How many briefs one worker pass makes scenes for, side by side. */
const BRIEFS_PER_PASS = 3
/** How many briefs one worker pass lands scenes for. */
const LANDINGS_PER_PASS = 10
/** A provider's reason can run long. The storyboard shows this much. */
const SCENE_ERROR_MAX = 300
/** How many of a project's briefs the window lists. */
const BRIEFS_LISTED = 20

export type BriefItem = {
  id: string
  project_id: string
  video_id: string
  about: string
  audience: string
  length_seconds: number
  platform: BriefPlatform
  voice: BriefVoice
  picture_model: GeminiImageModelId
  title: string
  hook: string
  scenes: SceneWithFiles[]
  check: ScriptCheck | null
  check_error: string | null
  status: BriefStatus
  landing: BriefLanding | null
  /** Made from a template: which one, and the copy of it the brief keeps. */
  template_id: string | null
  template: TemplateSnapshot | null
  source: BriefSource | null
  finish: BriefFinish | null
  created_at: string
}

/** A malformed answer is asked again once; anything else fails straight away. */
function isMalformed(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return /came back (empty|as something other than an answer|in an unexpected shape)/.test(message)
}

/**
 * Why a scene or a check failed, short enough for the storyboard. A long
 * provider reason is cut after its last whole sentence that fits, so Google's
 * quota message ends at "billing details." rather than mid-word.
 */
function readableMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ""
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  if (!message) return "It could not be made."
  if (message.length <= SCENE_ERROR_MAX) return message
  const cut = message.slice(0, SCENE_ERROR_MAX)
  const end = cut.lastIndexOf(". ")
  return end > 40 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`
}

/** The files each scene has, at the addresses they play from today. */
async function serializeBriefs(rows: VideoBriefRow[]): Promise<BriefItem[]> {
  const mediaIds = rows.flatMap((row) => [
    ...row.scenes.flatMap((scene) => [scene.still?.mediaId, scene.voice?.mediaId]),
    row.landing?.music?.mediaId,
  ]).filter((id): id is string => !!id)
  const files = mediaIds.length
    ? await db
        .select({ id: customShellMedia.id, storagePath: customShellMedia.storagePath })
        .from(customShellMedia)
        .where(inArray(customShellMedia.id, [...new Set(mediaIds)]))
    : []
  const urls = new Map(
    await Promise.all(
      files.map(async (file) => [file.id, await getPublicMediaUrl(file.storagePath)] as const)
    )
  )
  return rows.map((row) => ({
    id: row.id,
    project_id: row.projectId,
    video_id: row.videoId,
    about: row.about,
    audience: row.audience,
    length_seconds: row.lengthSeconds,
    platform: row.platform,
    voice: row.voice,
    picture_model: row.pictureModel as GeminiImageModelId,
    title: row.title,
    hook: row.hook,
    scenes: row.scenes.map((scene) => {
      const stillUrl = scene.still ? urls.get(scene.still.mediaId) : undefined
      const voiceUrl = scene.voice ? urls.get(scene.voice.mediaId) : undefined
      return {
        ...scene,
        still: scene.still && stillUrl ? { ...scene.still, url: stillUrl } : undefined,
        voice: scene.voice && voiceUrl ? { ...scene.voice, url: voiceUrl } : undefined,
      }
    }),
    check: row.check,
    check_error: row.checkError,
    status: row.status,
    landing: row.landing?.music
      ? { ...row.landing, music: { ...row.landing.music, url: urls.get(row.landing.music.mediaId) } }
      : row.landing,
    template_id: row.templateId,
    template: readTemplateSnapshot(row.template),
    source: row.source,
    finish: row.finish,
    created_at: row.createdAt.toISOString(),
  }))
}

/** This video's briefs, newest first. Reading them costs nothing. */
export async function listBriefs(userId: string, videoId: string) {
  await getOwnedVideo(userId, videoId)
  const rows = await db
    .select()
    .from(videoBriefs)
    .where(and(eq(videoBriefs.userId, userId), eq(videoBriefs.videoId, videoId)))
    .orderBy(desc(videoBriefs.createdAt), desc(videoBriefs.id))
    .limit(BRIEFS_LISTED)
  return { briefs: await serializeBriefs(rows) }
}

async function ownedBrief(userId: string, briefId: string, database: CustomShellDb = db) {
  const [row] = await database
    .select()
    .from(videoBriefs)
    .where(and(eq(videoBriefs.id, briefId), eq(videoBriefs.userId, userId)))
    .limit(1)
  if (!row) throw new Error(BRIEF_NOT_FOUND_MESSAGE)
  return row
}

/**
 * The storyboard as edited: scenes keep their ids, a new scene gets one.
 * Only a brief nothing has been made for can be edited.
 */
function editedScenes(row: VideoBriefRow, drafts: (SceneDraft & { id?: string })[]) {
  if (row.status !== "draft") throw new Error(BRIEF_BUSY_MESSAGE)
  if (!drafts.length) throw new Error(BRIEF_NO_SCENES_MESSAGE)
  const known = new Set(row.scenes.map((scene) => scene.id))
  return drafts.map((draft) =>
    newScene(draft, draft.id && known.has(draft.id) ? draft.id : uuid())
  )
}

/** Keeps the storyboard's edits, so it reopens as it was left. */
export async function saveBriefScenes(
  userId: string,
  payload: { briefId: string; scenes: (SceneDraft & { id?: string })[] }
) {
  const row = await ownedBrief(userId, payload.briefId)
  const [saved] = await db
    .update(videoBriefs)
    .set({ scenes: editedScenes(row, payload.scenes), updatedAt: now() })
    .where(and(eq(videoBriefs.id, row.id), eq(videoBriefs.status, "draft")))
    .returning()
  if (!saved) throw new Error(BRIEF_BUSY_MESSAGE)
  return (await serializeBriefs([saved]))[0]
}

/** A missing key is said before anything starts, rather than at scene one. */
async function requireBriefKeys(voice: BriefVoice) {
  if (!(await getAiKey("gemini"))) throw new Error(GEMINI_KEY_MISSING_MESSAGE)
  if (voice.speaker === "openai" && !(await getAiKey("openai"))) {
    throw new Error(OPENAI_KEY_MISSING_MESSAGE)
  }
  if (voice.speaker === "elevenlabs" && !(await getAiKey("elevenlabs"))) {
    throw new Error(ELEVENLABS_KEY_MISSING_MESSAGE)
  }
}

/**
 * Make it: keeps the storyboard as it stands and hands every scene to the
 * background job. Where scene one goes is settled now, from the saved
 * timeline, so the editor saves first. The whole storyboard's price is held
 * to the project's spend limit before anything is made.
 */
export async function startBrief(
  userId: string,
  payload: { briefId: string; scenes: (SceneDraft & { id?: string })[]; playheadMs: number }
) {
  const row = await ownedBrief(userId, payload.briefId)
  const scenes = editedScenes(row, payload.scenes).map(
    (scene): StoredScene => ({ ...scene, state: "queued" })
  )
  const video = await getOwnedVideo(userId, row.videoId)
  const { timeline } = parseTimelineForReset(video.timeline)
  const refusal = briefLaneRefusal(timeline.tracks)
  if (refusal) throw new Error(refusal)
  await requireBriefKeys(row.voice)
  const fields = readTemplateSnapshot(row.template)?.fields
  const price = makingCents(scenes, row.voice, row.pictureModel, fields)
  if (fields?.spendCapCents && price.total > fields.spendCapCents) {
    throw new Error(templateCapMessage(fields.spendCapCents, price.total, formatCents))
  }
  await requireVideoBudget(userId, video.id, price.thisVideo)
  const [started] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(videoBriefs)
      .set({
        scenes,
        status: "making",
        landing: { startMs: briefStartMs(timeline.tracks, payload.playheadMs), lanes: {} },
        updatedAt: now(),
      })
      .where(and(eq(videoBriefs.id, row.id), eq(videoBriefs.status, "draft")))
      .returning()
    // The template's own intro and outro go on the video, where an export
    // finds them before the project's (part 11). None leaves the project's.
    if (updated[0] && fields && (fields.introMediaId || fields.outroMediaId)) {
      await tx
        .update(videoProjectVideos)
        .set({ introMediaId: fields.introMediaId, outroMediaId: fields.outroMediaId })
        .where(eq(videoProjectVideos.id, video.id))
    }
    return updated
  })
  if (!started) throw new Error(BRIEF_BUSY_MESSAGE)
  return (await serializeBriefs([started]))[0]
}

/**
 * Try again on the scene that failed. It starts from what it is missing, so
 * a picture made before its voice failed is not paid for twice, and the
 * scenes after it carry on behind it.
 */
export async function retryBriefScene(
  userId: string,
  payload: { briefId: string; sceneId: string }
) {
  const row = await ownedBrief(userId, payload.briefId)
  const failed = row.scenes.find((scene) => scene.id === payload.sceneId)
  if (row.status !== "stopped" || failed?.state !== "failed") {
    throw new Error(BRIEF_NOTHING_TO_RETRY_MESSAGE)
  }
  await requireBriefKeys(row.voice)
  await requireVideoBudget(
    userId,
    row.videoId,
    row.scenes
      .filter((scene) => scene.state === "failed" || scene.state === "queued")
      .reduce((sum, scene) => sum + sceneLeftCents(scene, row.voice, row.pictureModel), 0)
  )
  const scenes = row.scenes.map(
    (scene): StoredScene =>
      scene.id === failed.id ? { ...scene, state: "queued", error: undefined } : scene
  )
  const [retried] = await db
    .update(videoBriefs)
    .set({ scenes, status: "making", updatedAt: now() })
    .where(and(eq(videoBriefs.id, row.id), eq(videoBriefs.status, "stopped")))
    .returning()
  if (!retried) throw new Error(BRIEF_NOTHING_TO_RETRY_MESSAGE)
  return (await serializeBriefs([retried]))[0]
}

/** The picture shape for a video: its own, or the nearer of the two a model makes. */
function sceneAspect(videoAspect: string): AssetAspectRatio {
  return projectClipAspect(videoAspect) ?? (videoAspect === "4:3" ? "16:9" : "9:16")
}

/**
 * One scene's still: the direction in the project's look, with no actor. A
 * scene's picture made again on the timeline comes here too
 * (`regenerate-a-scene.md`).
 */
export async function makeScenePicture(
  userId: string,
  spend: Required<SpendTag>,
  recipe: { prompt: string; model: GeminiImageModelId; aspectRatio: AssetAspectRatio },
  /**
   * What a template adds (templates.md): the actor's pictures for a scene
   * that shows them, and its reference pictures. How the pictures look is
   * the project's look, and whatever the Instructions tell the writer to put
   * in each scene's direction. A brief from the old window, and Make it again on
   * the timeline, send none.
   */
  extra?: TemplatePictureExtra
) {
  const look = await readProjectLook(userId, spend.projectId)
  const actor = extra?.actorPictures.length
    ? ` The person in this scene is the one in the first ${extra.actorPictures.length === 1 ? "picture" : `${extra.actorPictures.length} pictures`} supplied: keep their face, hair and build exactly.`
    : ""
  const references = extra?.referencePictures.length
    ? ` The ${extra.referencePictures.length === 1 ? "picture" : "pictures"} after those show the kind of shot this video uses: follow their framing and feel, never copy what is in them.`
    : ""
  const image = await generateImage({
    userId,
    model: recipe.model,
    aspectRatio: recipe.aspectRatio,
    spend,
    ...withLook(
      look,
      `Create one still picture for a scene of a short video, filling the whole frame. Direction: ${recipe.prompt}.${actor}${references} No text, captions, signs, labels or lettering anywhere in the picture.`,
      [...(extra?.actorPictures ?? []), ...(extra?.referencePictures ?? [])]
    ),
  })
  const media = await saveGeneratedAsset({
    userId,
    ...image,
    fileType: "image",
    name: assetName(sceneName(recipe.prompt), "Scene"),
  })
  const origin: ScenePictureOrigin = {
    tool: "brief",
    model: recipe.model,
    prompt: recipe.prompt,
    aspectRatio: recipe.aspectRatio,
  }
  return { media, origin }
}

/** Makes a scene's picture again where it sits on the timeline. */
export async function remakeScenePicture(
  userId: string,
  video: { id: string; projectId: string },
  origin: ScenePictureOrigin,
  change: { prompt: string; model: GeminiImageModelId }
) {
  await requireVideoBudget(userId, video.id, scenePictureCents(change.model))
  const made = await makeScenePicture(userId, { projectId: video.projectId, videoId: video.id }, {
    prompt: change.prompt,
    model: change.model,
    aspectRatio: origin.aspectRatio,
  })
  await attachPastedMediaToProject(userId, video.projectId, [made.media.id])
  const [image] = await serializeVideoMedia([made.media])
  return { image, origin: made.origin }
}

type MediaRow = typeof customShellMedia.$inferSelect

export type TemplatePictureExtra = {
  actorPictures: MediaRow[]
  referencePictures: MediaRow[]
}

/** The most reference pictures sent with one scene, so a picture's price stays near the one shown. */
const REFERENCE_PICTURES_SENT = 3

/**
 * The template's style, actor pictures and reference pictures, read once for
 * a brief. A file deleted since is left out rather than failing the brief.
 */
async function pictureExtras(userId: string, fields: TemplateFields | undefined) {
  if (!fields) return null
  const owned = async (mediaId: string) => {
    try {
      const media = await getOwnedMedia(userId, mediaId)
      return media.fileType === "image" ? media : null
    } catch {
      return null
    }
  }
  const referencePictures = (
    await Promise.all(
      fields.references
        .filter((ref) => ref.kind === "picture" && ref.mediaId)
        .slice(0, REFERENCE_PICTURES_SENT)
        .map((ref) => owned(ref.mediaId as string))
    )
  ).filter((media): media is MediaRow => !!media)
  let actorPictures: MediaRow[] = []
  if (fields.actorId) {
    try {
      const actors = await import("@/server/video/asset-factories/actors")
      const actor = await actors.requireOwnedActor(userId, fields.actorId)
      const sheet = (await actors.sheetLabels(userId, [actor.id])).get(actor.id) ?? []
      const mediaIds = [actor.imageMediaId, ...sheet.map((one) => one.mediaId).filter((id) => id !== actor.imageMediaId)].slice(0, 3)
      const ids = await actors.sheetPictureIdsFor(userId, actor, mediaIds)
      actorPictures = (await actors.sheetPicturesToSend(userId, actor, ids)).slice(0, 3)
    } catch (error) {
      console.error("A template's actor could not be read for a brief", error)
    }
  }
  return { actorPictures, referencePictures }
}

function sceneExtra(extras: Awaited<ReturnType<typeof pictureExtras>>, scene: StoredScene) {
  if (!extras) return undefined
  return {
    actorPictures: scene.person ? extras.actorPictures : [],
    referencePictures: extras.referencePictures,
  }
}

type ClaimedBrief = VideoBriefRow & { leaseToken: string }

/**
 * Changes one scene under the job's lease, reading the row fresh with it
 * locked, so a scene the editor placed meanwhile stays placed. Renews the
 * lease. False when the lease was lost.
 */
async function saveScene(
  job: ClaimedBrief,
  sceneId: string,
  change: (scene: StoredScene) => StoredScene,
  status?: BriefStatus
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(videoBriefs)
      .where(and(eq(videoBriefs.id, job.id), eq(videoBriefs.leaseToken, job.leaseToken)))
      .for("update")
    if (!row) return false
    const at = now()
    await tx
      .update(videoBriefs)
      .set({
        scenes: row.scenes.map((scene) => (scene.id === sceneId ? change(scene) : scene)),
        ...(status ? { status } : {}),
        leaseExpiresAt: new Date(at.getTime() + LEASE_MS),
        updatedAt: at,
      })
      .where(eq(videoBriefs.id, job.id))
    return true
  })
}

async function releaseBrief(job: ClaimedBrief) {
  await db
    .update(videoBriefs)
    .set({ leaseToken: null, leaseExpiresAt: null })
    .where(and(eq(videoBriefs.id, job.id), eq(videoBriefs.leaseToken, job.leaseToken)))
}

/**
 * Makes one scene: its still, kept the moment it exists, then its words read
 * aloud. Each is held to the video's spend limit first.
 */
async function makeScene(
  job: ClaimedBrief,
  scene: StoredScene,
  aspectRatio: AssetAspectRatio,
  extras: Awaited<ReturnType<typeof pictureExtras>>
) {
  let still = scene.still
  if (!still) {
    await requireVideoBudget(job.userId, job.videoId, sceneLeftCents(scene, job.voice, job.pictureModel))
    const made = await makeScenePicture(
      job.userId,
      { projectId: job.projectId, videoId: job.videoId },
      {
        prompt: scene.picture,
        model: job.pictureModel as GeminiImageModelId,
        aspectRatio,
      },
      sceneExtra(extras, scene)
    )
    still = { mediaId: made.media.id, name: made.media.originalName, origin: made.origin }
    const kept = still
    if (!(await saveScene(job, scene.id, (current) => ({ ...current, still: kept })))) return false
  }
  await requireVideoBudget(job.userId, job.videoId, sceneLeftCents({ ...scene, still }, job.voice, job.pictureModel))
  const read = {
    voiceId: job.voice.id,
    voiceName: job.voice.name,
    modelId: job.voice.modelId,
    text: scene.words,
    settings: job.voice.settings,
  }
  const said = await speak({
    userId: job.userId,
    ...read,
    speaker: job.voice.speaker,
    spend: { projectId: job.projectId, videoId: job.videoId },
  })
  const voice = {
    mediaId: said.mediaId,
    name: said.name,
    durationMs: said.durationMs,
    captions: said.captions,
    origin: voiceOrigin("brief-voice", read),
  }
  return saveScene(job, scene.id, (current) => ({ ...current, still, voice, state: "made" }))
}

/**
 * Makes a claimed brief's waiting scenes in order. The first failure stops
 * the brief there: the scene says why and offers Try again, the scenes
 * before it still land, and the ones after it wait. Nothing is charged for
 * a call that failed.
 */
async function makeBrief(job: ClaimedBrief) {
  try {
    const video = await getOwnedVideo(job.userId, job.videoId)
    const aspectRatio = sceneAspect(video.aspect)
    const fields = readTemplateSnapshot(job.template)?.fields
    if (fields && !(await prepareMusic(job, fields))) return
    const extras = await pictureExtras(job.userId, fields)
    for (const [index, scene] of job.scenes.entries()) {
      if (scene.state !== "queued") continue
      try {
        if (!(await makeScene(job, scene, aspectRatio, extras))) return
      } catch (error) {
        const message = readableMessage(error)
        await saveScene(job, scene.id, (current) => ({ ...current, state: "failed", error: message }), "stopped")
        await ringBell(job.userId, `Scene ${index + 1} of ${job.title} failed`, message)
        return
      }
    }
  } finally {
    await releaseBrief(job)
  }
}

/** About how long a brief's video runs, for music made before its voices are. */
function estimatedRunMs(scenes: StoredScene[]) {
  return scenes.reduce((sum, scene) => sum + (scene.voice?.durationMs ?? scene.seconds * 1000) + BRIEF_BREATH_MS, 0)
}

/**
 * The template's music, made or measured once before the first scene, and
 * kept on the brief's landing so it goes under the video with the last scene
 * (part 11). Music that can't be had is said on the storyboard and the
 * scenes carry on without it. False when the lease was lost.
 */
async function prepareMusic(job: ClaimedBrief, fields: TemplateFields) {
  const landing = job.landing
  if (!landing || fields.music.kind === "none" || landing.music || landing.musicError) return true
  let music: BriefMusic | null = null
  let musicError: string | null = null
  try {
    if (fields.music.kind === "track") {
      const media = await getOwnedMedia(job.userId, fields.music.mediaId)
      const object = await getFromR2(media.storagePath)
      const bytes = await object.Body?.transformToByteArray()
      const durationMs = bytes?.byteLength ? await soundDurationMs(bytes, 30 * 60_000) : 0
      if (!durationMs) throw new Error("The template's music track could not be read.")
      music = { mediaId: media.id, name: media.originalName, durationMs }
    } else {
      const { makeAiMusic } = await import("@/server/video/ai-music")
      const made = await makeAiMusic({
        userId: job.userId,
        videoId: job.videoId,
        mood: fields.music.mood,
        forMs: estimatedRunMs(job.scenes) + 1_000,
      })
      music = { mediaId: made.media.id, name: made.media.original_name, durationMs: made.lengthMs }
      await attachPastedMediaToProject(job.userId, job.projectId, [made.media.id])
    }
  } catch (error) {
    musicError = readableMessage(error)
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(videoBriefs)
      .where(and(eq(videoBriefs.id, job.id), eq(videoBriefs.leaseToken, job.leaseToken)))
      .for("update")
    if (!row?.landing) return false
    const next: BriefLanding = music ? { ...row.landing, music } : { ...row.landing, musicError: musicError ?? undefined }
    await tx.update(videoBriefs).set({ landing: next, updatedAt: now() }).where(eq(videoBriefs.id, job.id))
    job.landing = next
    return true
  })
}

/** Rings the owner's bell (part 36). The brief carries on either way; the bell is a nicety. */
async function ringBell(userId: string, message: string, detail: string) {
  try {
    await db.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: userId,
      type: "app_activity",
      message: message.slice(0, 300),
      detail: detail.slice(0, 500),
      createdAt: now(),
    })
    await publishNotificationCreated(userId, db)
  } catch (error) {
    console.error("A brief's notice could not be written", error)
  }
}

async function claimBrief(): Promise<ClaimedBrief | null> {
  const timestamp = now()
  const available = or(isNull(videoBriefs.leaseToken), lt(videoBriefs.leaseExpiresAt, timestamp))
  const waiting = sql`${videoBriefs.scenes} @> '[{"state":"queued"}]'::jsonb`
  const [candidate] = await db
    .select({ id: videoBriefs.id })
    .from(videoBriefs)
    .where(and(eq(videoBriefs.status, "making"), available, waiting))
    .orderBy(asc(videoBriefs.updatedAt))
    .limit(1)
  if (!candidate) return null
  const leaseToken = uuid()
  const [claimed] = await db
    .update(videoBriefs)
    .set({ leaseToken, leaseExpiresAt: new Date(timestamp.getTime() + LEASE_MS) })
    .where(and(eq(videoBriefs.id, candidate.id), eq(videoBriefs.status, "making"), available))
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

/** What a brief's status becomes once these scenes are on the timeline. */
function statusAfter(row: VideoBriefRow, scenes: StoredScene[]): BriefStatus {
  return scenes.every((scene) => scene.state === "placed") ? "done" : row.status
}

/**
 * Records that the open editor has laid these scenes, with the lanes they
 * went on, and puts their files on the project's Media panel. Only one of
 * the editor and the worker lands a scene: `settled` is false when one of
 * them is no longer waiting, and then the editor lays nothing.
 */
export async function settleBriefScenes(
  userId: string,
  payload: {
    briefId: string
    sceneIds: string[]
    lanes: BriefLanding["lanes"]
    /** The lane the music went on, when this landing laid it. */
    musicLane?: string
  }
) {
  const settled = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(videoBriefs)
      .where(and(eq(videoBriefs.id, payload.briefId), eq(videoBriefs.userId, userId)))
      .for("update")
    if (!row?.landing) throw new Error(BRIEF_NOT_FOUND_MESSAGE)
    const landing = new Set(payload.sceneIds)
    const waiting = row.scenes.filter((scene) => landing.has(scene.id) && scene.state === "made")
    if (!payload.sceneIds.length || waiting.length !== landing.size) return false
    const scenes = row.scenes.map((scene): StoredScene =>
      landing.has(scene.id) ? { ...scene, state: "placed" } : scene
    )
    await tx
      .update(videoBriefs)
      .set({
        scenes,
        landing: {
          ...row.landing,
          lanes: payload.lanes,
          ...(row.landing.music && payload.musicLane
            ? { music: { ...row.landing.music, laid: true, lane: payload.musicLane } }
            : {}),
        },
        status: statusAfter(row, scenes),
        updatedAt: now(),
      })
      .where(eq(videoBriefs.id, row.id))
    await attachPastedMediaToProject(userId, row.projectId, sceneFiles(waiting), tx)
    return true
  })
  return { settled }
}

function sceneFiles(scenes: StoredScene[]) {
  return scenes.flatMap((scene) => [scene.still?.mediaId, scene.voice?.mediaId].filter((id) => !!id)) as string[]
}

/**
 * Lands a brief's made scenes with nobody editing the video: lays them and
 * saves the video in the same step that marks them placed. A save that
 * meets a newer version rolls the whole step back, and the next pass tries
 * again.
 */
async function landBriefNow(briefId: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(videoBriefs).where(eq(videoBriefs.id, briefId)).for("update")
    if (!row?.landing) return
    const video = await getOwnedVideo(row.userId, row.videoId, tx)
    const { timeline } = parseTimelineForReset(video.timeline)
    const captions = templateCaptions(
      readTemplateSnapshot(row.template)?.fields,
      await getCaptionSettings(tx),
      timeline.aspect
    )
    const landed = landBriefScenes(
      timeline.tracks,
      { scenes: row.scenes, landing: row.landing },
      uuid,
      captions
    )
    if (!landed) {
      console.error("A brief's scenes have no lane left to land on", row.id)
      return
    }
    if (!landed.placed.length) return
    const placed = new Set(landed.placed)
    const scenes = row.scenes.map((scene): StoredScene =>
      placed.has(scene.id) ? { ...scene, state: "placed" } : scene
    )
    await writeVideoTimeline(
      row.userId,
      video.id,
      { ...timeline, tracks: landed.tracks },
      video.version,
      tx
    )
    await tx
      .update(videoBriefs)
      .set({ scenes, landing: landed.landing, status: statusAfter(row, scenes), updatedAt: now() })
      .where(eq(videoBriefs.id, row.id))
    await attachPastedMediaToProject(
      row.userId,
      row.projectId,
      sceneFiles(row.scenes.filter((scene) => placed.has(scene.id))),
      tx
    )
  })
}

/**
 * The briefs with made scenes waiting and no window editing their video. A
 * video a window is editing is passed over, because that editor lands the
 * scenes itself.
 */
async function briefsToLand() {
  const editing = db
    .select({ windowId: videoEditorWindows.windowId })
    .from(videoEditorWindows)
    .where(
      and(
        eq(videoEditorWindows.videoId, videoBriefs.videoId),
        eq(videoEditorWindows.mode, "edit"),
        gte(videoEditorWindows.seenAt, new Date(now().getTime() - EDITOR_WINDOW_GONE_AFTER_MS))
      )
    )
  return db
    .select({ id: videoBriefs.id })
    .from(videoBriefs)
    .where(
      and(
        inArray(videoBriefs.status, ["making", "stopped"]),
        sql`${videoBriefs.scenes} @> '[{"state":"made"}]'::jsonb`,
        notExists(editing)
      )
    )
    .orderBy(asc(videoBriefs.updatedAt))
    .limit(LANDINGS_PER_PASS)
}

/**
 * One worker pass: makes the waiting scenes of up to three briefs side by
 * side, then lands made scenes for every project nobody is editing.
 */
export async function briefTick() {
  const claimed: ClaimedBrief[] = []
  for (let count = 0; count < BRIEFS_PER_PASS; count += 1) {
    const job = await claimBrief()
    if (!job) break
    claimed.push(job)
  }
  await Promise.all(
    claimed.map((job) =>
      makeBrief(job).catch((error) => {
        console.error("A brief's scenes could not be made", error)
      })
    )
  )
  for (const brief of await briefsToLand()) {
    try {
      await landBriefNow(brief.id)
    } catch (error) {
      // One project's save failing must not hold up the others. A clash
      // with a save made meanwhile is tried again on the next pass.
      console.error("A brief's scenes could not land yet", error)
    }
  }
  await finishBriefs()
}

// ================================================== Made from a template ==

/**
 * The voice a template reads with: its own, or the usual voice saved with
 * "Make this the usual voice" in the Voice window (part 6).
 */
export async function templateVoice(fields: TemplateFields): Promise<BriefVoice> {
  if (fields.voice) return fields.voice
  const usual = await getVoiceDefaults()
  if (!usual) throw new Error(TEMPLATE_NO_VOICE_MESSAGE)
  return {
    id: usual.voiceId,
    name: usual.voiceName || "Usual voice",
    speaker: usual.speaker ?? "elevenlabs",
    modelId: usual.modelId,
    settings: rememberedVoiceSettings(usual) ?? createDefaultVoiceSettings(),
  }
}

function templateBlock(name: string, fields: TemplateFields, notes: string) {
  const references = notes
    ? `\n\nReference videos to learn the format from: their shape, pace and kinds of shot, never their subject.\n${notes}`
    : ""
  return `The template, "${name}", which every video of this kind follows:
${fields.instructions.trim() || "No instructions were written; make a clear, well paced video."}${references}`
}

const PICTURE_RULES = `- One sentence each, describing what is seen: the subject, the place, the light and the framing.
- Never what is said, and never any text, caption, sign, label or lettering in the picture.
- Each scene's picture is a different shot from the one before it.`

function personLine(fields: TemplateFields) {
  return fields.actorId
    ? `\n- The same one person appears throughout these videos. For each scene, "person" is true when the picture shows them and false when it shows something else, so most videos mix both.`
    : ""
}

/** Puts the value where its token stands, or adds it under its own heading when the person took the token out. */
function fillToken(body: string, token: string, value: string, heading: string) {
  return body.includes(token) ? body.split(token).join(value) : `${body.trimEnd()}\n\n${heading}\n${value}`
}

/**
 * The app's own Instructions (part 25): what the writer is told about a
 * pasted script the app has already cut into scenes, built from the
 * template's description, audience and reference videos, with
 * {{scenes}} where the scenes go. The Instructions card starts on this; once
 * the person rewrites it, theirs is sent instead (templates.md). The answer's
 * format is never part of it.
 */
export function templatePicturesBody(template: { name: string; fields: TemplateFields }, notes: string) {
  const { fields } = template
  const platform = platformFor(fields.platform)
  return `Write the picture directions for a ${platform.label} video made from somebody's own script. The script is already cut into scenes. Each scene is one still picture on screen while its words are read aloud. Do not change, add or drop any words.

${templateBlock(template.name, fields, notes)}

Who it is for: ${fields.audience || "anyone interested in the subject"}

The scenes, in order:
${SCENES_TOKEN}

The picture directions:
${PICTURE_RULES}
- A scene whose picture was already chosen gets that picture back word for word.${personLine(fields)}`
}

/**
 * A pasted script (part 25): the app has already cut it into scenes, so the
 * writer keeps every word and only names the script and writes each scene's
 * picture. A scene the person gave a picture note keeps theirs. The Script
 * template, the template's or the person's own, gets the scenes, then the
 * answer's format, which the app always adds.
 */
export function templatePicturesPrompt(
  template: { name: string; fields: TemplateFields },
  scenes: { words: string; picture: string | null }[],
  notes: string
) {
  const { fields } = template
  const list = scenes
    .map(
      (scene, index) =>
        `${index + 1}. ${JSON.stringify(scene.words)}${scene.picture ? ` (picture already chosen: ${JSON.stringify(scene.picture)})` : ""}`
    )
    .join("\n")
  const person = fields.actorId ? `, "person": false` : ""
  const body = fields.scriptPrompt?.trim() || templatePicturesBody(template, notes)
  return `${fillToken(body, SCENES_TOKEN, list, "The scenes, in order:")}

Answer with JSON only, in exactly this shape, and nothing else, with exactly ${scenes.length} scenes in the same order:
{
  "title": "a short name for the video, eight words at most",
  "scenes": [
    { "picture": "what the still picture shows"${person} }
  ]
}`
}

function picturesSchema(count: number) {
  return z.object({
    title: z.string().trim().min(1).max(120),
    scenes: z
      .array(
        z.object({
          picture: z.string().trim().min(1).max(SCENE_PICTURE_MAX),
          person: z.boolean().optional(),
        })
      )
      .length(count),
  })
}

/** What the writer is sent for this template and script, before anything is paid for. */
async function scriptAsk(
  userId: string,
  template: { name: string; fields: TemplateFields },
  text: string,
  speed: number
) {
  const { notes } = await referenceNotes(userId, template.fields)
  const scenes = scriptScenes(text, paceRange(template.fields.pace, template.fields.platform), speed)
  if (!scenes.length) throw new Error(TEMPLATE_NO_SCRIPT_MESSAGE)
  if (scenes.length > BRIEF_SCENES_MAX) throw new Error(tooManyScenesMessage(scenes.length, BRIEF_SCENES_MAX))
  return { prompt: templatePicturesPrompt(template, scenes, notes), scenes }
}

/** The script, as scenes, written from a template and what was typed. */
async function writeTemplateScript(
  userId: string,
  template: { name: string; fields: TemplateFields },
  text: string,
  voice: BriefVoice,
  spend: SpendTag
): Promise<BriefScript> {
  const ask = await scriptAsk(userId, template, text, voice.settings.speed)
  const metadata = { ...spend, lengthSeconds: template.fields.lengthSeconds, template: template.name }
  const scenes = ask.scenes
  const write = () =>
    askWriter({
      userId,
      feature: BRIEF_SCRIPT_FEATURE,
      metadata,
      prompt: ask.prompt,
      schema: picturesSchema(scenes.length),
      label: BRIEF_SCRIPT_LABEL,
      timeoutMs: 180_000,
    })
  // A malformed answer (empty, not JSON, or the wrong shape) is asked again
  // once; a missing key or a refusal fails straight away.
  const answer = await write().catch((error: unknown) => {
    if (!isMalformed(error)) throw error
    return write()
  })
  return {
    title: answer.title,
    hook: sentencesOf(scenes[0].words)[0] ?? scenes[0].words,
    scenes: scenes.map((scene, index) => ({
      words: scene.words,
      picture: scene.picture ?? answer.scenes[index].picture,
      seconds: Math.max(1, readingSeconds(scene.words, voice.settings.speed)),
      ...(template.fields.actorId && answer.scenes[index].person ? { person: true } : {}),
    })),
  }
}

/** What writing the scenes and checking them costs, before the press. */
export async function templateScriptCents(fields: TemplateFields, text: string) {
  const writer = pickWriter(await getAiDefaults(), await getAiKeysSaved())
  return templateScriptCostCents(writer?.id ?? null, fields, text)
}

/**
 * Generate video (parts 25 to 31): the video's own copy of its template's
 * settings and the script in the script box become a storyboard, checked
 * against the script check's rules. Nothing is made for the scenes yet; Make it on the storyboard does
 * that, as it always has.
 */
export async function writeTemplateBrief(
  userId: string,
  payload: { videoId: string; text: string }
): Promise<BriefItem> {
  const text = payload.text.trim()
  if (!text) throw new Error(TEMPLATE_NO_SCRIPT_MESSAGE)
  const { video, row, fields } = await templateForVideo(userId, payload.videoId)
  const voice = await templateVoice(fields)
  await requireVideoBudget(userId, video.id, await templateScriptCents(fields, text))
  const spend = videoSpendMetadata(video)
  const template = { name: row.name, fields }
  const script = await writeTemplateScript(userId, template, text, voice, spend)
  const scenes = script.scenes.map((draft) => newScene(draft, uuid()))
  const words = storyboardScript(scenes)

  let check: ScriptCheck | null = null
  let checkError: string | null = null
  try {
    check = await checkScript({ userId, script: words, speed: voice.settings.speed, spend })
  } catch (error) {
    checkError = readableMessage(error)
  }

  const at = now()
  const [saved] = await db
    .insert(videoBriefs)
    .values({
      id: uuid(),
      userId,
      projectId: video.projectId,
      videoId: video.id,
      about: words.slice(0, TEMPLATE_IDEA_MAX),
      audience: fields.audience,
      lengthSeconds: Math.max(1, Math.round(totalSeconds(scenes))),
      platform: fields.platform,
      voice,
      pictureModel: fields.pictureModel,
      title: script.title,
      hook: script.hook,
      scenes,
      check,
      checkError,
      status: "draft",
      templateId: row.id,
      template,
      source: { kind: "script", text },
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return (await serializeBriefs([saved]))[0]
}

/**
 * The app's own Instructions for this template, or for the open video's copy
 * of it, with {{scenes}} where the script goes, for the Instructions card to
 * start on. The person's own rewrite, when there is one, is on the settings
 * themselves. Building it costs nothing.
 */
export async function templatePromptPreview(userId: string, payload: { templateId: string; videoId?: string }) {
  const row = await ownedTemplate(userId, payload.templateId)
  let fields = readTemplateFields(row.fields)
  if (payload.videoId) {
    const forVideo = await templateForVideo(userId, payload.videoId).catch(() => null)
    if (forVideo?.row.id === row.id) fields = forVideo.fields
  }
  const template = { name: row.name, fields }
  const references = await referenceNotes(userId, fields)
  return {
    scriptDefault: templatePicturesBody(template, references.notes),
    waiting: references.waiting,
  }
}

/**
 * Try a template for about a cent (part 32): a sample script runs to the
 * storyboard only. Nothing is saved, and only the writing is paid for, on
 * the open video's spend line.
 */
export async function tryTemplate(
  userId: string,
  payload: { templateId: string; videoId: string; script: string }
) {
  const row = await ownedTemplate(userId, payload.templateId)
  const fields = readTemplateFields(row.fields)
  const script = payload.script.trim()
  if (!script) throw new Error(TEMPLATE_NO_SCRIPT_MESSAGE)
  const video = await getOwnedVideo(userId, payload.videoId)
  await requireVideoBudget(userId, video.id, await templateScriptCents(fields, script))
  // A template with no voice and no usual voice can still be tried; the
  // price then assumes ElevenLabs' standard voice.
  const voice = await templateVoice(fields).catch(() => SAMPLE_VOICE)
  const written = await writeTemplateScript(userId, { name: row.name, fields }, script, voice, videoSpendMetadata(video))
  return {
    title: written.title,
    scenes: written.scenes,
    cents: makingCents(written.scenes, voice, fields.pictureModel, fields).total,
  }
}

const SAMPLE_VOICE: BriefVoice = {
  id: "sample",
  name: "Sample",
  speaker: "elevenlabs",
  modelId: "eleven_multilingual_v2",
  settings: createDefaultVoiceSettings(),
}

/**
 * Redo changed scenes only (part 35): after the video is made, each scene
 * whose words were edited is read again with the brief's voice. Its picture
 * stays. The editor then swaps the new readings in where the old ones sit
 * and moves the later scenes along, as one Undo step.
 */
export async function remakeChangedScenes(
  userId: string,
  payload: { briefId: string; scenes: { id: string; words: string }[] }
) {
  const row = await ownedBrief(userId, payload.briefId)
  if (row.status !== "done" || !row.landing) {
    throw new Error("Only a video whose scenes are all on the timeline can have scenes made again.")
  }
  const edits = new Map(payload.scenes.map((scene) => [scene.id, scene.words.trim()]))
  const changed = row.scenes.filter((scene) => {
    const words = edits.get(scene.id)
    return words && words !== scene.words && scene.voice && scene.still
  })
  if (!changed.length) throw new Error("Nothing changed: edit a scene's words first.")
  await requireBriefKeys(row.voice)
  await requireVideoBudget(
    userId,
    row.videoId,
    changed.reduce((sum, scene) => sum + sceneVoiceCents(row.voice, edits.get(scene.id) ?? ""), 0)
  )
  const remade: { sceneId: string; oldVoiceMediaId: string; stillMediaId: string; voice: NonNullable<StoredScene["voice"]> }[] = []
  for (const scene of changed) {
    const read = {
      voiceId: row.voice.id,
      voiceName: row.voice.name,
      modelId: row.voice.modelId,
      text: edits.get(scene.id) as string,
      settings: row.voice.settings,
    }
    const said = await speak({
      userId,
      ...read,
      speaker: row.voice.speaker,
      spend: { projectId: row.projectId, videoId: row.videoId },
    })
    remade.push({
      sceneId: scene.id,
      oldVoiceMediaId: scene.voice?.mediaId as string,
      stillMediaId: scene.still?.mediaId as string,
      voice: {
        mediaId: said.mediaId,
        name: said.name,
        durationMs: said.durationMs,
        captions: said.captions,
        origin: voiceOrigin("brief-voice", read),
      },
    })
  }
  const byScene = new Map(remade.map((one) => [one.sceneId, one]))
  const [saved] = await db
    .update(videoBriefs)
    .set({
      scenes: row.scenes.map((scene) => {
        const one = byScene.get(scene.id)
        return one
          ? { ...scene, words: edits.get(scene.id) as string, seconds: Math.max(1, Math.round(one.voice.durationMs / 1000)), voice: one.voice }
          : scene
      }),
      updatedAt: now(),
    })
    .where(eq(videoBriefs.id, row.id))
    .returning()
  await attachPastedMediaToProject(userId, row.projectId, remade.map((one) => one.voice.mediaId))
  const [brief] = await serializeBriefs([saved])
  const urls = new Map(brief.scenes.map((scene) => [scene.id, scene.voice?.url]))
  return {
    brief,
    changed: remade.map((one) => ({ ...one, voice: { ...one.voice, url: urls.get(one.sceneId) } })),
  }
}

// ------------------------------------------- Once the last scene lands ------

/**
 * A template's brief whose scenes are all down gets its finishing steps,
 * once: the video's status, the language copies, and the bell (parts 12,
 * 14 and 36). The finish row is claimed first, so two workers never do it
 * twice.
 */
async function finishBriefs() {
  const waiting = await db
    .select({ id: videoBriefs.id })
    .from(videoBriefs)
    .where(and(eq(videoBriefs.status, "done"), isNull(videoBriefs.finish), sql`${videoBriefs.template} is not null`))
    .orderBy(asc(videoBriefs.updatedAt))
    .limit(LANDINGS_PER_PASS)
  for (const candidate of waiting) {
    const running: BriefFinish = { state: "running", languages: [], at: now().toISOString() }
    const [row] = await db
      .update(videoBriefs)
      .set({ finish: running })
      .where(and(eq(videoBriefs.id, candidate.id), isNull(videoBriefs.finish)))
      .returning()
    if (!row) continue
    try {
      await finishBrief(row)
    } catch (error) {
      console.error("A brief's finishing steps failed", error)
    }
  }
}

async function finishBrief(row: VideoBriefRow) {
  const snapshot = readTemplateSnapshot(row.template)
  const fields = snapshot?.fields
  const languages: BriefFinish["languages"] = []
  for (const language of fields?.languages ?? []) {
    try {
      languages.push({ language, videoId: await makeLanguageBrief(row, language) })
    } catch (error) {
      languages.push({ language, error: readableMessage(error) })
    }
  }
  const finish: BriefFinish = { state: "done", languages, at: now().toISOString() }
  await db.update(videoBriefs).set({ finish }).where(eq(videoBriefs.id, row.id))
  const started = languages.filter((one) => one.videoId).map((one) => one.language)
  const failed = languages.filter((one) => one.error).map((one) => one.language)
  await ringBell(
    row.userId,
    `${row.title} is made`,
    [
      snapshot ? `Made with the ${snapshot.name} template.` : "",
      started.length ? `Copies in ${started.join(", ")} are being made.` : "",
      failed.length ? `${failed.join(", ")} could not be started.` : "",
    ]
      .filter(Boolean)
      .join(" ")
  )
}

/**
 * One language copy of a template's video (part 12): a new video in the same
 * project, "My Short (Spanish)", with every scene's words translated and
 * read again, the same pictures and the same music. It is a brief of its
 * own, made by this same worker, so it lands, rings and can be tried again
 * like any other. It asks for no copies of its own.
 */
async function makeLanguageBrief(row: VideoBriefRow, language: TranslateLanguage) {
  const snapshot = readTemplateSnapshot(row.template)
  if (!snapshot || !row.landing) throw new Error("This brief has nothing to copy.")
  const video = await getOwnedVideo(row.userId, row.videoId)
  const sentences = row.scenes.map((scene) => sentencesOf(scene.words))
  const { translateLines } = await import("@/server/video/translate")
  const translated = await translateLines({
    userId: row.userId,
    language,
    lines: sentences.flat(),
    spend: { projectId: row.projectId, videoId: row.videoId },
  })
  let at = 0
  const words = sentences.map((list) => {
    const said = translated.slice(at, at + list.length).join(" ")
    at += list.length
    return said
  })
  return db.transaction(async (tx) => {
    const copy = await insertVideo(
      row.userId,
      row.projectId,
      {
        name: languageCopyName(video.name, language),
        aspect: video.aspect as AspectRatio,
        languageOf: video.languageOf ?? video.id,
        language,
      },
      tx
    )
    const stamp = now()
    const music = row.landing?.music
    await tx.insert(videoBriefs).values({
      id: uuid(),
      userId: row.userId,
      projectId: row.projectId,
      videoId: copy.id,
      about: row.about,
      audience: row.audience,
      lengthSeconds: row.lengthSeconds,
      platform: row.platform,
      voice: row.voice,
      pictureModel: row.pictureModel,
      title: `${row.title} (${language})`.slice(0, 120),
      hook: sentencesOf(words[0] ?? "")[0] ?? words[0] ?? row.hook,
      scenes: row.scenes.map(
        (scene, index): StoredScene => ({
          id: uuid(),
          words: words[index] || scene.words,
          picture: scene.picture,
          seconds: scene.seconds,
          ...(scene.person ? { person: true } : {}),
          // The picture is already made; only the voice is new.
          ...(scene.still ? { still: scene.still } : {}),
          state: "queued",
        })
      ),
      status: "making",
      landing: {
        startMs: 0,
        lanes: {},
        ...(music ? { music: { mediaId: music.mediaId, name: music.name, durationMs: music.durationMs } } : {}),
      },
      templateId: row.templateId,
      template: { name: snapshot.name, fields: { ...snapshot.fields, languages: [], music: music ? snapshot.fields.music : { kind: "none" } } },
      source: row.source,
      createdAt: stamp,
      updatedAt: stamp,
    })
    return copy.id
  })
}
