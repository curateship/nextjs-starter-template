import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { VIDEO_NOT_FOUND_MESSAGE } from "@/lib/video/project-videos"
import {
  VERSION_NOT_FOUND_MESSAGE,
  VERSION_UNREADABLE_MESSAGE,
} from "@/lib/video/project-versions"
import { editorGet, editorPost } from "@/server/video/editor-guards"
import { actorForVideo } from "@/server/video/project-guests"
import {
  listOwnedVideoVersions,
  type ProjectVersionItem,
} from "@/server/video/project-versions"
import {
  getOwnedVideoVersion,
  restoreOwnedVideoVersion,
} from "@/server/video/project-videos"

/**
 * Video history endpoints (see `workspace/docs/project-history.md`). The
 * owner's id comes from the session; a version is only found through a
 * video that person owns.
 */

export type { ProjectVersionItem }

const KNOWN_MESSAGES = new Set([
  PROJECT_NOT_FOUND_MESSAGE,
  VIDEO_NOT_FOUND_MESSAGE,
  VERSION_NOT_FOUND_MESSAGE,
  VERSION_UNREADABLE_MESSAGE,
])

export function getProjectVersionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "Project history request failed."
}

const videoIdSchema = z.object({ videoId: z.string().min(1).max(36) })
const versionSchema = videoIdSchema.extend({
  versionId: z.string().min(1).max(36),
})

// A guest sent from Project may read and restore the history of any video
// in their project (`workspace/docs/project-guests.md`).
const listVersionsFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(videoIdSchema)
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return listOwnedVideoVersions(userId, data.videoId)
  })

const getVersionFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(versionSchema)
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return getOwnedVideoVersion(userId, data.videoId, data.versionId)
  })

const restoreVersionFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(versionSchema)
  .handler(async ({ data, context }) => {
    const { userId } = await actorForVideo(context.caller, data.videoId)
    return restoreOwnedVideoVersion(userId, data.videoId, data.versionId)
  })

/** The video's kept versions, newest first, without their timelines. */
export function listVideoVersions(videoId: string) {
  return listVersionsFn({ data: { videoId } })
}

/** One version with its timeline, to look at. Changes nothing. */
export function getVideoVersion(videoId: string, versionId: string) {
  return getVersionFn({ data: { videoId, versionId } })
}

/**
 * Keeps what the video holds now as "Before restoring" and returns the
 * chosen version's timeline for the editor to put on screen.
 */
export function restoreVideoVersion(videoId: string, versionId: string) {
  return restoreVersionFn({ data: { videoId, versionId } })
}
