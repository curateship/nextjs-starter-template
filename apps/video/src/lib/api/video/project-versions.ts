import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  VERSION_NOT_FOUND_MESSAGE,
  VERSION_UNREADABLE_MESSAGE,
} from "@/lib/video/project-versions"
import { userGet, userPost } from "@/server/guards"
import {
  listOwnedProjectVersions,
  type ProjectVersionItem,
} from "@/server/video/project-versions"
import {
  getOwnedProjectVersion,
  restoreOwnedProjectVersion,
} from "@/server/video/projects"

/**
 * Project history endpoints (see `workspace/docs/project-history.md`). The
 * owner's id comes from the session; a version is only found through a
 * project that person owns.
 */

export type { ProjectVersionItem }

const KNOWN_MESSAGES = new Set([
  PROJECT_NOT_FOUND_MESSAGE,
  VERSION_NOT_FOUND_MESSAGE,
  VERSION_UNREADABLE_MESSAGE,
])

export function getProjectVersionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "Project history request failed."
}

const projectIdSchema = z.object({ projectId: z.string().min(1).max(36) })
const versionSchema = projectIdSchema.extend({
  versionId: z.string().min(1).max(36),
})

const listVersionsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(projectIdSchema)
  .handler(async ({ data, context }) => {
    return listOwnedProjectVersions(context.user.id, data.projectId)
  })

const getVersionFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(versionSchema)
  .handler(async ({ data, context }) => {
    return getOwnedProjectVersion(
      context.user.id,
      data.projectId,
      data.versionId
    )
  })

const restoreVersionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(versionSchema)
  .handler(async ({ data, context }) => {
    return restoreOwnedProjectVersion(
      context.user.id,
      data.projectId,
      data.versionId
    )
  })

/** The project's kept versions, newest first, without their timelines. */
export function listProjectVersions(projectId: string) {
  return listVersionsFn({ data: { projectId } })
}

/** One version with its timeline, to look at. Changes nothing. */
export function getProjectVersion(projectId: string, versionId: string) {
  return getVersionFn({ data: { projectId, versionId } })
}

/**
 * Keeps what the project holds now as "Before restoring" and returns the
 * chosen version's timeline for the editor to put on screen.
 */
export function restoreProjectVersion(projectId: string, versionId: string) {
  return restoreVersionFn({ data: { projectId, versionId } })
}
