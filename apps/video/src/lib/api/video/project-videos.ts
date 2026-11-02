import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PROJECT_SPEND_LIMIT_MAX_DOLLARS, type VideoSpend } from "@/lib/video/project-spend"
import {
  VIDEO_NAME_MAX,
  VIDEO_SORTS,
  VIDEO_STATUSES,
} from "@/lib/video/project-videos"
import {
  ASPECT_RATIOS,
  timelineSchema,
  type AspectRatio,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { userGet, userPost } from "@/server/guards"
import { editorGet, editorPost } from "@/server/video/editor-guards"
import {
  actorFor,
  actorForVideo,
  guestEditorName,
} from "@/server/video/project-guests"
import { readVideoSpend } from "@/server/video/project-spend"
import {
  createVideo,
  deleteVideos,
  duplicateVideo,
  keepRefusedVideoTimeline,
  listProjectVideos,
  moveVideos,
  openProjectVideo,
  personKey,
  rememberOpenVideo,
  renameVideo,
  saveVideoSpendLimit,
  setVideoPinned,
  setVideosArchived,
  setVideoStatus,
  summarizeVideoDelete,
  writeVideoTimeline,
  type VideoDeleteSummary,
  type VideoDetail,
  type VideoItem,
  type VideoListResponse,
} from "@/server/video/project-videos"
import { getOwnedProjectItem, type ProjectItem } from "@/server/video/projects"

/**
 * The endpoints for the videos in a project (`workspace/docs/project-videos.md`).
 * A guest sent from Project opens, lists and saves every video in the
 * project they were sent to; making, renaming, moving and deleting videos is
 * the owner's alone. Every call reads the owner from the session or the
 * guest's sign-in, never from the request.
 */

export type { VideoDeleteSummary, VideoDetail, VideoItem, VideoListResponse, VideoSpend }

const id = z.string().min(1).max(36)
const videoIdSchema = z.object({ videoId: id })
const videoIdsSchema = z.object({ videoIds: z.array(id).min(1).max(200) })

/**
 * What the editor opens with: the project and the video it lands on, or no
 * video when the project has none left.
 */
export type OpenedVideo = { project: ProjectItem; video: VideoDetail | null }

const openVideoFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: id, videoId: id.optional() }))
  .handler(async ({ data, context }): Promise<OpenedVideo> => {
    const actor = await actorFor(context.caller, data.projectId)
    const [project, video] = await Promise.all([
      getOwnedProjectItem(actor.userId, data.projectId),
      openProjectVideo({
        userId: actor.userId,
        projectId: data.projectId,
        videoId: data.videoId,
        person: personKey({ userId: actor.userId, guestId: actor.guest?.id ?? null }),
      }),
    ])
    return { project, video }
  })

const rememberVideoFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(videoIdSchema)
  .handler(async ({ data, context }) => {
    const actor = await actorForVideo(context.caller, data.videoId)
    await rememberOpenVideo(
      actor.userId,
      data.videoId,
      personKey({ userId: actor.userId, guestId: actor.guest?.id ?? null })
    )
  })

const listSchema = z.object({
  projectId: id,
  search: z.string().trim().max(120).default(""),
  sort: z.enum(VIDEO_SORTS).default("edited"),
  status: z.enum(VIDEO_STATUSES).optional(),
  archived: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
})

const listVideosFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }) => {
    const { userId } = await actorFor(context.caller, data.projectId)
    return listProjectVideos({ userId, ...data })
  })

const createVideoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      projectId: id,
      name: z.string().min(1).max(VIDEO_NAME_MAX),
      aspect: z.enum(ASPECT_RATIOS),
      status: z.enum(VIDEO_STATUSES),
    })
  )
  .handler(async ({ data, context }) => {
    const { projectId, ...video } = data
    return createVideo(context.user.id, projectId, video)
  })

const duplicateVideoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(videoIdSchema)
  .handler(async ({ data, context }) => {
    return duplicateVideo(context.user.id, data.videoId)
  })

const renameVideoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(videoIdSchema.extend({ name: z.string().min(1).max(VIDEO_NAME_MAX) }))
  .handler(async ({ data, context }) => {
    return renameVideo(context.user.id, data.videoId, data.name)
  })

const setStatusFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(videoIdSchema.extend({ status: z.enum(VIDEO_STATUSES) }))
  .handler(async ({ data, context }) => {
    return setVideoStatus(context.user.id, data.videoId, data.status)
  })

const pinVideoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(videoIdSchema.extend({ pinned: z.boolean() }))
  .handler(async ({ data, context }) => {
    return setVideoPinned(context.user.id, data.videoId, data.pinned)
  })

const archiveVideosFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(videoIdsSchema.extend({ archived: z.boolean() }))
  .handler(async ({ data, context }) => {
    return setVideosArchived(context.user.id, data.videoIds, data.archived)
  })

const moveVideosFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(videoIdsSchema.extend({ projectId: id }))
  .handler(async ({ data, context }) => {
    return moveVideos(context.user.id, data.videoIds, data.projectId)
  })

const deleteSummaryFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(videoIdsSchema)
  .handler(async ({ data, context }) => {
    return summarizeVideoDelete(context.user.id, data.videoIds)
  })

const deleteVideosFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(videoIdsSchema)
  .handler(async ({ data, context }) => {
    return deleteVideos(context.user.id, data.videoIds)
  })

// The timeline is checked against the editor's own schema here, before it can
// reach the database: a save is the only way anything gets into that column.
const saveTimelineFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    videoIdSchema.extend({ timeline: timelineSchema, version: z.number().int().min(1) })
  )
  .handler(async ({ data, context }) => {
    const { userId, guest } = await actorForVideo(context.caller, data.videoId)
    return writeVideoTimeline(
      userId,
      data.videoId,
      data.timeline,
      data.version,
      undefined,
      guestEditorName(guest)
    )
  })

const keepRefusedFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(videoIdSchema.extend({ timeline: timelineSchema }))
  .handler(async ({ data, context }) => {
    return keepRefusedVideoTimeline(context.user.id, data.videoId, data.timeline)
  })

const videoSpendFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(videoIdSchema)
  .handler(async ({ data, context }): Promise<VideoSpend> => {
    return readVideoSpend(context.user.id, data.videoId)
  })

const spendLimitFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    videoIdSchema.extend({
      spendLimitCents: z.number().int().min(1).max(PROJECT_SPEND_LIMIT_MAX_DOLLARS * 100).nullable(),
    })
  )
  .handler(async ({ data, context }) => {
    return saveVideoSpendLimit(context.user.id, data.videoId, data.spendLimitCents)
  })

/** The project and the video to open: the one named, else the remembered one. */
export function openVideo(projectId: string, videoId?: string) {
  return openVideoFn({ data: { projectId, videoId } })
}

/** Remembers the open video, so the project opens on it next time. */
export function rememberVideo(videoId: string) {
  return rememberVideoFn({ data: { videoId } })
}

export function listVideos(data: z.input<typeof listSchema>) {
  return listVideosFn({ data })
}

/** A new empty video, named and shaped in the New video popover. */
export function createProjectVideo(
  projectId: string,
  video: { name: string; aspect: AspectRatio; status: VideoItem["status"] }
) {
  return createVideoFn({ data: { projectId, ...video } })
}

export function duplicateProjectVideo(videoId: string) {
  return duplicateVideoFn({ data: { videoId } })
}

export function renameProjectVideo(videoId: string, name: string) {
  return renameVideoFn({ data: { videoId, name } })
}

export function setProjectVideoStatus(videoId: string, status: VideoItem["status"]) {
  return setStatusFn({ data: { videoId, status } })
}

export function pinProjectVideo(videoId: string, pinned: boolean) {
  return pinVideoFn({ data: { videoId, pinned } })
}

/** Archives videos, or brings them back with `archived: false`. */
export function archiveProjectVideos(videoIds: string[], archived: boolean) {
  return archiveVideosFn({ data: { videoIds, archived } })
}

export function moveProjectVideos(videoIds: string[], projectId: string) {
  return moveVideosFn({ data: { videoIds, projectId } })
}

/** How many videos and exports go with these videos. */
export function loadVideoDeleteSummary(videoIds: string[]) {
  return deleteSummaryFn({ data: { videoIds } })
}

export function deleteProjectVideos(videoIds: string[]) {
  return deleteVideosFn({ data: { videoIds } })
}

export function saveVideoTimeline(videoId: string, timeline: ProjectTimeline, version: number) {
  return saveTimelineFn({ data: { videoId, timeline, version } })
}

/** Keeps a refused save as a new video beside the original. */
export function keepRefusedTimeline(videoId: string, timeline: ProjectTimeline) {
  return keepRefusedFn({ data: { videoId, timeline } })
}

/** What this video has spent on AI so far, its limit, and the project's total. */
export function loadVideoSpend(videoId: string) {
  return videoSpendFn({ data: { videoId } })
}

export function saveSpendLimit(videoId: string, spendLimitCents: number | null) {
  return spendLimitFn({ data: { videoId, spendLimitCents } })
}
