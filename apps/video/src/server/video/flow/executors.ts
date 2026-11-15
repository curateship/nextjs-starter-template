import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import type { AutomationNode } from "@/lib/automations/graph"
import { pickTranscriber } from "@/lib/video/ai-choices"
import { BRIEF_DEFAULT_PICTURE_MODEL } from "@/lib/video/brief"
import {
  fileLines,
  planToTimeline,
  type EditPlanFile,
} from "@/lib/video/flow/edit-plan"
import {
  actionsToTracks,
  describeEditorPlan,
  EDITOR_ANSWER,
  editorAnswerSchema,
  editorLengthSeconds,
  editorProblems,
  expandActions,
  makingActions,
  type EditorFile,
  type EditorFiles,
} from "@/lib/video/flow/editor-actions"
import { flowStepEstimateCents } from "@/lib/video/flow/estimates"
import { flowBoxLabel, type FlowKind, type FlowNodeSettings } from "@/lib/video/flow/node-kinds"
import { buildFlowPrompt, feedText, type FlowFeed } from "@/lib/video/flow/prompt"
import type { FlowMadeFile, FlowStepOutput, FlowStepState, FlowVoice } from "@/lib/video/flow/run-shape"
import { createEmptyTimeline, requireCanonicalTimeline, type AspectRatio, type ProjectTimeline } from "@/lib/video/timeline-schema"
import { formatAiEstimate } from "@/lib/video/ai-estimates"
import { requireAllowanceRoom } from "@/server/video/video-meter"
import { SMOOTH_COPY_FIRST_MESSAGE } from "@/lib/video/transcripts"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { requireVideoBudget, type SpendTag } from "@/server/video/project-spend"
import { createVideo, getOwnedVideo, writeVideoTimeline } from "@/server/video/project-videos"
import {
  videoActors,
  videoFlowRunSteps,
  videoFlowRuns,
  videoProjectVideos,
  type VideoFlowRunRow,
  type VideoFlowRunStepRow,
} from "@/server/video/schema"
import { getAiDefaults, getCaptionSettings } from "@/server/video/settings"
import { attachPastedMediaToProject } from "@/server/video/media-list"
import { askWriter } from "@/server/video/writer"

import { currentWriter } from "./prices"
import { THUMBNAIL_ANSWER, thumbnailAnswerSchema, thumbnailLayersFrom } from "@/lib/video/flow/thumbnail-answer"
import type { ThumbnailShape } from "@/lib/video/thumbnails"
import { createThumbnail } from "@/server/video/thumbnails"

/**
 * What each Flow node does when the worker reaches it
 * (workspace/docs/flow.md). Every AI node follows its prompt and nothing
 * else; what is connected to it goes after the prompt (`prompt.ts`). Each
 * call carries the run's project and video, so the video's spend line and
 * its limit count it, and the step's id, so the step shows what it cost.
 */

export type FlowStepContext = {
  userId: string
  run: VideoFlowRunRow
  step: VideoFlowRunStepRow
  node: AutomationNode
  settings: FlowNodeSettings
  /** The nodes with a line into this one, in step order, and what each made. */
  feeds: (FlowFeed & { kind: FlowKind | null })[]
  /**
   * What each AI call's meter row carries: the run and the step, and the
   * project and video once the run is saved into one.
   */
  spend: { projectId?: string; videoId?: string; flowRunId: string; flowStepId: string }
}

export type FlowStepResult =
  | { output: FlowStepOutput; promptSent?: string; estimateCents?: number }
  /** Not yet: the step stays queued and is tried again after `ms`, saying `note`. */
  | { wait: { ms: number; note: string } }
  /**
   * Stop for the person's OK before anything is paid for: `output` says the
   * plan and its price (flow.md, "Plan, OK, then make"). OK sends the step
   * back to the worker, which makes it.
   */
  | { confirm: { output: FlowStepOutput; promptSent?: string; estimateCents?: number } }

/**
 * Writes down what a step remembers between the worker's passes
 * (`FlowStepState`), only while the step is still being made: a step sent
 * back meanwhile keeps its new state.
 */
export async function saveStepState(stepId: string, state: FlowStepState) {
  await db
    .update(videoFlowRunSteps)
    .set({ state, updatedAt: now() })
    .where(and(eq(videoFlowRunSteps.id, stepId), eq(videoFlowRunSteps.status, "working")))
}

const FLOW_NEEDS_TEXT_MESSAGE = "Give this node words to read: a Text box of its own, or a line from AI text."
const FLOW_NEEDS_LAID_VIDEO_MESSAGE = "Give this node a picture, or connect it after AI editor so there is a video to take a frame from."
const FLOW_NOTHING_KEPT_MESSAGE = "The AI's answer kept no stretch of the videos. Change the prompt and make it again."
const FLOW_NO_TRANSCRIBER_MESSAGE = "Add an OpenAI or Google Gemini key in Settings → AI, so what is said in the video can be written down."

/** How long an AI video waits for a big upload's smooth copy before looking again. */
const SMOOTH_COPY_WAIT_MS = 60_000

const textAnswer = z.object({ text: z.string().min(1) })
const TEXT_ANSWER = 'Reply with JSON only, in this shape: {"text": "your answer"}.'

export async function runFlowStep(kind: FlowKind, given: FlowStepContext): Promise<FlowStepResult> {
  // The node's own boxes come first, then what the nodes with a line into it made.
  const context = { ...given, feeds: [...(await boxFeeds(given)), ...given.feeds] }
  switch (kind) {
    case "ai-text":
      return aiText(context)
    case "ai-video":
      return aiEditor(context)
    case "ai-picture":
      return aiPicture(context)
    case "ai-voice":
      return aiVoice(context)
    case "ai-music":
      return aiMusic(context)
    case "ai-thumbnail":
      return aiThumbnail(context)
  }
}

/**
 * What the node's boxes held, read as the nodes with a line into it are:
 * each by its name, the words, the files, the actor or the voice. A link is
 * downloaded into Media first and what is said in it written down.
 */
async function boxFeeds(context: FlowStepContext): Promise<FlowStepContext["feeds"]> {
  const feeds: FlowStepContext["feeds"] = []
  for (const box of context.settings.asks) {
    const given = context.step.input?.[box.id]
    // An optional box left empty gives the node nothing.
    if (!given || !Object.keys(given).length) continue
    const title = flowBoxLabel(box)
    if (box.kind === "link" && given.link) {
      feeds.push({ title, kind: null, output: await downloadLink(context, given.link, title) })
      continue
    }
    feeds.push({
      title,
      kind: null,
      output: {
        ...(given.text ? { text: given.text } : {}),
        ...(given.mediaIds?.length ? { mediaIds: given.mediaIds } : {}),
        ...(given.actorId ? { actorId: given.actorId } : {}),
        ...(given.voice ? { voice: given.voice } : {}),
      },
    })
  }
  return feeds
}

/**
 * The run's video, once AI video has saved its cut into the project. Until
 * then a run has none (Tyler, 14 Nov 2026: "Flow should not create draft
 * until it is saved").
 */
async function runVideo(context: FlowStepContext) {
  if (!context.run.videoId) return null
  return getOwnedVideo(context.userId, context.run.videoId).catch(() => null)
}

/** Puts files on the project's Media shelf once the run is saved into one; saving puts them there otherwise. */
async function onProjectShelf(context: FlowStepContext, mediaIds: string[]) {
  if (context.run.projectId && mediaIds.length) await attachPastedMediaToProject(context.userId, context.run.projectId, mediaIds)
}

/** The Flow run and step on a tool's meter row, plus the project and video once saved. */
function stepSpend(context: FlowStepContext): Record<string, string> {
  return Object.fromEntries(
    Object.entries(context.spend).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  )
}

/**
 * The meter tag for tools that ask for a project's: the run's, or none yet.
 * The project's spend line counts only calls made after the run is saved.
 */
function spendTag(context: FlowStepContext): SpendTag {
  return context.spend as SpendTag
}

/** Holds a call to the run video's own spend limit, once there is a video. The month's allowance holds every call. */
async function holdToVideoLimit(context: FlowStepContext, cents: number) {
  if (context.run.videoId) await requireVideoBudget(context.userId, context.run.videoId, cents)
}

/** The shape new pictures and the run's video take: the run's video's, else the project's last edited video's, else upright. */
async function runAspect(context: FlowStepContext): Promise<AspectRatio> {
  const video = await runVideo(context)
  if (video) return requireCanonicalTimeline(video.timeline).aspect
  if (context.run.timeline) return context.run.timeline.aspect
  if (!context.run.projectId) return "9:16"
  const [last] = await db
    .select({ aspect: videoProjectVideos.aspect })
    .from(videoProjectVideos)
    .where(eq(videoProjectVideos.projectId, context.run.projectId))
    .orderBy(desc(videoProjectVideos.updatedAt))
    .limit(1)
  return (last?.aspect as AspectRatio | undefined) ?? "9:16"
}

function connectedMediaIds(context: FlowStepContext) {
  return [...new Set(context.feeds.flatMap((feed) => feed.output.mediaIds ?? []))]
}

/** The connected files of one type, the person's own, in the order they were connected. */
async function connectedFiles(context: FlowStepContext, fileType: "video" | "image" | "audio") {
  const ids = connectedMediaIds(context)
  if (!ids.length) return []
  const rows = await db
    .select()
    .from(customShellMedia)
    .where(and(inArray(customShellMedia.id, ids), eq(customShellMedia.userId, context.userId), eq(customShellMedia.fileType, fileType)))
  return ids.flatMap((id) => rows.filter((row) => row.id === id))
}

// ----------------------------------------------------------- AI text --

async function aiText(context: FlowStepContext): Promise<FlowStepResult> {
  await holdToVideoLimit(context, 0)
  const prompt = buildFlowPrompt(context.settings.prompt, context.feeds, TEXT_ANSWER)
  const estimateCents = flowStepEstimateCents("ai-text", { writer: await currentWriter(), promptCharacters: prompt.length })
  const answer = await askWriter({
    userId: context.userId,
    feature: "flow_text",
    metadata: context.spend,
    prompt,
    schema: textAnswer,
    label: "AI text",
  })
  const text = answer.text.trim()
  const words = text.split(/\s+/).filter(Boolean).length
  return { output: { text, summary: words === 1 ? "1 word" : `${words} words` }, promptSent: prompt, estimateCents }
}

// ---------------------------------------------------------- AI video --

/**
 * The words of each connected video: saved words when there are some,
 * otherwise written down now by whichever AI writes speech down. A big
 * upload whose smooth copy isn't made yet makes the step wait for it.
 */
async function videoFiles(context: FlowStepContext): Promise<EditPlanFile[] | { waitNote: string }> {
  const media = await connectedFiles(context, "video")
  const transcriber = pickTranscriber(await getAiDefaults(), await getAiKeysSaved())
  if (!transcriber) throw new Error(FLOW_NO_TRANSCRIBER_MESSAGE)
  const { fileWords, readSavedTranscript } = await import("@/server/video/transcripts")
  const files: EditPlanFile[] = []
  for (const [index, row] of media.entries()) {
    try {
      const words = await fileWords({
        userId: context.userId,
        media: { id: row.id, storagePath: row.storagePath },
        transcriber,
        feature: "flow_video_words",
        label: "AI video",
        spend: spendTag(context),
        failedMessage: `What is said in "${row.originalName}" couldn't be written down. Try again.`,
      })
      const saved = await readSavedTranscript(context.userId, row.id, transcriber.id)
      const lastWordMs = words.at(-1)?.endMs ?? 0
      files.push({
        key: `F${index + 1}`,
        mediaId: row.id,
        name: row.originalName,
        durationMs: Math.max(saved?.durationMs ?? 0, lastWordMs),
        words,
      })
    } catch (error) {
      if (error instanceof Error && error.message === SMOOTH_COPY_FIRST_MESSAGE) {
        return { waitNote: `Waiting for "${row.originalName}" to be made ready. Big videos take a while; this looks again every minute.` }
      }
      throw error
    }
  }
  return files
}

/** A connected sound's length, read from the file itself. */
async function soundLengthMs(storagePath: string) {
  const [{ getFromR2 }, { soundDurationMs }] = await Promise.all([
    import("@/server/media/storage"),
    import("@/server/video/voice"),
  ])
  const object = await getFromR2(storagePath)
  const bytes = await object.Body?.transformToByteArray()
  return bytes?.byteLength ? soundDurationMs(bytes) : 0
}

/**
 * Writes the step's timeline: onto the run's saved video, into a new video
 * in the run's project once it has one, or onto the run itself until it is
 * saved (Tyler, 14 Nov 2026: "Flow should not create draft until it is
 * saved"). A saved video keeps its lanes from before under the new ones.
 */
async function writeRunTimeline(context: FlowStepContext, tracks: ProjectTimeline["tracks"], aspect: AspectRatio) {
  const video = await runVideo(context)
  const current = video ? requireCanonicalTimeline(video.timeline) : { ...createEmptyTimeline(), aspect }
  const timeline = { ...current, aspect: video ? current.aspect : aspect, tracks: [...tracks, ...(video ? current.tracks : [])] }
  if (video) {
    await writeVideoTimeline(context.userId, video.id, timeline, video.version)
    return video.id
  }
  if (context.run.projectId) {
    const made = await createVideo(context.userId, context.run.projectId, { name: context.run.flowName, timeline })
    await db.update(videoFlowRuns).set({ videoId: made.id, updatedAt: now() }).where(eq(videoFlowRuns.id, context.run.id))
    return made.id
  }
  await db.update(videoFlowRuns).set({ timeline, updatedAt: now() }).where(eq(videoFlowRuns.id, context.run.id))
  return undefined
}

/** How often a step waiting on a moving picture looks again. */
const SHOT_WAIT_MS = 20_000

/**
 * The AI editor (flow.md, "AI editor"): the AI reads the prompt, the words
 * and footage connected or in its boxes, and the pictures and sounds by name
 * (P1…, S1…), and answers with what to do using the editor's own tools
 * (`editor-actions.ts`). The step then:
 *
 * 1. **Plans** once, kept on the step. With Wait for my OK on, it stops here
 *    with the plan and its price; nothing is paid for until OK (Tyler picked
 *    "Show plan, wait for OK").
 * 2. **Makes** each paid thing, one a pass of the worker, writing each down
 *    as soon as it is paid for, so a pass cut short or Try again never pays
 *    twice. A moving picture is left to the AI video worker and looked at
 *    again every 20 seconds.
 * 3. **Lays** it all on the run's video.
 *
 * An answer with only `segments` is AI video's old cut, laid as it was.
 */
async function aiEditor(context: FlowStepContext): Promise<FlowStepResult> {
  await holdToVideoLimit(context, 0)
  const footageRows = await connectedFiles(context, "video")
  const footage = footageRows.length ? await videoFiles(context) : []
  if ("waitNote" in footage) return { wait: { ms: SMOOTH_COPY_WAIT_MS, note: footage.waitNote } }
  const pictures = await connectedFiles(context, "image")
  const sounds = await connectedFiles(context, "audio")
  const names: EditorFiles = {
    pictures: pictures.map((_, index) => `P${index + 1}`),
    footage: footage.map((file) => file.key),
    sounds: sounds.map((_, index) => `S${index + 1}`),
  }

  let state: FlowStepState | null = context.step.state
  let plan = state?.plan ? editorAnswerSchema.parse(state.plan) : null
  let promptSent: string | undefined
  let writerCents = 0
  if (!plan) {
    const texts = context.feeds.filter((feed) => feed.output.text?.trim() && !feed.output.mediaIds?.length)
    const list = [
      ...pictures.map((row, index) => `P${index + 1}: picture "${row.originalName}"`),
      ...sounds.map((row, index) => `S${index + 1}: sound "${row.originalName}"`),
    ]
    const prompt = buildFlowPrompt(
      context.settings.prompt,
      [
        ...texts,
        ...footage.map((file) => ({ title: `${file.key}: footage "${file.name}"`, output: {}, extra: fileLines(file) })),
        ...(list.length ? [{ title: "Pictures and sounds you can use", output: {}, extra: list }] : []),
      ],
      EDITOR_ANSWER
    )
    promptSent = prompt
    writerCents = flowStepEstimateCents("ai-video", { writer: await currentWriter(), promptCharacters: prompt.length })
    // Read through the answer's own shape, so its defaults are filled in.
    const ask = async (words: string) =>
      editorAnswerSchema.parse(
        await askWriter({
          userId: context.userId,
          feature: "flow_video_plan",
          metadata: context.spend,
          prompt: words,
          schema: editorAnswerSchema,
          label: "AI editor",
          timeoutMs: 180_000,
        })
      )
    let answer = await ask(prompt)
    let problems = editorProblems(answer, names)
    if (problems.length) {
      answer = await ask(`${prompt}\n\nYour last answer could not be used:\n${problems.map((line) => `- ${line}`).join("\n")}\nAnswer again with these fixed.`)
      problems = editorProblems(answer, names)
      if (problems.length) throw new Error(`The AI's plan couldn't be used: ${problems.slice(0, 3).join(" ")}`)
    }
    plan = answer
    const described = describeEditorPlan(plan)
    if (context.settings.waitForOk && !state?.approved && makingActions(expandActions(plan)).length) {
      await saveStepState(context.step.id, { phase: "planned", plan, priceCents: described.cents })
      return {
        confirm: {
          output: { text: described.text, summary: `A plan to check, about ${formatAiEstimate(described.cents)}` },
          promptSent: prompt,
          estimateCents: writerCents + described.cents,
        },
      }
    }
    state = { phase: "making", approved: true, plan, priceCents: described.cents, files: {} }
    await saveStepState(context.step.id, state)
  }

  // Make one paid thing a pass, writing it down as soon as it is paid for.
  const actions = expandActions(plan)
  const madeFiles = { ...(state?.files ?? {}) }
  const making = makingActions(actions)
  if (making.length && !Object.keys(madeFiles).length) {
    // The whole plan's price against the month's allowance, before the first.
    await requireAllowanceRoom(context.userId, state?.priceCents ?? 0)
  }
  const keep = async (key: string, file: FlowMadeFile) => {
    madeFiles[key] = file
    state = { ...(state ?? { phase: "making" as const }), files: madeFiles }
    await saveStepState(context.step.id, state)
  }
  for (const action of making) {
    const have = madeFiles[action.id]
    if (have?.status === "made") continue
    if (action.do === "animate_picture") {
      const { createPictureShot, pictureShotState } = await import("@/server/video/asset-factories/moving-stills")
      if (have?.status === "making" && have.shotId) {
        const shot = await pictureShotState(context.userId, have.shotId)
        if (shot.status === "error") throw new Error(`${action.id} couldn't be made to move: ${shot.error ?? "the video model refused it"}`)
        if (shot.status !== "ready" || !shot.mediaId) {
          return { wait: { ms: SHOT_WAIT_MS, note: `Making ${action.file} move (${action.id}). Video models take a few minutes; this looks again every 20 seconds.` } }
        }
        await keep(action.id, { status: "made", mediaId: shot.mediaId, durationMs: shot.durationMs, shotId: have.shotId })
        continue
      }
      const picture = pictures[names.pictures.indexOf(action.file)]
      // The plan names a picture no longer in the step's boxes: Make it again plans afresh.
      if (!picture) throw new Error(`${action.file} isn't connected to this step any more. Press Make it again.`)
      const started = await createPictureShot(context.userId, {
        mediaId: picture.id,
        prompt: action.prompt,
        seconds: action.seconds,
        company: action.model,
        quality: action.quality,
        sound: action.sound,
        endOnStart: action.end_on_start,
        aspect: plan.frame ?? (await runAspect(context)),
        projectId: context.run.projectId,
        videoId: context.run.videoId,
        flowStepId: context.step.id,
      })
      await keep(action.id, { status: "making", shotId: started.shotId })
      return { wait: { ms: SHOT_WAIT_MS, note: `Making ${action.file} move (${action.id}).` } }
    }
    if (action.do === "make_music") {
      const { makeAiMusic } = await import("@/server/video/ai-music")
      const made = await makeAiMusic({
        userId: context.userId,
        videoId: context.run.videoId ?? undefined,
        mood: action.mood,
        forMs: action.seconds * 1000,
        spend: stepSpend(context),
      })
      await keep(action.id, { status: "made", mediaId: made.media.id, durationMs: made.lengthMs })
      return { wait: { ms: 0, note: `Made the music ${action.id}.` } }
    }
    const { makeAiSoundEffect } = await import("@/server/video/ai-sound-effects")
    const made = await makeAiSoundEffect({
      userId: context.userId,
      videoId: context.run.videoId ?? undefined,
      words: action.words,
      seconds: action.seconds,
      loop: action.loop,
      spend: stepSpend(context),
    })
    await keep(action.id, { status: "made", mediaId: made.media.id, durationMs: action.seconds * 1000 })
    return { wait: { ms: 0, note: `Made the sound ${action.id}.` } }
  }

  // Lay it all.
  const files = new Map<string, EditorFile>()
  for (const [index, row] of pictures.entries()) files.set(`P${index + 1}`, { mediaId: row.id, name: row.originalName, kind: "image" })
  for (const file of footage) files.set(file.key, { mediaId: file.mediaId, name: file.name, kind: "video", durationMs: file.durationMs })
  for (const [index, row] of sounds.entries()) {
    if (!actions.some((action) => action.do === "place" && action.file === `S${index + 1}`)) continue
    files.set(`S${index + 1}`, { mediaId: row.id, name: row.originalName, kind: "audio", durationMs: await soundLengthMs(row.storagePath) })
  }
  for (const action of making) {
    const made = madeFiles[action.id]
    if (!made?.mediaId) continue
    files.set(action.id, {
      mediaId: made.mediaId,
      name: action.do === "make_music" ? `Music ${action.id}` : action.do === "make_sound" ? `Sound ${action.id}` : `Moving ${action.file}`,
      kind: action.do === "animate_picture" ? "video" : "audio",
      durationMs: made.durationMs,
    })
  }
  const aspect = plan.frame ?? (await runAspect(context))
  const laid = actionsToTracks(actions, files, { aspect, newId: uuid })
  let cutTracks: ProjectTimeline["tracks"] = []
  let cutSummary = ""
  if (plan.segments?.length) {
    const saved = await getCaptionSettings()
    const cut = planToTimeline(
      { title: plan.title, captions: plan.captions ?? true, segments: plan.segments },
      footage,
      { aspect, captions: { ...saved, aspect }, newId: uuid }
    )
    if (!cut.stretches) throw new Error(FLOW_NOTHING_KEPT_MESSAGE)
    cutTracks = cut.timeline.tracks
    const length = Math.round(cut.laidMs / 1000)
    cutSummary = `${cut.stretches} ${cut.stretches === 1 ? "stretch" : "stretches"}, ${Math.floor(length / 60)}:${String(length % 60).padStart(2, "0")} long${cut.skipped ? `, ${cut.skipped} left out` : ""}`
  }
  if (!cutTracks.length && !laid.tracks.length) throw new Error(FLOW_NOTHING_KEPT_MESSAGE)
  const videoId = await writeRunTimeline(context, [...cutTracks, ...laid.tracks], aspect)
  // The pictures it animated go on too, so a thumbnail after it can use the scene.
  const animated = making.flatMap((action) =>
    action.do === "animate_picture" ? [pictures[names.pictures.indexOf(action.file)]?.id].filter((id): id is string => Boolean(id)) : []
  )
  const mediaIds = [...new Set([...footage.map((file) => file.mediaId), ...laid.usedMediaIds, ...animated])]
  await onProjectShelf(context, mediaIds)
  const lengthS = Math.round(editorLengthSeconds(actions))
  const summary =
    cutSummary ||
    `${laid.tracks.length} ${laid.tracks.length === 1 ? "lane" : "lanes"}, ${Math.floor(lengthS / 60)}:${String(lengthS % 60).padStart(2, "0")} long`
  return {
    output: { ...(videoId ? { videoId } : {}), mediaIds, summary, ...(plan.title ? { text: plan.title } : {}) },
    ...(promptSent ? { promptSent } : {}),
    estimateCents: writerCents + (state?.priceCents ?? 0),
  }
}

// -------------------------------------------------------- AI picture --

async function referencePictures(context: FlowStepContext) {
  const pictures = await connectedFiles(context, "image")
  const actorId = context.feeds.find((feed) => feed.output.actorId)?.output.actorId
  const actorPictures: { storagePath: string; mimeType: string }[] = []
  if (actorId) {
    const [actor] = await db
      .select()
      .from(videoActors)
      .where(and(eq(videoActors.id, actorId), eq(videoActors.userId, context.userId)))
      .limit(1)
    const mainMediaId = actor?.imageMediaId
    if (mainMediaId) {
      const [main] = await db
        .select()
        .from(customShellMedia)
        .where(and(eq(customShellMedia.id, mainMediaId), eq(customShellMedia.userId, context.userId)))
        .limit(1)
      if (main) actorPictures.push({ storagePath: main.storagePath, mimeType: main.mimeType })
    }
  }
  return [...actorPictures, ...pictures.slice(0, 3).map((row) => ({ storagePath: row.storagePath, mimeType: row.mimeType }))]
}

/**
 * The shape of a picture: the run's video's once there is one; before that,
 * what its prompt says (16:9, wide, landscape; 9:16, tall, portrait; square),
 * so a café for a wide study video comes out wide rather than the run's
 * tall default.
 */
async function pictureAspect(context: FlowStepContext): Promise<AspectRatio> {
  if (context.run.videoId || context.run.timeline) return runAspect(context)
  const prompt = context.settings.prompt
  if (/\b(16:9|wide|widescreen|landscape|horizontal)\b/i.test(prompt)) return "16:9"
  if (/\b(9:16|tall|portrait|vertical)\b/i.test(prompt)) return "9:16"
  if (/\b(1:1|square)\b/i.test(prompt)) return "1:1"
  return runAspect(context)
}

async function aiPicture(context: FlowStepContext): Promise<FlowStepResult> {
  const estimateCents = flowStepEstimateCents("ai-picture", { writer: null, promptCharacters: 0 })
  await holdToVideoLimit(context, estimateCents)
  const aspect = await pictureAspect(context)
  const prompt = buildFlowPrompt(context.settings.prompt, context.feeds.filter((feed) => feed.output.text), "Make one picture.")
  const [{ generateImage }, { saveGeneratedAsset }] = await Promise.all([
    import("@/server/video/asset-factories/images"),
    import("@/server/video/asset-factories/media"),
  ])
  const image = await generateImage({
    userId: context.userId,
    model: BRIEF_DEFAULT_PICTURE_MODEL,
    prompt,
    aspectRatio: aspect === "16:9" || aspect === "4:3" ? "16:9" : aspect === "1:1" ? "1:1" : "9:16",
    references: await referencePictures(context),
    spend: spendTag(context),
  })
  const media = await saveGeneratedAsset({
    userId: context.userId,
    ...image,
    fileType: "image",
    name: context.settings.title.trim() || "Flow picture",
  })
  await onProjectShelf(context, [media.id])
  return { output: { mediaIds: [media.id], summary: media.originalName }, promptSent: prompt, estimateCents }
}

// ---------------------------------------------------------- AI voice --

async function aiVoice(context: FlowStepContext): Promise<FlowStepResult> {
  const text = feedText(context.feeds)
  if (!text) throw new Error(FLOW_NEEDS_TEXT_MESSAGE)
  const picked = context.feeds.find((feed) => feed.output.voice)?.output.voice
  const { getVoiceDefaults } = await import("@/server/video/settings")
  // The usual voice saved in the Read a script with AI window, when nothing picked one.
  const usual = await getVoiceDefaults()
  const voice: FlowVoice | null =
    picked ?? (usual ? { voiceId: usual.voiceId, voiceName: usual.voiceName || "Voice", speaker: usual.speaker ?? "elevenlabs" } : null)
  if (!voice) throw new Error("Pick a voice: connect Pick an actor or voice, or save a usual voice in the Read a script with AI window.")
  const modelId = usual?.modelId ?? "eleven_multilingual_v2"
  const estimateCents = flowStepEstimateCents("ai-voice", { writer: null, promptCharacters: 0, readCharacters: text.length, voiceModel: modelId })
  await holdToVideoLimit(context, estimateCents)
  const { speak } = await import("@/server/video/voice")
  const read = await speak({
    userId: context.userId,
    voiceId: voice.voiceId,
    voiceName: voice.voiceName,
    modelId,
    text,
    speaker: voice.speaker as Parameters<typeof speak>[0]["speaker"],
    feature: "flow_voice",
    spend: spendTag(context),
  })
  await onProjectShelf(context, [read.mediaId])
  const length = Math.round(read.durationMs / 1000)
  return {
    output: { mediaIds: [read.mediaId], voice, text, summary: `${voice.voiceName}, ${length} seconds` },
    estimateCents,
  }
}

// ---------------------------------------------------------- AI music --

async function aiMusic(context: FlowStepContext): Promise<FlowStepResult> {
  // As long as the run's video, saved or not yet, or a minute when nothing is
  // laid; the music tool caps it at 5 minutes (ai-music.md). A run not yet
  // saved has no video, so only the month's allowance holds it.
  const video = await runVideo(context)
  const timeline = video ? requireCanonicalTimeline(video.timeline) : context.run.timeline
  // The prompt is the mood, as it is in the Music panel.
  const mood = context.settings.prompt.trim()
  const { makeAiMusic } = await import("@/server/video/ai-music")
  const laidMs = (timeline?.tracks ?? []).reduce(
    (most, track) => Math.max(most, ...track.clips.map((clip) => clip.startMs + clip.durationMs)),
    0
  )
  const made = await makeAiMusic({
    userId: context.userId,
    videoId: video?.id,
    mood,
    forMs: laidMs > 0 ? laidMs : 60_000,
    spend: stepSpend(context),
  })
  await onProjectShelf(context, [made.media.id])
  return {
    output: { mediaIds: [made.media.id], summary: `${Math.round(made.lengthMs / 1000)} seconds of music` },
    estimateCents: made.cents,
  }
}

// ------------------------------------------------------ AI thumbnail --

/**
 * AI thumbnail (flow.md, "AI thumbnail"): the AI answers from its prompt with
 * the picture under it (a connected picture, or a moment of the run's
 * video), an optional AI change to it, a shade, and the words and rings over
 * it (`thumbnail-answer.ts`), laid with the Thumbnail board's own layers. A
 * preview is drawn into Media for the step; a saved run's video gets it on
 * its board now, otherwise saving does.
 */
async function aiThumbnail(context: FlowStepContext): Promise<FlowStepResult> {
  const video = await runVideo(context)
  const timeline = video ? requireCanonicalTimeline(video.timeline) : context.run.timeline
  const endMs = timeline
    ? Math.max(0, ...timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs)))
    : 0
  const pictures = await connectedFiles(context, "image")
  if (!pictures.length && endMs <= 0) throw new Error(FLOW_NEEDS_LAID_VIDEO_MESSAGE)
  await holdToVideoLimit(context, 0)

  const said = (timeline?.tracks ?? [])
    .flatMap((track) => track.clips)
    .filter((clip) => clip.kind === "text" && clip.text?.trim())
    .sort((a, b) => a.startMs - b.startMs)
    .map((clip) => `[${(clip.startMs / 1000).toFixed(1)}] ${clip.text!.trim()}`)
  const prompt = buildFlowPrompt(
    context.settings.prompt,
    [
      ...context.feeds.filter((feed) => feed.output.text?.trim() && !feed.output.mediaIds?.length),
      ...(pictures.length
        ? [{ title: "Pictures you can use", output: {}, extra: pictures.map((row, index) => `P${index + 1}: "${row.originalName}"`) }]
        : []),
      ...(endMs > 0
        ? [{ title: `The run's video, ${(endMs / 1000).toFixed(1)} seconds long`, output: {}, extra: said.length ? said.slice(0, 400) : ["(no words on it)"] }]
        : []),
    ],
    THUMBNAIL_ANSWER
  )
  const answer = thumbnailAnswerSchema.parse(
    await askWriter({
      userId: context.userId,
      feature: "flow_thumbnail_idea",
      metadata: context.spend,
      prompt,
      schema: thumbnailAnswerSchema,
      label: "AI thumbnail",
    })
  )
  const shape: ThumbnailShape = timeline ? (timeline.aspect === "16:9" || timeline.aspect === "4:3" ? "wide" : "tall") : "wide"

  const [{ renderTimelineFrame }, { generateImage }, { saveGeneratedAsset }, { readStoredPicture }, { getPublicMediaUrl }] =
    await Promise.all([
      import("@/server/video/render"),
      import("@/server/video/asset-factories/images"),
      import("@/server/video/asset-factories/media"),
      import("@/server/video/asset-factories/person-board"),
      import("@/server/media/storage"),
    ])
  const named = /^P(\d+)$/.exec(answer.base)
  const chosen = named ? pictures[Number(named[1]) - 1] : undefined
  let base: { id: string; storagePath: string; originalName: string }
  let bytes: Uint8Array
  let mimeType = "image/jpeg"
  if (chosen) {
    base = chosen
    bytes = await readStoredPicture(chosen.storagePath)
    mimeType = chosen.mimeType
  } else {
    if (!timeline || endMs <= 0) throw new Error(FLOW_NEEDS_LAID_VIDEO_MESSAGE)
    bytes = await renderTimelineFrame({ userId: context.userId, timeline, atMs: Math.min(endMs - 1, Math.round(answer.frame_at * 1000)) })
    base = await saveGeneratedAsset({ userId: context.userId, bytes, mimeType: "image/jpeg", fileType: "image", name: `${context.run.flowName.slice(0, 60)} frame` })
  }
  let estimateCents = flowStepEstimateCents("ai-text", { writer: await currentWriter(), promptCharacters: prompt.length })
  if (answer.edit?.trim()) {
    const { pictureEditCostCents, pictureEditPrompt } = await import("@/lib/video/picture-edits")
    const editCents = pictureEditCostCents(BRIEF_DEFAULT_PICTURE_MODEL)
    await holdToVideoLimit(context, editCents)
    estimateCents += editCents
    const image = await generateImage({
      userId: context.userId,
      model: BRIEF_DEFAULT_PICTURE_MODEL,
      prompt: pictureEditPrompt("own", answer.edit.trim()),
      aspectRatio: shape === "wide" ? "16:9" : "9:16",
      references: [{ bytes, mimeType }],
      spend: spendTag(context),
    })
    base = await saveGeneratedAsset({ userId: context.userId, ...image, fileType: "image", name: `${context.run.flowName.slice(0, 60)} picture` })
  }

  const layers = thumbnailLayersFrom(answer, { mediaId: base.id, url: await getPublicMediaUrl(base.storagePath), name: base.originalName }, shape)
  const { renderThumbnailJpeg } = await import("@/server/video/thumbnail-export")
  const drawn = await renderThumbnailJpeg(context.userId, { shape, backgroundColor: "#000000", layers })
  const preview = await saveGeneratedAsset({
    userId: context.userId,
    bytes: drawn,
    mimeType: "image/jpeg",
    fileType: "image",
    name: `${context.run.flowName.slice(0, 60)} thumbnail`,
  })
  await onProjectShelf(context, [preview.id, base.id])
  const thumbnailId = video
    ? (await createThumbnail({ owner: context.userId, videoId: video.id, shape, layers })).id
    : null
  const words = answer.layers.flatMap((layer) => (layer.type === "text" ? [layer.text] : []))
  return {
    output: {
      mediaIds: [preview.id, base.id],
      thumbnail: { shape, layers },
      ...(words.length ? { text: words.join(" · ") } : {}),
      ...(thumbnailId && video ? { thumbnailIds: [thumbnailId], videoId: video.id } : {}),
      summary: words.length ? `"${words.join(" · ").slice(0, 80)}"` : "A thumbnail",
    },
    promptSent: prompt,
    estimateCents,
  }
}

// ------------------------------------------------------------ a link --

/**
 * A link box's video: downloaded into Media (on the project's shelf once the
 * run is saved), then what is said in it written down, so an AI text node
 * can read it and an AI video node can cut it.
 */
async function downloadLink(context: FlowStepContext, link: string, label: string): Promise<FlowStepOutput> {
  const [{ downloadViralVideo }, { saveGeneratedAsset }] = await Promise.all([
    import("@/server/video/viral/download"),
    import("@/server/video/asset-factories/media"),
  ])
  const downloaded = await downloadViralVideo(link)
  const media = await saveGeneratedAsset({
    userId: context.userId,
    bytes: downloaded.bytes,
    mimeType: downloaded.mimeType,
    fileType: "video",
    name: downloaded.title?.slice(0, 100) || label,
  })
  await onProjectShelf(context, [media.id])
  const transcriber = pickTranscriber(await getAiDefaults(), await getAiKeysSaved())
  let text: string | undefined
  if (transcriber) {
    const { fileWords } = await import("@/server/video/transcripts")
    const words = await fileWords({
      userId: context.userId,
      media: { id: media.id, storagePath: media.storagePath },
      transcriber,
      feature: "flow_link_words",
      label,
      spend: spendTag(context),
      failedMessage: "The video downloaded, but what is said in it couldn't be written down. Try again.",
    })
    text = words.map((word) => word.text).join(" ")
  }
  return { mediaIds: [media.id], ...(text ? { text } : {}), summary: downloaded.title ?? label }
}
