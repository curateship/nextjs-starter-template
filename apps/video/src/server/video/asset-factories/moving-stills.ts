import { and, asc, eq, gte, inArray, isNotNull, isNull, notExists } from "drizzle-orm"

import {
  assetPrompt,
  DEFAULT_VIDEO_QUALITY,
  shotCostCents,
  shotPieces,
  VIDEO_MODEL,
  type ShotLengthSeconds,
  type VideoQuality,
} from "@/lib/video/asset-factories"
import { EDITOR_WINDOW_GONE_AFTER_MS } from "@/lib/video/editor-windows"
import {
  landMovingShot,
  MOVING_STILL_BUSY_MESSAGE,
  MOVING_STILL_NOT_FOUND_MESSAGE,
  MOVING_STILL_UNREADABLE_MESSAGE,
  stillRefusal,
  stillShotAspect,
  stillShotLengths,
  type ClipOutcome,
} from "@/lib/video/moving-still"
import { parseTimelineForReset } from "@/lib/video/timeline-schema"
import { getAiKey } from "@/server/ai/keys"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellMedia, customShellNotifications } from "@/server/schema"
import { attachPastedMediaToProject } from "@/server/video/media-list"
import { getOwnedProject, writeProjectTimeline } from "@/server/video/projects"
import { getAiDefaults, saveAiDefaults } from "@/server/video/settings"
import {
  videoAiGenerations,
  videoEditorWindows,
} from "@/server/video/schema"
import {
  generationRows,
  getShot,
  groupShots,
  requireRoomForShot,
  rethrowShotsFull,
  serializeShot,
  shotNames,
  type GenerationJoin,
} from "./generations"
import { pictureSize, readStoredPicture } from "./person-board"

/**
 * A picture on the timeline made to move where it sits
 * (`workspace/docs/animate-a-still.md`).
 *
 * The shot is an ordinary AI shot whose first frame is the picture, so the
 * background worker in generations.ts makes it like any other. What is
 * different is the end: a finished shot replaces the picture on the timeline
 * instead of waiting in the AI clip panel. An editor that has the project
 * open lands it itself, as one Undo step, so its saves never clash with the
 * worker's; with no editor open, `movingStillTick` lands it.
 */

/** How many finished shots one worker pass lands. */
const LANDINGS_PER_PASS = 10

/**
 * Asks for a moving shot of one picture clip. The picture is checked on the
 * saved timeline, so the editor saves first. An earlier try for the same
 * picture that failed is cleared, because the new one takes its marker.
 */
export async function createStillShot(
  userId: string,
  payload: {
    projectId: string
    clipId: string
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
  const { timeline } = parseTimelineForReset(project.timeline)
  const clip = timeline.tracks
    .flatMap((track) => track.clips)
    .find((candidate) => candidate.id === payload.clipId)
  if (!clip || clip.kind !== "image" || !clip.mediaId) {
    throw new Error(MOVING_STILL_NOT_FOUND_MESSAGE)
  }
  const refusal = stillRefusal(clip)
  if (refusal) throw new Error(refusal)
  if (!stillShotLengths(clip.durationMs).includes(payload.lengthSeconds)) {
    throw new Error("Pick a length at least as long as the picture")
  }
  const [media] = await db
    .select()
    .from(customShellMedia)
    .where(and(eq(customShellMedia.id, clip.mediaId), eq(customShellMedia.userId, userId)))
    .limit(1)
  if (!media || media.fileType !== "image") throw new Error(MOVING_STILL_NOT_FOUND_MESSAGE)

  const earlier = await db
    .select({
      shotId: videoAiGenerations.shotId,
      status: videoAiGenerations.status,
    })
    .from(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        eq(videoAiGenerations.projectId, project.id),
        eq(videoAiGenerations.clipId, clip.id),
        isNull(videoAiGenerations.clipOutcome)
      )
    )
  const failedShots = new Set(
    earlier.filter((row) => row.status === "error").map((row) => row.shotId)
  )
  if (earlier.some((row) => !failedShots.has(row.shotId))) {
    throw new Error(MOVING_STILL_BUSY_MESSAGE)
  }
  if (!(await getAiKey("gemini"))) {
    throw new Error("Add a Google Gemini key in Settings first")
  }
  await requireRoomForShot(userId, project.id, shotCostCents(payload.lengthSeconds))
  const size = await pictureSize(await readStoredPicture(media.storagePath)).catch(() => {
    throw new Error(MOVING_STILL_UNREADABLE_MESSAGE)
  })
  await saveAiDefaults({ videoQuality: payload.quality })

  const at = now()
  const shotId = uuid()
  const created = await db.transaction(async (tx) => {
    if (failedShots.size) {
      await tx
        .delete(videoAiGenerations)
        .where(
          and(
            eq(videoAiGenerations.userId, userId),
            inArray(videoAiGenerations.shotId, [...failedShots])
          )
        )
    }
    return await tx
      .insert(videoAiGenerations)
      .values(
        prompts.map((prompt, index) => ({
          id: index === 0 ? shotId : uuid(),
          userId,
          projectId: project.id,
          firstFrameId: null,
          firstFrameMediaId: index === 0 ? media.id : null,
          prompt,
          model: VIDEO_MODEL,
          aspectRatio: stillShotAspect(size.width, size.height, timeline.aspect),
          durationSeconds: pieces.seconds,
          resolution: payload.quality,
          shotId,
          shotIndex: index + 1,
          shotPieces: pieces.count,
          status: index === 0 ? "queued" : "waiting",
          attempts: 0,
          clipId: clip.id,
          clipStartMs: clip.startMs,
          clipDurationMs: clip.durationMs,
          createdAt: at,
          updatedAt: at,
        }))
      )
      .returning()
  }).catch(rethrowShotsFull)
  const rows = created.map((generation) => ({ generation, output: null }))
  return await serializeShot(rows, await shotNames(userId, rows))
}

/**
 * This project's shots made from pictures that have not landed yet: being
 * made, failed, or ready and waiting for the editor or the worker to land.
 */
export async function listStillShots(userId: string, projectId: string) {
  await getOwnedProject(userId, projectId)
  const rows = (
    await generationRows(userId, { projectId }).orderBy(
      asc(videoAiGenerations.shotId),
      asc(videoAiGenerations.shotIndex)
    )
  ).filter((row) => row.generation.clipId && !row.generation.clipOutcome)
  const [names, defaults] = await Promise.all([shotNames(userId, rows), getAiDefaults()])
  return {
    shots: await Promise.all(groupShots(rows).map((shot) => serializeShot(shot, names))),
    /** The size the last shot was made at, which the next one starts on. */
    quality: defaults.videoQuality ?? DEFAULT_VIDEO_QUALITY,
  }
}

/** Every piece of a shot ready, read from its rows in order. */
function readyPieces(rows: GenerationJoin[]) {
  const first = rows[0].generation
  if (rows.length !== first.shotPieces) return null
  if (!rows.every((row) => row.generation.status === "ready" && row.generation.outputMediaId)) {
    return null
  }
  return rows.map((row) => ({
    mediaId: row.generation.outputMediaId as string,
    durationMs: row.generation.durationSeconds * 1000,
  }))
}

/**
 * Records that the open editor has landed a finished shot, and puts its
 * clips on the project's Media panel so an Undo back to the picture never
 * loses them. Only one of the editor and the worker gets to land a shot:
 * `settled` is false when the other one already has.
 */
export async function settleStillShot(
  userId: string,
  shotId: string,
  outcome: ClipOutcome
) {
  const rows = await getShot(userId, shotId)
  const first = rows[0].generation
  const pieces = readyPieces(rows)
  if (!first.clipId || !pieces) throw new Error("This shot is not ready to land")
  const settled = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(videoAiGenerations)
      .set({ clipOutcome: outcome, updatedAt: now() })
      .where(
        and(
          eq(videoAiGenerations.userId, userId),
          eq(videoAiGenerations.shotId, shotId),
          isNull(videoAiGenerations.clipOutcome)
        )
      )
      .returning({ id: videoAiGenerations.id })
    if (!claimed.length) return false
    await attachPastedMediaToProject(
      userId,
      first.projectId,
      pieces.map((piece) => piece.mediaId),
      tx
    )
    return true
  })
  return { settled }
}

/**
 * Lands one finished shot with nobody editing the project: swaps the picture
 * for the shot and saves the project, as one change, in the same step that
 * marks the shot landed. A save that meets a newer version rolls the whole
 * step back, and the next pass tries again.
 */
async function landStillShot(userId: string, shotId: string) {
  const rows = await getShot(userId, shotId)
  const first = rows[0].generation
  const pieces = readyPieces(rows)
  if (!first.clipId || first.clipOutcome || !pieces) return

  const project = await getOwnedProject(userId, first.projectId)
  const { timeline } = parseTimelineForReset(project.timeline)
  const landed = landMovingShot(timeline.tracks, {
    clipId: first.clipId,
    stillMediaId: first.firstFrameMediaId,
    pieces,
    newId: uuid,
  })
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(videoAiGenerations)
      .set({ clipOutcome: landed.outcome, updatedAt: now() })
      .where(
        and(
          eq(videoAiGenerations.userId, userId),
          eq(videoAiGenerations.shotId, shotId),
          isNull(videoAiGenerations.clipOutcome)
        )
      )
      .returning({ id: videoAiGenerations.id })
    if (!row) return
    if (landed.outcome === "replaced") {
      await writeProjectTimeline(
        userId,
        project.id,
        { ...timeline, tracks: landed.tracks },
        project.version,
        tx
      )
    }
    await attachPastedMediaToProject(
      userId,
      project.id,
      pieces.map((piece) => piece.mediaId),
      tx
    )
    if (landed.outcome === "gone") {
      await tx.insert(customShellNotifications).values({
        id: uuid(),
        recipientUserId: userId,
        type: "app_activity",
        message: "A moving shot arrived after its picture was gone",
        detail: `The picture it was for was deleted from "${project.name}" while the shot was being made. The shot is in that project's Media panel.`,
        createdAt: now(),
      })
      await publishNotificationCreated(userId, tx)
    }
  })
}

/**
 * One worker pass: lands shots made from pictures once every piece is
 * ready. Pieces finish one after another, so a ready last piece means a
 * finished shot. A project a window is editing is passed over, because that
 * editor lands the shot itself, and passing it over here means a project
 * left open for hours never holds up anybody else's.
 */
export async function movingStillTick() {
  const editing = db
    .select({ windowId: videoEditorWindows.windowId })
    .from(videoEditorWindows)
    .where(
      and(
        eq(videoEditorWindows.projectId, videoAiGenerations.projectId),
        eq(videoEditorWindows.mode, "edit"),
        gte(
          videoEditorWindows.seenAt,
          new Date(now().getTime() - EDITOR_WINDOW_GONE_AFTER_MS)
        )
      )
    )
  const finished = await db
    .select({
      userId: videoAiGenerations.userId,
      shotId: videoAiGenerations.shotId,
    })
    .from(videoAiGenerations)
    .where(
      and(
        isNotNull(videoAiGenerations.clipId),
        isNull(videoAiGenerations.clipOutcome),
        eq(videoAiGenerations.status, "ready"),
        eq(videoAiGenerations.shotIndex, videoAiGenerations.shotPieces),
        notExists(editing)
      )
    )
    .orderBy(asc(videoAiGenerations.finishedAt))
    .limit(LANDINGS_PER_PASS)
  for (const shot of finished) {
    try {
      await landStillShot(shot.userId, shot.shotId)
    } catch (error) {
      // One project's save failing must not hold up the others. A clash
      // with a save made meanwhile is tried again on the next pass.
      console.error("A moving shot could not land yet", error)
    }
  }
}
