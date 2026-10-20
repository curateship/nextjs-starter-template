import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import {
  assetPrompt,
  DEFAULT_VIDEO_QUALITY,
  FREE_KEY_MESSAGE,
  isFreeTierRefusal,
  PERSON_SHOTS_FULL_MESSAGE,
  pieceCostCents,
  PROJECT_SHOTS_FULL_MESSAGE,
  providerMessage,
  shotAllowanceShortMessage,
  shotCostCents,
  shotPieces,
  SHOTS_AT_ONCE_PER_PERSON,
  SHOTS_AT_ONCE_PER_PROJECT,
  VIDEO_MODEL,
  videoModelName,
  videoQualityName,
  videoTokens,
  type AssetAspectRatio,
  type ShotLengthSeconds,
  type VideoDurationSeconds,
  type VideoQuality,
} from "@/lib/video/asset-factories"
import {
  describeExtras,
  extraLine,
  personLine,
  sendingOrder,
  videoReferenceLine,
} from "@/lib/video/extras"
import { styledPrompt } from "@/lib/video/visual-style"
import {
  aiMonthSpendCents,
  aiUsageMonthStart,
  checkAiAllowance,
  getAiAllowanceCents,
  isAiLimitError,
  recordAiUsage,
  recordDeferredAiSuccess,
} from "@/server/ai/usage"
import { getAiKey } from "@/server/ai/keys"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { getFromR2 } from "@/server/media/storage"
import { customShellAiUsageEvents, customShellMedia } from "@/server/schema"
import { runFfmpeg } from "@/server/video/ffmpeg"
import {
  serializeVideoMedia,
  type VideoMediaItem,
} from "@/server/video/media-list"
import { readProjectStyle } from "@/server/video/project-look"
import { getAiDefaults, saveAiDefaults } from "@/server/video/settings"
import {
  projectSpendMetadata,
  requireProjectBudget,
} from "@/server/video/project-spend"
import { getOwnedProject } from "@/server/video/projects"
import {
  videoActors,
  videoAiGenerations,
  videoFirstFrames,
  type VideoAiGenerationRow,
} from "@/server/video/schema"
import { extrasByIds } from "./extras"
import { discardGeneratedAsset, saveGeneratedAsset } from "./media"
import {
  buildPersonBoard,
  readStoredPicture,
  shrinkReference,
} from "./person-board"

const outputMedia = alias(customShellMedia, "generation_output_media")
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
// Google hands a finished clip back inside its JSON answer as base64, which
// is a third bigger than the file, plus a little for the rest of the answer.
const MAX_ANSWER_BYTES = Math.ceil((MAX_VIDEO_BYTES * 4) / 3) + 1024 * 1024
const JOB_TIMEOUT_MS = 15 * 60 * 1000
const JOB_LEASE_MS = 5 * 60 * 1000
const PROVIDER_REQUEST_TIMEOUT_MS = 90_000
/**
 * How many running pieces one worker pass asks Google about, side by side.
 * A finished clip is held in memory while it is saved, up to 100 MB each, so
 * this is one person's six rather than everyone's.
 */
const CHECKS_PER_PASS = 6
const VIDEO_DOWNLOAD_TIMEOUT_MS = 4 * 60 * 1000

type ClaimedGeneration = VideoAiGenerationRow & { leaseToken: string }

/**
 * The actor and extras a piece is told about: one line each, and what its
 * reference pictures are when it has any.
 */
export type ShotPerson = {
  lines: string[]
  references: { board: boolean; backdrop: boolean } | null
}

/** A picture sent inside the request, as base64. */
type InlinePicture = { mimeType: string; data: string }

/** How many reference pictures a piece sends: the person, then the place. */
function referenceCount(person?: ShotPerson) {
  if (!person?.references) return 0
  return person.references.backdrop ? 2 : 1
}

/**
 * What Omni Flash is told for one piece. It opens with Google's tags saying
 * which picture is which: Image1 is the first frame, and any after it are
 * references. Then the project's style line, the direction, the person and
 * what they wear, hold and stand in, and the rule about the first frame. The
 * style and the descriptions are read when the piece starts, so a piece
 * started after either changed uses the new one.
 */
export function videoPrompt(style: string | null, direction: string, person?: ShotPerson) {
  const references = referenceCount(person)
  const tags = [
    "[# Sources <FIRST_FRAME>@Image1]",
    ...(references
      ? [
          `[# References ${Array.from(
            { length: references },
            (_, index) => `<IMAGE_REF_${index}>@Image${index + 2}`
          ).join(" ")}]`,
        ]
      : []),
  ].join(" ")
  const middle = person
    ? [
        person.lines.join("\n"),
        ...(person.references ? [videoReferenceLine(person.references)] : []),
      ]
    : []
  const rule = references
    ? "Use Image1 as the exact first frame. Use the reference images as references only, never as frames. Do not add captions or on-screen text."
    : "Use Image1 as the exact first frame. Do not add captions or on-screen text."
  return `${tags}\n\n${styledPrompt({ style }, [direction, ...middle, rule].join("\n\n"))}`
}

/**
 * The request that starts one piece on Omni Flash: the first frame, then the
 * reference pictures, then the words. It runs in the background on Google's
 * side and is checked on later passes. The shape is asked for natively, 9:16
 * included, and the size is the one picked.
 */
export function omniRequestBody(options: {
  prompt: string
  firstFrame: InlinePicture
  references: InlinePicture[]
  aspectRatio: AssetAspectRatio
  quality: VideoQuality
  seconds: number
}) {
  const picture = (item: InlinePicture) => ({
    type: "image",
    data: item.data,
    mime_type: item.mimeType,
  })
  return {
    model: VIDEO_MODEL,
    input: [
      picture(options.firstFrame),
      ...options.references.map(picture),
      { type: "text", text: options.prompt },
    ],
    response_format: {
      type: "video",
      aspect_ratio: options.aspectRatio,
      resolution: options.quality,
      duration: `${options.seconds}s`,
    },
    background: true,
  }
}

/** A piece after the first is "waiting" until the piece before it is ready. */
export type PieceStatus = "waiting" | "queued" | "processing" | "ready" | "error"
export type GenerationStatus = Exclude<PieceStatus, "waiting">

export type GenerationPiece = {
  id: string
  prompt: string
  duration_seconds: VideoDurationSeconds
  status: PieceStatus
  /** The finished clip as the Media panel hands it out, so it can be dragged. */
  output: VideoMediaItem | null
  error_message: string | null
}

/** One shot: a single clip, or up to four pieces that play back to back. */
export type GenerationItem = {
  id: string
  /** The AI clip panel's first frame it was made from. Null on a shot made from a picture on the timeline. */
  first_frame_id: string | null
  /** The timeline picture a shot replaces, and that picture's file. Null on a shot made in the AI clip panel. */
  clip: { id: string; still_media_id: string | null } | null
  /** When Make the shot was pressed, so a row can say how long it has taken. */
  created_at: string
  aspect_ratio: AssetAspectRatio
  duration_seconds: number
  status: GenerationStatus
  error_message: string | null
  pieces: GenerationPiece[]
  /** The model in plain words: "Omni Flash", or "Veo 3.1" on a shot asked for before the switch. */
  model_name: string
  /** The size in plain words, such as "Normal 720p". */
  quality: string
  /** What Google has been paid for the pieces made so far, in cents. */
  charged_cents: number
  /** What the whole shot is expected to cost, in cents. */
  expected_cents: number
  /** The actor the shot was told about. Null on shots asked for before 19 Oct 2026. */
  actor_name: string | null
  /** How many pictures went on the person board, 0 when only words were sent. */
  board_pictures: number
  /** The extras sent, by their names today. */
  extras: string[]
}

/** Actor and extra names for a list of shots, read once for all of them. */
export type ShotNames = {
  actors: { id: string; name: string }[]
  extras: { id: string; name: string }[]
  /** What the meter holds for each shot, in cents, by shot id. */
  charged: Map<string, number>
}

/** Google's answer about one piece, as much of it as is read. */
type OmniInteraction = {
  id?: string
  status?: string
  error?: { message?: string }
  steps?: Array<{
    type?: string
    content?: Array<{ type?: string; data?: string; uri?: string; mime_type?: string }>
  }>
  usage?: {
    total_input_tokens?: number
    total_output_tokens?: number
    total_thought_tokens?: number
  }
}

export type GenerationJoin = {
  generation: VideoAiGenerationRow
  output: typeof customShellMedia.$inferSelect | null
}

async function serializePiece(row: GenerationJoin): Promise<GenerationPiece> {
  return {
    id: row.generation.id,
    prompt: row.generation.prompt,
    duration_seconds: row.generation.durationSeconds as VideoDurationSeconds,
    status: row.generation.status as PieceStatus,
    output: row.output ? (await serializeVideoMedia([row.output]))[0] : null,
    error_message: row.generation.errorMessage,
  }
}

/**
 * A shot is ready when every piece is and failed when any piece failed. Once
 * one piece has been made it counts as generating until then, even in the
 * moment its next piece is queued. `rows` is one shot's pieces in order.
 */
export async function shotNames(userId: string, rows: GenerationJoin[]): Promise<ShotNames> {
  const actorIds = [
    ...new Set(rows.flatMap((row) => (row.generation.actorId ? [row.generation.actorId] : []))),
  ]
  const shotIds = [...new Set(rows.map((row) => row.generation.shotId))]
  const [actors, extras, charged] = await Promise.all([
    actorIds.length
      ? db
          .select({ id: videoActors.id, name: videoActors.name })
          .from(videoActors)
          .where(and(eq(videoActors.userId, userId), inArray(videoActors.id, actorIds)))
      : [],
    extrasByIds(
      userId,
      rows.flatMap((row) => row.generation.extras.map((extra) => extra.extra_id))
    ),
    chargedByShot(userId, shotIds),
  ])
  return { actors, extras, charged }
}

/**
 * What each shot has cost so far, read off the AI meter, which records every
 * piece's charge with its shot's id when the piece arrives. The meter is the
 * record of what was paid, so nothing is copied onto the shot itself.
 */
async function chargedByShot(userId: string, shotIds: string[]) {
  const charged = new Map<string, number>()
  if (!shotIds.length) return charged
  const shotId = sql<string>`${customShellAiUsageEvents.metadata} ->> 'shotId'`
  const rows = await db
    .select({
      shotId,
      cents: sql<number>`coalesce(sum(${customShellAiUsageEvents.costCents}), 0)::int`,
    })
    .from(customShellAiUsageEvents)
    .where(
      and(
        eq(customShellAiUsageEvents.userId, userId),
        eq(customShellAiUsageEvents.feature, "video-generation"),
        inArray(shotId, shotIds)
      )
    )
    .groupBy(shotId)
  for (const row of rows) charged.set(row.shotId, row.cents)
  return charged
}

export async function serializeShot(
  rows: GenerationJoin[],
  names: ShotNames
): Promise<GenerationItem> {
  const [first] = rows
  const pieces = await Promise.all(rows.map(serializePiece))
  const failed = pieces.find((piece) => piece.status === "error")
  const status: GenerationStatus = failed
    ? "error"
    : pieces.length === first.generation.shotPieces &&
        pieces.every((piece) => piece.status === "ready")
      ? "ready"
      : pieces.some((piece) => piece.status === "processing" || piece.status === "ready")
        ? "processing"
        : "queued"
  return {
    id: first.generation.shotId,
    first_frame_id: first.generation.firstFrameId,
    clip: first.generation.clipId
      ? { id: first.generation.clipId, still_media_id: first.generation.firstFrameMediaId }
      : null,
    created_at: first.generation.createdAt.toISOString(),
    aspect_ratio: first.generation.aspectRatio as AssetAspectRatio,
    duration_seconds: pieces.reduce((sum, piece) => sum + piece.duration_seconds, 0),
    status,
    error_message: failed?.error_message ?? null,
    pieces,
    model_name: videoModelName(first.generation.model),
    quality: videoQualityName(first.generation.resolution),
    charged_cents: names.charged.get(first.generation.shotId) ?? 0,
    expected_cents: rows.reduce(
      (sum, row) =>
        sum + pieceCostCents(row.generation.model, row.generation.durationSeconds),
      0
    ),
    actor_name:
      names.actors.find((actor) => actor.id === first.generation.actorId)?.name ?? null,
    board_pictures: boardPictureIds(first.generation).length,
    extras: describeExtras(first.generation.extras, names.extras),
  }
}

/** The Media ids on a piece's person board: its references bar the backdrop. */
function boardPictureIds(
  generation: Pick<VideoAiGenerationRow, "referenceMediaIds" | "extras">
) {
  const backdrop = generation.extras.find((extra) => extra.kind === "backdrop")
  return generation.referenceMediaIds.filter((id) => id !== backdrop?.media_id)
}

export function generationRows(
  userId: string,
  where: { projectId: string } | { shotId: string }
) {
  return db
    .select({ generation: videoAiGenerations, output: outputMedia })
    .from(videoAiGenerations)
    .leftJoin(
      outputMedia,
      and(
        eq(videoAiGenerations.outputMediaId, outputMedia.id),
        eq(outputMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        "projectId" in where
          ? eq(videoAiGenerations.projectId, where.projectId)
          : eq(videoAiGenerations.shotId, where.shotId)
      )
    )
}

export function groupShots(rows: GenerationJoin[]) {
  const shots = new Map<string, GenerationJoin[]>()
  for (const row of rows) {
    const shot = shots.get(row.generation.shotId)
    if (shot) shot.push(row)
    else shots.set(row.generation.shotId, [row])
  }
  return [...shots.values()]
}

/** This project's shots, newest first, each shot's pieces in the order they play. */
export async function listGenerations(userId: string, projectId: string) {
  await getOwnedProject(userId, projectId)
  const rows = await generationRows(userId, { projectId }).orderBy(
    desc(videoAiGenerations.createdAt),
    asc(videoAiGenerations.shotId),
    asc(videoAiGenerations.shotIndex)
  )
  const [names, defaults] = await Promise.all([shotNames(userId, rows), getAiDefaults()])
  return {
    generations: await Promise.all(
      groupShots(rows).map((shot) => serializeShot(shot, names))
    ),
    /** The size the last shot was made at, which the next one starts on. */
    quality: defaults.videoQuality ?? DEFAULT_VIDEO_QUALITY,
  }
}

export async function getShot(userId: string, shotId: string) {
  const rows = await generationRows(userId, { shotId }).orderBy(
    asc(videoAiGenerations.shotIndex)
  )
  if (!rows.length) throw new Error("AI video generation not found")
  return rows
}

/**
 * What this person has being made right now. A shot counts while one of its
 * pieces is queued or processing, and the pieces waiting behind it will be
 * paid for too as they arrive. A shot stopped by a failed piece counts for
 * nothing until Try again.
 */
async function shotsBeingMade(userId: string, projectId: string) {
  const rows = await db
    .select({
      projectId: videoAiGenerations.projectId,
      shotId: videoAiGenerations.shotId,
      model: videoAiGenerations.model,
      durationSeconds: videoAiGenerations.durationSeconds,
      status: videoAiGenerations.status,
    })
    .from(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        inArray(videoAiGenerations.status, ["waiting", "queued", "processing"])
      )
    )
  const running = rows.filter((row) => row.status !== "waiting")
  const runningShots = new Set(running.map((row) => row.shotId))
  const owed = rows.filter((row) => runningShots.has(row.shotId))
  const cents = (list: typeof rows) =>
    list.reduce((sum, row) => sum + pieceCostCents(row.model, row.durationSeconds), 0)
  return {
    projectShots: running.filter((row) => row.projectId === projectId).length,
    personShots: running.length,
    projectCents: cents(owed.filter((row) => row.projectId === projectId)),
    personCents: cents(owed),
  }
}

/**
 * Refuses a shot that would pass the caps on shots at once, the monthly
 * allowance or the project's spend limit. Shots already being made are not
 * on the meter until they arrive, so the money checks add them in; otherwise
 * three presses in a row would each see the same untouched balance.
 */
export async function requireRoomForShot(userId: string, projectId: string, nextCents: number) {
  const making = await shotsBeingMade(userId, projectId)
  if (making.projectShots >= SHOTS_AT_ONCE_PER_PROJECT) {
    throw new Error(PROJECT_SHOTS_FULL_MESSAGE)
  }
  if (making.personShots >= SHOTS_AT_ONCE_PER_PERSON) {
    throw new Error(PERSON_SHOTS_FULL_MESSAGE)
  }
  await checkAiAllowance(userId)
  const allowanceCents = await getAiAllowanceCents(userId)
  if (allowanceCents !== null) {
    const leftCents =
      allowanceCents - (await aiMonthSpendCents(userId, aiUsageMonthStart(now())))
    if (making.personCents + nextCents > leftCents) {
      throw new Error(
        shotAllowanceShortMessage({
          leftCents,
          generatingCents: making.personCents,
          nextCents,
        })
      )
    }
  }
  await requireProjectBudget(userId, projectId, nextCents, db, making.projectCents)
}

/**
 * The database refuses a shot past the caps too (migration 0117), for two
 * presses that land together and both pass the check above. Its refusal
 * carries the same sentence, which drizzle wraps in a "Failed query" error.
 */
export function rethrowShotsFull(error: unknown): never {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (
      current.message === PROJECT_SHOTS_FULL_MESSAGE ||
      current.message === PERSON_SHOTS_FULL_MESSAGE
    ) {
      throw new Error(current.message)
    }
    current = current.cause
  }
  throw error
}

export async function createGeneration(
  userId: string,
  payload: {
    projectId: string
    firstFrameId: string
    prompts: string[]
    lengthSeconds: ShotLengthSeconds
    quality: VideoQuality
  }
) {
  const pieces = shotPieces(payload.lengthSeconds)
  if (payload.prompts.length !== pieces.count) {
    throw new Error("Write one direction for each piece of the shot")
  }
  const prompts = payload.prompts.map(assetPrompt)
  const project = await getOwnedProject(userId, payload.projectId)

  const [frame] = await db
    .select({
      frame: videoFirstFrames,
      media: customShellMedia,
      actorMainMediaId: videoActors.imageMediaId,
    })
    .from(videoFirstFrames)
    .innerJoin(
      customShellMedia,
      and(
        eq(videoFirstFrames.imageMediaId, customShellMedia.id),
        eq(customShellMedia.userId, userId)
      )
    )
    .innerJoin(
      videoActors,
      and(
        eq(videoFirstFrames.actorId, videoActors.id),
        eq(videoActors.userId, userId)
      )
    )
    .where(
      and(
        eq(videoFirstFrames.id, payload.firstFrameId),
        eq(videoFirstFrames.userId, userId),
        // A first frame belongs to one project and only makes clips there.
        eq(videoFirstFrames.projectId, project.id)
      )
    )
    .limit(1)
  if (!frame) throw new Error("First frame not found")
  if (frame.media.fileType !== "image") throw new Error("First frame is not an image")
  if (!(await getAiKey("gemini"))) {
    throw new Error("Add a Google Gemini key in Settings first")
  }
  await requireRoomForShot(userId, project.id, shotCostCents(payload.lengthSeconds))

  // Each piece is sent what the frame was made from: the actor's angles and
  // the extras worn or held on one board, then the backdrop. A frame made
  // before its angles were written down is sent the actor's main picture.
  const sentExtras = sendingOrder(frame.frame.extras)
  const backdrop = sentExtras.find((extra) => extra.kind === "backdrop")
  const referenceMediaIds = [
    ...(frame.frame.actorMediaIds.length
      ? frame.frame.actorMediaIds
      : [frame.actorMainMediaId]),
    ...sentExtras
      .filter((extra) => extra.kind !== "backdrop")
      .map((extra) => extra.media_id),
    ...(backdrop ? [backdrop.media_id] : []),
  ]
  // The next shot starts on this size. Saved before the shot is written, so
  // a save that fails never leaves a shot made behind an error.
  await saveAiDefaults({ videoQuality: payload.quality })

  const at = now()
  const shotId = uuid()
  // Every piece is written now, so the directions are kept. Only the first
  // has a starting picture; each later one gets the last frame of the piece
  // before it once that piece is ready.
  const created = await db
    .insert(videoAiGenerations)
    .values(
      prompts.map((prompt, index) => ({
        id: index === 0 ? shotId : uuid(),
        userId,
        projectId: payload.projectId,
        firstFrameId: frame.frame.id,
        firstFrameMediaId: index === 0 ? frame.media.id : null,
        prompt,
        model: VIDEO_MODEL,
        aspectRatio: frame.frame.aspectRatio,
        durationSeconds: pieces.seconds,
        resolution: payload.quality,
        shotId,
        shotIndex: index + 1,
        shotPieces: pieces.count,
        status: index === 0 ? "queued" : "waiting",
        attempts: 0,
        actorId: frame.frame.actorId,
        referenceMediaIds,
        extras: sentExtras,
        createdAt: at,
        updatedAt: at,
      }))
    )
    .returning()
    .catch(rethrowShotsFull)
  const rows = created.map((generation) => ({ generation, output: null }))
  return await serializeShot(rows, await shotNames(userId, rows))
}

/** Runs a shot's failed piece again. The pieces after it carry on from there. */
export async function retryGeneration(userId: string, shotId: string) {
  const failed = and(
    eq(videoAiGenerations.shotId, shotId),
    eq(videoAiGenerations.userId, userId),
    eq(videoAiGenerations.status, "error")
  )
  const [piece] = await db
    .select({ projectId: videoAiGenerations.projectId })
    .from(videoAiGenerations)
    .where(failed)
    .limit(1)
  if (!piece) throw new Error("Only failed generations can be retried")
  // The failed piece and every piece waiting behind it will be paid for, on
  // today's model even when the shot was asked for on Veo.
  const left = await db
    .select({ durationSeconds: videoAiGenerations.durationSeconds })
    .from(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.shotId, shotId),
        eq(videoAiGenerations.userId, userId),
        inArray(videoAiGenerations.status, ["error", "waiting"])
      )
    )
  await requireRoomForShot(
    userId,
    piece.projectId,
    left.reduce((sum, row) => sum + pieceCostCents(VIDEO_MODEL, row.durationSeconds), 0)
  )
  const [updated] = await db
    .update(videoAiGenerations)
    .set({
      status: "queued",
      operationName: null,
      leaseToken: null,
      leaseExpiresAt: null,
      outputMediaId: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: now(),
    })
    .where(failed)
    .returning({ id: videoAiGenerations.id })
    .catch(rethrowShotsFull)
  if (!updated) throw new Error("Only failed generations can be retried")
  const rows = await getShot(userId, shotId)
  return await serializeShot(rows, await shotNames(userId, rows))
}

/** Deletes whole shots, every piece of each. */
export async function deleteGenerations(userId: string, shotIds: string[]) {
  const ids = [...new Set(shotIds)]
  if (!ids.length) return { deleted_ids: [] as string[] }
  const active = await db
    .select({ id: videoAiGenerations.id })
    .from(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        inArray(videoAiGenerations.shotId, ids),
        inArray(videoAiGenerations.status, ["queued", "processing"])
      )
    )
    .limit(1)
  if (active.length) {
    throw new Error("A video that is still generating cannot be deleted")
  }
  const rows = await db
    .delete(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        inArray(videoAiGenerations.shotId, ids),
        inArray(videoAiGenerations.status, ["waiting", "ready", "error"])
      )
    )
    .returning({ shotId: videoAiGenerations.shotId })
  return { deleted_ids: [...new Set(rows.map((row) => row.shotId))] }
}

async function failJob(job: ClaimedGeneration, error: unknown) {
  const message = error instanceof Error ? error.message : "AI video generation failed"
  const [failed] = await db
    .update(videoAiGenerations)
    .set({
      status: "error",
      leaseToken: null,
      leaseExpiresAt: null,
      errorMessage: message.slice(0, 500),
      updatedAt: now(),
      finishedAt: now(),
    })
    .where(
      and(
        eq(videoAiGenerations.id, job.id),
        eq(videoAiGenerations.status, "processing"),
        eq(videoAiGenerations.leaseToken, job.leaseToken)
      )
    )
    .returning({ id: videoAiGenerations.id })
  if (!failed) return
  await recordAiUsage({
    userId: job.userId,
    provider: "gemini",
    model: VIDEO_MODEL,
    feature: "video-generation",
    inputTokens: 0,
    outputTokens: 0,
    status: isAiLimitError(error) ? "blocked" : "failed",
    metadata: {
      ...projectSpendMetadata(job.projectId),
      generationId: job.id,
      error: message,
    },
  })
}

async function startJob(job: ClaimedGeneration) {
  try {
    await checkAiAllowance(job.userId)
    const apiKey = await getAiKey("gemini")
    if (!apiKey) throw new Error("Add a Google Gemini key in Settings first")
    const [frame] = await db
      .select({ media: customShellMedia })
      .from(customShellMedia)
      .where(
        and(
          eq(customShellMedia.id, job.firstFrameMediaId ?? ""),
          eq(customShellMedia.userId, job.userId)
        )
      )
      .limit(1)
    if (!frame) throw new Error("First frame image is missing")
    const style = await readProjectStyle(job.userId, job.projectId)
    const person = job.actorId ? await personFor(job) : null
    const object = await getFromR2(frame.media.storagePath)
    const bytes = await object.Body?.transformToByteArray()
    if (!bytes?.byteLength) throw new Error("First frame image could not be read")
    // A picture from the timeline is the person's own file, at any size and
    // in any format, so it goes as a JPEG of at most 1536 pixels. A first
    // frame from the AI clip panel goes exactly as it was made.
    const firstFrame =
      job.clipId && job.shotIndex === 1
        ? await shrinkReference(bytes)
        : { bytes, mimeType: frame.media.mimeType }
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(
          omniRequestBody({
            prompt: videoPrompt(style, job.prompt, person?.prompt),
            firstFrame: {
              mimeType: firstFrame.mimeType,
              data: Buffer.from(firstFrame.bytes).toString("base64"),
            },
            references: person?.referenceImages ?? [],
            aspectRatio: job.aspectRatio as AssetAspectRatio,
            quality: job.resolution as VideoQuality,
            seconds: job.durationSeconds,
          })
        ),
      }
    )
    if (response.status === 429) await refuseFreeKey(response)
    if (
      response.status === 429 &&
      now().getTime() - (job.startedAt ?? job.updatedAt).getTime() < JOB_TIMEOUT_MS
    ) {
      // Google limits how many videos start a minute. Several shots asked
      // for together can meet that limit, so the piece waits its turn and
      // starts on a later pass rather than failing.
      await requeueJob(job)
      return
    }
    if (!response.ok) {
      const detail = providerMessage(await response.text())
      throw new Error(`Google could not start the video${detail ? `: ${detail}` : "."}`)
    }
    const interaction = (await response.json()) as OmniInteraction
    if (!interaction.id) throw new Error("Google did not return a video job")
    const [updated] = await db
      .update(videoAiGenerations)
      .set({
        operationName: interaction.id,
        // A piece asked for on Veo before the switch is made on Omni Flash.
        model: VIDEO_MODEL,
        leaseToken: null,
        leaseExpiresAt: null,
        // Google's 15 minutes count from here, not from a wait in the queue.
        startedAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(videoAiGenerations.id, job.id),
          eq(videoAiGenerations.status, "processing"),
          eq(videoAiGenerations.leaseToken, job.leaseToken)
        )
      )
      .returning({ id: videoAiGenerations.id })
    if (!updated) {
      throw new Error("The video job lease expired before Google accepted it")
    }
  } catch (error) {
    await failJob(job, error)
  }
}

/**
 * The words and reference pictures for a piece made from an actor's frame.
 * The descriptions are read as they are now; the pictures are the ones the
 * frame recorded. A picture deleted from Media since is left out, a person
 * board left with one picture sends that picture alone, and with no picture
 * of the person left the backdrop is not sent either.
 */
async function personFor(job: ClaimedGeneration) {
  const [actor] = await db
    .select({ prompt: videoActors.prompt })
    .from(videoActors)
    .where(and(eq(videoActors.id, job.actorId ?? ""), eq(videoActors.userId, job.userId)))
    .limit(1)
  const extras = await extrasByIds(
    job.userId,
    job.extras.map((extra) => extra.extra_id)
  )
  const lines = [
    ...(actor ? [personLine(actor.prompt)] : []),
    ...sendingOrder(job.extras).flatMap((sent) => {
      const extra = extras.find((candidate) => candidate.id === sent.extra_id)
      return extra ? [extraLine(sent.kind, extra.prompt)] : []
    }),
  ]

  const backdropId = job.extras.find((extra) => extra.kind === "backdrop")?.media_id
  const stored = job.referenceMediaIds.length
    ? await db
        .select()
        .from(customShellMedia)
        .where(
          and(
            eq(customShellMedia.userId, job.userId),
            eq(customShellMedia.fileType, "image"),
            inArray(customShellMedia.id, job.referenceMediaIds)
          )
        )
    : []
  const tiles = boardPictureIds(job).flatMap(
    (id) => stored.find((media) => media.id === id) ?? []
  )
  const backdrop = stored.find((media) => media.id === backdropId)
  const pictures: Uint8Array[] = []
  if (tiles.length > 1) pictures.push((await buildPersonBoard(tiles)).bytes)
  else if (tiles.length === 1) pictures.push(await readStoredPicture(tiles[0].storagePath))
  if (backdrop && tiles.length) {
    pictures.push(await readStoredPicture(backdrop.storagePath))
  }
  const referenceImages = await Promise.all(
    pictures.map(async (picture): Promise<InlinePicture> => {
      const shrunk = await shrinkReference(picture)
      return {
        mimeType: shrunk.mimeType,
        data: Buffer.from(shrunk.bytes).toString("base64"),
      }
    })
  )
  return {
    prompt: {
      lines,
      references: tiles.length
        ? { board: tiles.length > 1, backdrop: Boolean(backdrop) }
        : null,
    } satisfies ShotPerson,
    referenceImages,
  }
}

async function readBytes(response: Response, limit = MAX_VIDEO_BYTES) {
  const declared = Number(response.headers.get("content-length") ?? 0)
  if (declared > limit) throw new Error("Google returned a video larger than 100MB")
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Google returned an empty video")
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new Error("Google returned a video larger than 100MB")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (!bytes.byteLength) throw new Error("Google returned an empty video")
  return bytes
}

/** The finished clip in Google's answer: inline as base64, or an address. */
function videoPart(interaction: OmniInteraction) {
  for (const step of interaction.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part.type === "video" && (part.data || part.uri)) return part
    }
  }
  return null
}

/**
 * The tokens Google counted for a finished piece. Thinking is billed as
 * output. An answer with no count is charged what the seconds are expected
 * to cost, so a piece is never free on the meter.
 */
function omniUsage(interaction: OmniInteraction, seconds: number) {
  const output =
    (interaction.usage?.total_output_tokens ?? 0) +
    (interaction.usage?.total_thought_tokens ?? 0)
  if (!output) return { inputTokens: 0, outputTokens: videoTokens(seconds) }
  return { inputTokens: interaction.usage?.total_input_tokens ?? 0, outputTokens: output }
}

/** Reads the clip's bytes out of a finished answer. */
async function videoBytes(interaction: OmniInteraction, apiKey: string) {
  const part = videoPart(interaction)
  if (!part) throw new Error("Google finished without returning a video")
  if (part.data) {
    const video = new Uint8Array(Buffer.from(part.data, "base64"))
    if (video.byteLength > MAX_VIDEO_BYTES) {
      throw new Error("Google returned a video larger than 100MB")
    }
    if (!video.byteLength) throw new Error("Google returned an empty video")
    return video
  }
  const url = new URL(part.uri ?? "")
  if (url.protocol !== "https:" || url.hostname !== "generativelanguage.googleapis.com") {
    throw new Error("Google returned an invalid video address")
  }
  const download = await fetch(url, {
    headers: { "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(VIDEO_DOWNLOAD_TIMEOUT_MS),
  })
  if (!download.ok) {
    throw new Error(`Google could not download the video: ${providerMessage(await download.text())}`)
  }
  return await readBytes(download)
}

/**
 * The very last frame of a finished piece, as a PNG, for the next piece to
 * start from. `-sseof -1` reads only the final second, and `-update 1` keeps
 * overwriting one picture, so the frame left behind is the last one.
 */
async function lastFrame(video: Uint8Array) {
  const dir = await mkdtemp(path.join(tmpdir(), "video-shot-frame-"))
  try {
    const source = path.join(dir, "piece.mp4")
    const frame = path.join(dir, "last.png")
    await writeFile(source, video)
    await runFfmpeg(
      ["-sseof", "-1", "-i", source, "-update", "1", frame],
      "The last frame of the clip could not be read, so the next piece cannot start. Retry it."
    )
    return new Uint8Array(await readFile(frame))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * A 429 is usually Google asking to be asked less often, which is waited
 * out. A free Gemini key gets the same 429 with a limit of 0, which no wait
 * ever lifts: Google can accept the piece and then refuse every check on it,
 * so the piece would sit for 15 minutes and fail as "took longer". That one
 * fails at once, saying what to change. Reads a copy, so the caller can
 * still read the answer.
 */
async function refuseFreeKey(response: Response) {
  if (isFreeTierRefusal(providerMessage(await response.clone().text()))) {
    throw new Error(FREE_KEY_MESSAGE)
  }
}

/** Puts a piece Google was too busy to start back in the queue. */
async function requeueJob(job: ClaimedGeneration) {
  await db
    .update(videoAiGenerations)
    .set({ status: "queued", leaseToken: null, leaseExpiresAt: null, updatedAt: now() })
    .where(
      and(
        eq(videoAiGenerations.id, job.id),
        eq(videoAiGenerations.status, "processing"),
        eq(videoAiGenerations.leaseToken, job.leaseToken)
      )
    )
}

async function releaseJob(job: ClaimedGeneration) {
  await db
    .update(videoAiGenerations)
    .set({ leaseToken: null, leaseExpiresAt: null, updatedAt: now() })
    .where(
      and(
        eq(videoAiGenerations.id, job.id),
        eq(videoAiGenerations.status, "processing"),
        eq(videoAiGenerations.leaseToken, job.leaseToken)
      )
    )
}

async function pollJob(job: ClaimedGeneration) {
  let generatedMedia: Awaited<ReturnType<typeof saveGeneratedAsset>> | null = null
  let nextFrame: Awaited<ReturnType<typeof saveGeneratedAsset>> | null = null
  try {
    if (!job.operationName) {
      if (
        now().getTime() - (job.startedAt ?? job.updatedAt).getTime() > 60_000
      ) {
        throw new Error("The video job stopped before Google accepted it. Retry it.")
      }
      await releaseJob(job)
      return
    }
    if (
      now().getTime() - (job.startedAt ?? job.updatedAt).getTime() >
      JOB_TIMEOUT_MS
    ) {
      throw new Error("Google took longer than 15 minutes. Retry the video.")
    }
    // A Veo job still running when Omni Flash took over. Veo's own address
    // for it goes dark on 22 Oct 2026, so the piece is made again instead.
    if (job.operationName.startsWith("models/")) {
      throw new Error(
        "Google switched Veo off before this piece arrived. Press Try again to make it with Omni Flash."
      )
    }
    const apiKey = await getAiKey("gemini")
    if (!apiKey) throw new Error("Add a Google Gemini key in Settings first")
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(job.operationName)}`,
      {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(VIDEO_DOWNLOAD_TIMEOUT_MS),
      }
    )
    if (response.status === 429) {
      await refuseFreeKey(response)
      // Google limits how often it is asked. The piece is asked about again
      // on a later pass, inside the same 15 minutes.
      await releaseJob(job)
      return
    }
    if (!response.ok) {
      const detail = providerMessage(await response.text())
      throw new Error(`Google could not check the video${detail ? `: ${detail}` : "."}`)
    }
    // A finished answer carries the clip itself, so it is read with the same
    // size limit as a download.
    const interaction = JSON.parse(
      new TextDecoder().decode(await readBytes(response, MAX_ANSWER_BYTES))
    ) as OmniInteraction
    if (interaction.status === "in_progress") {
      await releaseJob(job)
      return
    }
    if (interaction.status !== "completed") {
      const detail = interaction.error?.message ?? interaction.status
      throw new Error(`Google could not generate the video${detail ? `: ${detail}` : "."}`)
    }
    const video = await videoBytes(interaction, apiKey)
    const hasNext = job.shotIndex < job.shotPieces
    // Taken before anything is saved, so a frame that cannot be read fails
    // this piece, whose Retry makes it again, rather than leaving a ready
    // piece with nothing for the next one to start from.
    const frameBytes = hasNext ? await lastFrame(video) : null
    generatedMedia = await saveGeneratedAsset({
      userId: job.userId,
      bytes: video,
      mimeType: "video/mp4",
      fileType: "video",
      name: "AI video",
    })
    if (frameBytes) {
      nextFrame = await saveGeneratedAsset({
        userId: job.userId,
        bytes: frameBytes,
        mimeType: "image/png",
        fileType: "image",
        name: `AI shot frame ${job.shotIndex}`,
      })
    }
    const finished = now()
    const outputId = generatedMedia.id
    const nextFrameId = nextFrame?.id ?? null
    const finishedJob = await db.transaction(async (tx) => {
      const [done] = await tx
        .update(videoAiGenerations)
        .set({
          status: "ready",
          leaseToken: null,
          leaseExpiresAt: null,
          outputMediaId: outputId,
          errorMessage: null,
          updatedAt: finished,
          finishedAt: finished,
        })
        .where(
          and(
            eq(videoAiGenerations.id, job.id),
            eq(videoAiGenerations.status, "processing"),
            eq(videoAiGenerations.leaseToken, job.leaseToken)
          )
        )
        .returning({ id: videoAiGenerations.id })
      // In the same step as the piece before turning ready, so a shot is
      // never left with a ready piece and nothing queued after it. This
      // runs second so the shot's place is free again, and a project
      // already making its most shots at once does not refuse it.
      if (done && nextFrameId) {
        await tx
          .update(videoAiGenerations)
          .set({ status: "queued", firstFrameMediaId: nextFrameId, updatedAt: finished })
          .where(
            and(
              eq(videoAiGenerations.shotId, job.shotId),
              eq(videoAiGenerations.shotIndex, job.shotIndex + 1),
              eq(videoAiGenerations.status, "waiting")
            )
          )
      }
      return done
    })
    if (!finishedJob) {
      await discardGeneratedAsset(generatedMedia)
      if (nextFrame) await discardGeneratedAsset(nextFrame)
      return
    }
    generatedMedia = null
    nextFrame = null
    await recordDeferredAiSuccess(
      {
        userId: job.userId,
        provider: "gemini",
        model: VIDEO_MODEL,
        feature: "video-generation",
        metadata: {
          ...projectSpendMetadata(job.projectId),
          generationId: job.id,
          shotId: job.shotId,
          resolution: job.resolution,
        },
      },
      omniUsage(interaction, job.durationSeconds)
    )
  } catch (error) {
    if (generatedMedia) await discardGeneratedAsset(generatedMedia)
    if (nextFrame) await discardGeneratedAsset(nextFrame)
    await failJob(job, error)
  }
}

async function claimQueuedJob(): Promise<ClaimedGeneration | null> {
  const [queued] = await db
    .select()
    .from(videoAiGenerations)
    .where(eq(videoAiGenerations.status, "queued"))
    .orderBy(asc(videoAiGenerations.createdAt))
    .limit(1)
  if (!queued) return null

  const leaseToken = uuid()
  const claimedAt = now()
  const [claimed] = await db
    .update(videoAiGenerations)
    .set({
      status: "processing",
      attempts: queued.attempts + 1,
      leaseToken,
      leaseExpiresAt: new Date(claimedAt.getTime() + JOB_LEASE_MS),
      startedAt: queued.startedAt ?? claimedAt,
      updatedAt: claimedAt,
    })
    .where(
      and(
        eq(videoAiGenerations.id, queued.id),
        eq(videoAiGenerations.status, "queued")
      )
    )
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

async function claimProcessingJob(): Promise<ClaimedGeneration | null> {
  const timestamp = now()
  const available = or(
    isNull(videoAiGenerations.leaseToken),
    lt(videoAiGenerations.leaseExpiresAt, timestamp)
  )
  const [processing] = await db
    .select()
    .from(videoAiGenerations)
    .where(and(eq(videoAiGenerations.status, "processing"), available))
    .orderBy(asc(videoAiGenerations.updatedAt))
    .limit(1)
  if (!processing) return null

  const leaseToken = uuid()
  const [claimed] = await db
    .update(videoAiGenerations)
    .set({
      leaseToken,
      leaseExpiresAt: new Date(timestamp.getTime() + JOB_LEASE_MS),
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(videoAiGenerations.id, processing.id),
        eq(videoAiGenerations.status, "processing"),
        available
      )
    )
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

/**
 * One worker pass. It starts at most one queued piece, so shots asked for
 * together reach Google a pass apart (Google limits starts a minute), and
 * asks after every running piece side by side. Each piece is still one
 * durable step under its own lease; running them together means a piece
 * whose download takes minutes holds up no other piece's check.
 */
export async function videoGenerationTick() {
  const queued = await claimQueuedJob()
  // Every piece is claimed before any step runs. A check that finished first
  // would hand its lease back and be claimed again in the same pass.
  const processing: ClaimedGeneration[] = []
  for (let checks = 0; checks < CHECKS_PER_PASS; checks += 1) {
    const job = await claimProcessingJob()
    if (!job) break
    processing.push(job)
  }
  await Promise.all([
    ...(queued ? [startJob(queued)] : []),
    ...processing.map(pollJob),
  ])
}
