import { and, asc, desc, eq, gte, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm"

import { briefScriptCostCents } from "@/lib/video/ai-estimates"
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
  briefScriptSchema,
  briefStartMs,
  landBriefScenes,
  lengthIsClose,
  newScene,
  platformFor,
  sceneLeftCents,
  scenePictureCents,
  storyboardCents,
  storyboardScript,
  totalSeconds,
  wordsFor,
  type BriefLanding,
  type BriefRequest,
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
import { parseTimelineForReset } from "@/lib/video/timeline-schema"
import { withLook } from "@/lib/video/visual-style"
import { getAiKey } from "@/server/ai/keys"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { generateImage } from "@/server/video/asset-factories/images"
import { saveGeneratedAsset } from "@/server/video/asset-factories/media"
import { attachPastedMediaToProject, serializeVideoMedia } from "@/server/video/media-list"
import { readProjectLook } from "@/server/video/project-look"
import { projectSpendMetadata, requireProjectBudget } from "@/server/video/project-spend"
import { getOwnedProject, writeProjectTimeline } from "@/server/video/projects"
import { videoBriefs, videoEditorWindows, type VideoBriefRow } from "@/server/video/schema"
import { checkScript } from "@/server/video/script-check"
import { getAiDefaults, getScriptBannedWords } from "@/server/video/settings"
import { speak } from "@/server/video/voice"
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
  about: string
  audience: string
  length_seconds: number
  platform: BriefRequest["platform"]
  voice: BriefRequest["voice"]
  picture_model: GeminiImageModelId
  title: string
  hook: string
  scenes: SceneWithFiles[]
  check: ScriptCheck | null
  check_error: string | null
  status: BriefStatus
  landing: BriefLanding | null
  created_at: string
}

/** The writer's instructions. Every rule is in plain words in the doc. */
export function briefPrompt(
  brief: Pick<BriefRequest, "about" | "audience" | "lengthSeconds" | "platform">,
  bannedWords: string[],
  shortfall?: { seconds: number }
) {
  const platform = platformFor(brief.platform)
  const words = wordsFor(brief.lengthSeconds)
  const sceneSeconds = platform.short ? "3 to 8" : "5 to 15"
  const shape = platform.short
    ? `- Foreshadow the payoff early, turn with a "but", then deliver it with a "then".\n`
    : ""
  const banned = bannedWords.length
    ? `\n- Never use these words, in any form: ${bannedWords.join(", ")}.`
    : ""
  const again = shortfall
    ? `\n\nYour last answer's scenes added up to ${Math.round(shortfall.seconds)} seconds, but the video must run ${brief.lengthSeconds} seconds. Write it again so the scenes add up to ${brief.lengthSeconds} seconds, which is about ${words} words in all.`
    : ""

  return `Write the script for a ${platform.label} video that runs ${brief.lengthSeconds} seconds, and cut it into scenes. Each scene is one still picture on screen while its words are read aloud.

What it is about: ${brief.about}
Who it is for: ${brief.audience || "anyone interested in the subject"}

Answer with JSON only, in exactly this shape, and nothing else:
{
  "title": "a short name for the video, eight words at most",
  "hook": "the opening line",
  "scenes": [
    { "words": "what the voice says in this scene", "picture": "what the still picture shows", "seconds": 4 }
  ]
}

The words:
- The first scene's words start with the hook, word for word. The hook's first sentence has four words or fewer before its first comma or full stop, and gives a reason to keep listening, such as "Your bread isn't dry."
- No greeting, and never announce the video: no "welcome to this video", "in this video", "hey guys" or "today we're going to".
${shape}- Every thirty seconds of speech, counted from the start, holds a question to the viewer or a promise of something still to come.
- Aim at 170 words a minute, so the scenes' seconds add up to ${brief.lengthSeconds}. That is about ${words} words in all.
- "seconds" is how long that scene's words take to say at 170 words a minute.
- Each scene runs ${sceneSeconds} seconds, and there are at most ${BRIEF_SCENES_MAX} scenes.
- Plain spoken words only: no markdown, no headings, no labels such as "Narrator:", no stage directions, no emojis.
- Write every number as words, so the voice says it right: "forty-two", "ten percent", "five dollars".${banned}

The picture directions:
- One sentence each, describing what is seen: the subject, the place, the light and the framing.
- Never what is said, and never any text, caption, sign, label or lettering in the picture.
- Each scene's picture is a different shot from the one before it.${again}`
}

/** A malformed answer is asked again once; anything else fails straight away. */
function isMalformed(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return /came back (empty|as something other than an answer|in an unexpected shape)/.test(message)
}

async function askForScript(userId: string, request: BriefRequest, prompt: string) {
  const ask = () =>
    askWriter({
      userId,
      feature: BRIEF_SCRIPT_FEATURE,
      metadata: {
        ...projectSpendMetadata(request.projectId),
        lengthSeconds: request.lengthSeconds,
      },
      prompt,
      schema: briefScriptSchema,
      label: BRIEF_SCRIPT_LABEL,
      timeoutMs: 180_000,
    })
  try {
    return await ask()
  } catch (error) {
    if (!isMalformed(error)) throw error
    return await ask()
  }
}

/**
 * Asks for the script. One whose scenes run more than a tenth away from the
 * asked length is asked for once more, with the shortfall named. The second
 * answer stands whatever its length, and the storyboard shows how long it
 * runs against the ask.
 */
export async function writeBriefScript(
  userId: string,
  request: BriefRequest
): Promise<BriefScript> {
  const bannedWords = await getScriptBannedWords()
  const first = await askForScript(userId, request, briefPrompt(request, bannedWords))
  const seconds = totalSeconds(first.scenes)
  if (lengthIsClose(seconds, request.lengthSeconds)) return first
  return askForScript(userId, request, briefPrompt(request, bannedWords, { seconds }))
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

/**
 * Writes a brief into a storyboard and keeps it. Nothing is made for the
 * scenes yet: the only spend is the script and its check, which the window
 * prices before the press.
 */
export async function writeBrief(userId: string, request: BriefRequest): Promise<BriefItem> {
  const project = await getOwnedProject(userId, request.projectId)
  const writer = pickWriter(await getAiDefaults(), await getAiKeysSaved())
  await requireProjectBudget(
    userId,
    project.id,
    writer
      ? briefScriptCostCents({
          writer: writer.id,
          lengthSeconds: request.lengthSeconds,
          briefCharacters: request.about.length + request.audience.length,
        })
      : 0
  )
  const script = await writeBriefScript(userId, request)
  const scenes = script.scenes.map((draft) => newScene(draft, uuid()))

  // The check is worth having, not worth losing the paid-for script over.
  let check: ScriptCheck | null = null
  let checkError: string | null = null
  try {
    check = await checkScript({
      userId,
      script: storyboardScript(scenes),
      speed: request.voice.settings.speed,
      projectId: project.id,
    })
  } catch (error) {
    checkError = readableMessage(error)
  }

  const at = now()
  const [row] = await db
    .insert(videoBriefs)
    .values({
      id: uuid(),
      userId,
      projectId: project.id,
      about: request.about,
      audience: request.audience,
      lengthSeconds: request.lengthSeconds,
      platform: request.platform,
      voice: request.voice,
      pictureModel: request.pictureModel,
      title: script.title,
      hook: script.hook,
      scenes,
      check,
      checkError,
      status: "draft",
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return (await serializeBriefs([row]))[0]
}

/** The files each scene has, at the addresses they play from today. */
async function serializeBriefs(rows: VideoBriefRow[]): Promise<BriefItem[]> {
  const mediaIds = rows.flatMap((row) =>
    row.scenes.flatMap((scene) => [scene.still?.mediaId, scene.voice?.mediaId].filter((id) => !!id))
  ) as string[]
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
    landing: row.landing,
    created_at: row.createdAt.toISOString(),
  }))
}

/** This project's briefs, newest first. Reading them costs nothing. */
export async function listBriefs(userId: string, projectId: string) {
  await getOwnedProject(userId, projectId)
  const rows = await db
    .select()
    .from(videoBriefs)
    .where(and(eq(videoBriefs.userId, userId), eq(videoBriefs.projectId, projectId)))
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
async function requireBriefKeys(voice: BriefRequest["voice"]) {
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
  const project = await getOwnedProject(userId, row.projectId)
  const { timeline } = parseTimelineForReset(project.timeline)
  const refusal = briefLaneRefusal(timeline.tracks)
  if (refusal) throw new Error(refusal)
  await requireBriefKeys(row.voice)
  await requireProjectBudget(
    userId,
    project.id,
    storyboardCents(scenes, row.voice, row.pictureModel)
  )
  const [started] = await db
    .update(videoBriefs)
    .set({
      scenes,
      status: "making",
      landing: { startMs: briefStartMs(timeline.tracks, payload.playheadMs), lanes: {} },
      updatedAt: now(),
    })
    .where(and(eq(videoBriefs.id, row.id), eq(videoBriefs.status, "draft")))
    .returning()
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
  await requireProjectBudget(
    userId,
    row.projectId,
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

/** The picture shape for a project: its own, or the nearer of the two a model makes. */
function sceneAspect(projectAspect: string): AssetAspectRatio {
  return projectClipAspect(projectAspect) ?? (projectAspect === "4:3" ? "16:9" : "9:16")
}

/**
 * One scene's still: the direction in the project's look, with no actor. A
 * scene's picture made again on the timeline comes here too
 * (`regenerate-a-scene.md`).
 */
export async function makeScenePicture(
  userId: string,
  projectId: string,
  recipe: { prompt: string; model: GeminiImageModelId; aspectRatio: AssetAspectRatio }
) {
  const look = await readProjectLook(userId, projectId)
  const image = await generateImage({
    userId,
    model: recipe.model,
    aspectRatio: recipe.aspectRatio,
    projectId,
    ...withLook(
      look,
      `Create one still picture for a scene of a short video, filling the whole frame. Direction: ${recipe.prompt}. No text, captions, signs, labels or lettering anywhere in the picture.`,
      []
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
  projectId: string,
  origin: ScenePictureOrigin,
  change: { prompt: string; model: GeminiImageModelId }
) {
  await requireProjectBudget(userId, projectId, scenePictureCents(change.model))
  const made = await makeScenePicture(userId, projectId, {
    prompt: change.prompt,
    model: change.model,
    aspectRatio: origin.aspectRatio,
  })
  await attachPastedMediaToProject(userId, projectId, [made.media.id])
  const [image] = await serializeVideoMedia([made.media])
  return { image, origin: made.origin }
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
 * aloud. Each is held to the project's spend limit first.
 */
async function makeScene(job: ClaimedBrief, scene: StoredScene, aspectRatio: AssetAspectRatio) {
  let still = scene.still
  if (!still) {
    await requireProjectBudget(job.userId, job.projectId, sceneLeftCents(scene, job.voice, job.pictureModel))
    const made = await makeScenePicture(job.userId, job.projectId, {
      prompt: scene.picture,
      model: job.pictureModel as GeminiImageModelId,
      aspectRatio,
    })
    still = { mediaId: made.media.id, name: made.media.originalName, origin: made.origin }
    const kept = still
    if (!(await saveScene(job, scene.id, (current) => ({ ...current, still: kept })))) return false
  }
  await requireProjectBudget(job.userId, job.projectId, sceneLeftCents({ ...scene, still }, job.voice, job.pictureModel))
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
    projectId: job.projectId,
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
    const project = await getOwnedProject(job.userId, job.projectId)
    const aspectRatio = sceneAspect(project.aspect)
    for (const scene of job.scenes) {
      if (scene.state !== "queued") continue
      try {
        if (!(await makeScene(job, scene, aspectRatio))) return
      } catch (error) {
        const message = readableMessage(error)
        await saveScene(job, scene.id, (current) => ({ ...current, state: "failed", error: message }), "stopped")
        return
      }
    }
  } finally {
    await releaseBrief(job)
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
  payload: { briefId: string; sceneIds: string[]; lanes: BriefLanding["lanes"] }
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
        landing: { startMs: row.landing.startMs, lanes: payload.lanes },
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
 * Lands a brief's made scenes with nobody editing the project: lays them and
 * saves the project in the same step that marks them placed. A save that
 * meets a newer version rolls the whole step back, and the next pass tries
 * again.
 */
async function landBriefNow(briefId: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(videoBriefs).where(eq(videoBriefs.id, briefId)).for("update")
    if (!row?.landing) return
    const project = await getOwnedProject(row.userId, row.projectId, tx)
    const { timeline } = parseTimelineForReset(project.timeline)
    const landed = landBriefScenes(timeline.tracks, { scenes: row.scenes, landing: row.landing }, uuid)
    if (!landed) {
      console.error("A brief's scenes have no lane left to land on", row.id)
      return
    }
    if (!landed.placed.length) return
    const placed = new Set(landed.placed)
    const scenes = row.scenes.map((scene): StoredScene =>
      placed.has(scene.id) ? { ...scene, state: "placed" } : scene
    )
    await writeProjectTimeline(
      row.userId,
      project.id,
      { ...timeline, tracks: landed.tracks },
      project.version,
      tx
    )
    await tx
      .update(videoBriefs)
      .set({ scenes, landing: landed.landing, status: statusAfter(row, scenes), updatedAt: now() })
      .where(eq(videoBriefs.id, row.id))
    await attachPastedMediaToProject(
      row.userId,
      project.id,
      sceneFiles(row.scenes.filter((scene) => placed.has(scene.id))),
      tx
    )
  })
}

/**
 * The briefs with made scenes waiting and no window editing their project. A
 * project a window is editing is passed over, because that editor lands the
 * scenes itself.
 */
async function briefsToLand() {
  const editing = db
    .select({ windowId: videoEditorWindows.windowId })
    .from(videoEditorWindows)
    .where(
      and(
        eq(videoEditorWindows.projectId, videoBriefs.projectId),
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
}
