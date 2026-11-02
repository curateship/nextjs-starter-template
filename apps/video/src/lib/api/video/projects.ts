import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  PROJECT_NAME_MAX,
  PROJECT_NAME_REQUIRED_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
} from "@/lib/video/projects"
import { FOLDER_NOT_FOUND_MESSAGE } from "@/lib/video/project-folders"
import {
  LOOK_PICTURE_NOT_AN_IMAGE_MESSAGE,
  MAX_STYLE_LENGTH,
} from "@/lib/video/visual-style"
import {
  VIDEO_NAME_REQUIRED_MESSAGE,
  VIDEO_NOT_FOUND_MESSAGE,
} from "@/lib/video/project-videos"
import {
  PROJECT_CONFLICT_MESSAGE,
  SAVED_TIMELINE_INVALID_MESSAGE,
} from "@/lib/video/timeline-schema"
import { userGet, userPost } from "@/server/guards"
import {
  createOwnedProject,
  deleteOwnedProjects,
  duplicateOwnedProject,
  listOwnedProjects,
  renameOwnedProject,
  saveOwnedProjectSettings,
  setProjectPinned,
  setProjectsArchived,
  summarizeProjectDelete,
  type ProjectActor,
  type ProjectDeleteSummary,
  type ProjectItem,
  type ProjectListResponse,
  type ProjectSource,
} from "@/server/video/projects"

/**
 * The studio's project endpoints: the projects table and what a project
 * holds for all its videos. A project's videos are in `project-videos.ts`.
 * Everything is per-person: a project belongs to whoever made it, and every
 * one of these carries the owner's id from the session rather than from the
 * request.
 */

export type {
  ProjectActor,
  ProjectDeleteSummary,
  ProjectItem,
  ProjectListResponse,
  ProjectSource,
}

const KNOWN_MESSAGES = new Set([
  PROJECT_NOT_FOUND_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
  PROJECT_NAME_REQUIRED_MESSAGE,
  PROJECT_CONFLICT_MESSAGE,
  SAVED_TIMELINE_INVALID_MESSAGE,
  LOOK_PICTURE_NOT_AN_IMAGE_MESSAGE,
  VIDEO_NOT_FOUND_MESSAGE,
  VIDEO_NAME_REQUIRED_MESSAGE,
])

export function getProjectErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "Project request failed."
}

const projectIdSchema = z.object({
  projectId: z.string().min(1).max(36),
})

const nameSchema = z.object({
  name: z.string().min(1).max(PROJECT_NAME_MAX),
})

// Absent = every project; null = those in no folder; an id = that folder.
const folderIdSchema = z.string().min(1).max(36).nullish()

const listSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    search: z.string().trim().max(120).default(""),
    folderId: folderIdSchema,
    archived: z.boolean().optional(),
    actorId: z.string().min(1).max(36).optional(),
  })
  .optional()

const listProjectsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }) => {
    return listOwnedProjects({
      userId: context.user.id,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? 24,
      search: data?.search,
      folderId: data?.folderId,
      archived: data?.archived,
      actorId: data?.actorId,
    })
  })

const createProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(nameSchema.extend({ folderId: folderIdSchema }))
  .handler(async ({ data, context }) => {
    return createOwnedProject(
      context.user.id,
      data.name,
      undefined,
      data.folderId ?? null
    )
  })

const duplicateProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema)
  .handler(async ({ data, context }) => {
    return duplicateOwnedProject(context.user.id, data.projectId)
  })

const renameProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema.extend({ name: nameSchema.shape.name }))
  .handler(async ({ data, context }) => {
    return renameOwnedProject(context.user.id, data.projectId, data.name)
  })

const deleteProjectsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      projectIds: z.array(z.string().min(1).max(36)).min(1).max(100),
      // Whether the projects' carousels go too; the delete window asks.
      deleteCarousels: z.boolean().default(false),
    })
  )
  .handler(async ({ data, context }) => {
    return deleteOwnedProjects(
      context.user.id,
      data.projectIds,
      undefined,
      data.deleteCarousels
    )
  })

const projectSettingsSchema = projectIdSchema.extend({
  name: nameSchema.shape.name,
  style: z.string().max(MAX_STYLE_LENGTH).nullable(),
  lookPictureUrl: z.string().url().max(2048).nullable(),
})

const saveProjectSettingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectSettingsSchema)
  .handler(async ({ data, context }) => {
    return saveOwnedProjectSettings(context.user.id, data.projectId, data)
  })

const projectIdsSchema = z.object({
  projectIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})

const archiveProjectsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdsSchema.extend({ archived: z.boolean() }))
  .handler(async ({ data, context }) => {
    return setProjectsArchived(context.user.id, data.projectIds, data.archived)
  })

const pinProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema.extend({ pinned: z.boolean() }))
  .handler(async ({ data, context }) => {
    return setProjectPinned(context.user.id, data.projectId, data.pinned)
  })

const deleteSummaryFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(projectIdsSchema)
  .handler(async ({ data, context }): Promise<ProjectDeleteSummary> => {
    return summarizeProjectDelete(context.user.id, data.projectIds)
  })

export function listProjects({
  page = 1,
  pageSize = 24,
  search,
  folderId,
  archived,
  actorId,
}: {
  page?: number
  pageSize?: number
  search?: string
  folderId?: string | null
  /** True lists only the archived ones. */
  archived?: boolean
  actorId?: string
} = {}) {
  return listProjectsFn({
    data: { page, pageSize, search, folderId, archived, actorId },
  })
}

/** Archives projects, or brings them back with `archived: false`. */
export function archiveProjects(projectIds: string[], archived: boolean) {
  return archiveProjectsFn({ data: { projectIds, archived } })
}

export function pinProject(projectId: string, pinned: boolean) {
  return pinProjectFn({ data: { projectId, pinned } })
}

/** How many videos, first frames, AI clips and exports go with these projects. */
export function loadProjectDeleteSummary(projectIds: string[]) {
  return deleteSummaryFn({ data: { projectIds } })
}

/**
 * A new project with its first video. `folderId` files it straight into that
 * folder.
 */
export function createProject(name: string, folderId?: string | null) {
  return createProjectFn({ data: { name, folderId } })
}

export function duplicateProject(projectId: string) {
  return duplicateProjectFn({ data: { projectId } })
}

export function renameProject(projectId: string, name: string) {
  return renameProjectFn({ data: { projectId, name } })
}

export function deleteProjects(projectIds: string[], deleteCarousels = false) {
  return deleteProjectsFn({ data: { projectIds, deleteCarousels } })
}

/** The name and the look, from the project's Settings window. */
export function saveProjectSettings(
  settings: z.infer<typeof projectSettingsSchema>
) {
  return saveProjectSettingsFn({ data: settings })
}
