import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import type { AutomationNode } from "@/lib/automations/graph"
import { pickTranscriber } from "@/lib/video/ai-choices"
import { BRIEF_DEFAULT_PICTURE_MODEL } from "@/lib/video/brief"
import {
  EDIT_PLAN_ANSWER,
  editPlanSchema,
  fileLines,
  planToTimeline,
  type EditPlanFile,
} from "@/lib/video/flow/edit-plan"
import { flowStepEstimateCents } from "@/lib/video/flow/estimates"
import { flowBoxLabel, type FlowKind, type FlowNodeSettings } from "@/lib/video/flow/node-kinds"
import { buildFlowPrompt, feedText, type FlowFeed } from "@/lib/video/flow/prompt"
import type { FlowStepOutput, FlowVoice } from "@/lib/video/flow/run-shape"
import { createEmptyTimeline, requireCanonicalTimeline, type AspectRatio } from "@/lib/video/timeline-schema"
import { SMOOTH_COPY_FIRST_MESSAGE } from "@/lib/video/transcripts"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { requireVideoBudget, type SpendTag } from "@/server/video/project-spend"
import { createVideo, getOwnedVideo, writeVideoTimeline } from "@/server/video/project-videos"
import {
  videoActors,
  videoFlowRuns,
  videoProjectVideos,
  type VideoFlowRunRow,
  type VideoFlowRunStepRow,
} from "@/server/video/schema"
import { getAiDefaults, getCaptionSettings } from "@/server/video/settings"
import { attachPastedMediaToProject } from "@/server/video/media-list"
import { askWriter } from "@/server/video/writer"

import { currentWriter } from "./prices"
import { placeFlowThumbnail } from "./thumbnail"

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

type FlowStepResult =
  | { output: FlowStepOutput; promptSent?: string; estimateCents?: number }
  /** Not yet: the step stays queued and is tried again after `ms`, saying `note`. */
  | { wait: { ms: number; note: string } }

const FLOW_NEEDS_VIDEO_MESSAGE = "Connect a video to this node: an upload, a pick from Media or a link."
const FLOW_NEEDS_TEXT_MESSAGE = "Connect a node that makes words to this one, such as Paste text or AI text."
const FLOW_NEEDS_LAID_VIDEO_MESSAGE = "Connect this node after AI video, so there is a video to take frames from."
const FLOW_NOTHING_KEPT_MESSAGE = "The AI's answer kept no stretch of the videos. Change the prompt and make it again."
const FLOW_MUSIC_NEEDS_VIDEO_MESSAGE =
  "AI music is made for the run's video in its project. Save the run to a project on the last step, then press this step's button again."
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
      return aiVideo(context)
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
    if (!given) continue
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
  if (!media.length) throw new Error(FLOW_NEEDS_VIDEO_MESSAGE)
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

async function aiVideo(context: FlowStepContext): Promise<FlowStepResult> {
  await holdToVideoLimit(context, 0)
  const files = await videoFiles(context)
  if ("waitNote" in files) return { wait: { ms: SMOOTH_COPY_WAIT_MS, note: files.waitNote } }

  // The texts connected (a script, notes) go in as they are; the videos as
  // their timed words.
  const texts = context.feeds.filter((feed) => feed.output.text?.trim() && !feed.output.mediaIds?.length)
  const prompt = buildFlowPrompt(
    context.settings.prompt,
    [...texts, ...files.map((file) => ({ title: file.name, output: {}, extra: fileLines(file) }))],
    EDIT_PLAN_ANSWER
  )
  const estimateCents = flowStepEstimateCents("ai-video", { writer: await currentWriter(), promptCharacters: prompt.length })
  const plan = await askWriter({
    userId: context.userId,
    feature: "flow_video_plan",
    metadata: context.spend,
    prompt,
    schema: editPlanSchema,
    label: "AI video",
    timeoutMs: 180_000,
  })

  const video = await runVideo(context)
  // Made again, a run's cut replaces the last one; a saved video keeps its
  // lanes from before under the new ones.
  const current = video ? requireCanonicalTimeline(video.timeline) : { ...createEmptyTimeline(), aspect: await runAspect(context) }
  const saved = await getCaptionSettings()
  const laid = planToTimeline(plan, files, {
    aspect: current.aspect,
    captions: { ...saved, aspect: current.aspect },
    newId: uuid,
  })
  if (!laid.stretches) throw new Error(FLOW_NOTHING_KEPT_MESSAGE)
  const timeline = { ...current, tracks: [...laid.timeline.tracks, ...current.tracks] }
  let videoId: string | undefined
  if (video) {
    await writeVideoTimeline(context.userId, video.id, timeline, video.version)
    videoId = video.id
  } else if (context.run.projectId) {
    // A run already saved: the video goes into its project with the cut on it.
    const made = await createVideo(context.userId, context.run.projectId, { name: context.run.flowName, timeline })
    videoId = made.id
    await db.update(videoFlowRuns).set({ videoId, updatedAt: now() }).where(eq(videoFlowRuns.id, context.run.id))
  } else {
    // Not saved yet: the cut waits on the run, and the last step makes the
    // project's video from it (Tyler, 14 Nov 2026: "Flow should not create
    // draft until it is saved").
    await db.update(videoFlowRuns).set({ timeline, updatedAt: now() }).where(eq(videoFlowRuns.id, context.run.id))
  }
  await onProjectShelf(
    context,
    files.map((file) => file.mediaId)
  )
  const length = Math.round(laid.laidMs / 1000)
  const summary = `${laid.stretches} ${laid.stretches === 1 ? "stretch" : "stretches"}, ${Math.floor(length / 60)}:${String(length % 60).padStart(2, "0")} long${laid.skipped ? `, ${laid.skipped} left out` : ""}`
  return {
    output: { ...(videoId ? { videoId } : {}), summary, ...(plan.title ? { text: plan.title } : {}) },
    promptSent: prompt,
    estimateCents,
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

async function aiPicture(context: FlowStepContext): Promise<FlowStepResult> {
  const estimateCents = flowStepEstimateCents("ai-picture", { writer: null, promptCharacters: 0 })
  await holdToVideoLimit(context, estimateCents)
  const aspect = await runAspect(context)
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
  // The music tool makes a track for a video, so it needs the run's video.
  const video = await runVideo(context)
  if (!video) throw new Error(FLOW_MUSIC_NEEDS_VIDEO_MESSAGE)
  const videoId = video.id
  // The prompt is the mood, as it is in the Music panel.
  const mood = context.settings.prompt.trim()
  const { makeAiMusic } = await import("@/server/video/ai-music")
  const laidMs = requireCanonicalTimeline(video.timeline).tracks.reduce(
    (most, track) => Math.max(most, ...track.clips.map((clip) => clip.startMs + clip.durationMs)),
    0
  )
  const made = await makeAiMusic({ userId: context.userId, videoId, mood, forMs: laidMs > 0 ? laidMs : 60_000 })
  await onProjectShelf(context, [made.media.id])
  return {
    output: { mediaIds: [made.media.id], summary: `${Math.round(made.lengthMs / 1000)} seconds of music` },
    estimateCents: made.cents,
  }
}

// ------------------------------------------------------ AI thumbnail --

const ideaAnswer = z.object({
  at_seconds: z.number().nonnegative(),
  words: z.string().min(1).max(60),
  expression: z.string().max(120).default(""),
  background: z.string().max(160).default(""),
})

const IDEA_ANSWER =
  'Reply with JSON only, in this shape: {"at_seconds": 10, "words": "AT MOST FIVE WORDS", "expression": "the face or feeling to show", "background": "what should be behind"}. at_seconds is the moment of the run\'s video whose frame to use.'

async function aiThumbnail(context: FlowStepContext): Promise<FlowStepResult> {
  // The run's video once saved, or the cut waiting on the run before then.
  const video = await runVideo(context)
  const source = video ? requireCanonicalTimeline(video.timeline) : context.run.timeline
  if (!source) throw new Error(FLOW_NEEDS_LAID_VIDEO_MESSAGE)
  const timeline = source
  const endMs = Math.max(0, ...timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs)))
  if (endMs <= 0) throw new Error(FLOW_NEEDS_LAID_VIDEO_MESSAGE)
  const { pictureEditCostCents, pictureEditPrompt } = await import("@/lib/video/picture-edits")
  const estimateCents = pictureEditCostCents(BRIEF_DEFAULT_PICTURE_MODEL)
  await holdToVideoLimit(context, estimateCents)

  // What is said in the cut, in the order it plays, so the AI can pick its moment.
  const said = timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.kind === "text" && clip.text?.trim())
    .sort((a, b) => a.startMs - b.startMs)
    .map((clip) => `[${(clip.startMs / 1000).toFixed(1)}] ${clip.text!.trim()}`)
  const prompt = buildFlowPrompt(
    context.settings.prompt,
    [
      ...context.feeds.filter((feed) => feed.output.text?.trim()),
      { title: `The run's video, ${(endMs / 1000).toFixed(1)} seconds long`, output: {}, extra: said.length ? said.slice(0, 400) : ["(no captions on it)"] },
    ],
    IDEA_ANSWER
  )
  const idea = await askWriter({
    userId: context.userId,
    feature: "flow_thumbnail_idea",
    metadata: context.spend,
    prompt,
    schema: ideaAnswer,
    label: "AI thumbnail",
  })
  const words = idea.words.split(/\s+/).slice(0, 5).join(" ").toUpperCase()
  const shape = timeline.aspect === "16:9" || timeline.aspect === "4:3" ? "wide" : "tall"

  // The frame, changed to match the idea, as an idea is on the Thumbnail
  // board (`makeIdea`), then kept in Media for the board.
  const [{ renderTimelineFrame }, { generateImage }, { saveGeneratedAsset }] = await Promise.all([
    import("@/server/video/render"),
    import("@/server/video/asset-factories/images"),
    import("@/server/video/asset-factories/media"),
  ])
  const frame = await renderTimelineFrame({
    userId: context.userId,
    timeline,
    atMs: Math.min(endMs - 1, Math.round(idea.at_seconds * 1000)),
  })
  const ask = `Turn this video frame into a YouTube thumbnail photo. Show the main person ${idea.expression || "with a strong, clear expression"}, big and sharp, with ${idea.background || "a simple bright background"} behind them. No words or letters anywhere in the picture.`
  const image = await generateImage({
    userId: context.userId,
    model: BRIEF_DEFAULT_PICTURE_MODEL,
    prompt: pictureEditPrompt("own", ask),
    aspectRatio: shape === "wide" ? "16:9" : "9:16",
    references: [{ bytes: frame, mimeType: "image/jpeg" }],
    spend: spendTag(context),
  })
  const picture = await saveGeneratedAsset({
    userId: context.userId,
    ...image,
    fileType: "image",
    name: `${context.run.flowName.slice(0, 60)} thumbnail`,
  })
  await onProjectShelf(context, [picture.id])
  // A saved run's video gets it on its board now; otherwise saving does it.
  const thumbnailId = video
    ? await placeFlowThumbnail(
        context.userId,
        video.id,
        shape,
        { mediaId: picture.id, storagePath: picture.storagePath, name: picture.originalName },
        words
      )
    : null
  return {
    output: {
      mediaIds: [picture.id],
      text: words,
      ...(thumbnailId && video ? { thumbnailIds: [thumbnailId], videoId: video.id } : {}),
      summary: `"${words}" at ${idea.at_seconds}s`,
    },
    promptSent: prompt,
    estimateCents: estimateCents + flowStepEstimateCents("ai-text", { writer: await currentWriter(), promptCharacters: prompt.length }),
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
