import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  PROJECT_NAME_MAX,
  PROJECT_NAME_REQUIRED_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
} from "@/lib/video/projects"
import {
  PROJECT_CONFLICT_MESSAGE,
  SAVED_TIMELINE_INVALID_MESSAGE,
  timelineSchema,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { userGet, userPost } from "@/server/guards"
import {
  createOwnedProject,
  deleteOwnedProjects,
  duplicateOwnedProject,
  getOwnedProjectDetail,
  listOwnedProjects,
  renameOwnedProject,
  writeProjectTimeline,
  type ProjectDetail,
  type ProjectItem,
  type ProjectListResponse,
} from "@/server/video/projects"

/**
 * The studio's project endpoints. Everything is per-person — a project belongs
 * to whoever made it, and every one of these carries the owner's id from the
 * session rather than from the request.
 */

export type { ProjectDetail, ProjectItem, ProjectListResponse, ProjectTimeline }

const KNOWN_MESSAGES = new Set([
  PROJECT_NOT_FOUND_MESSAGE,
  PROJECT_NAME_REQUIRED_MESSAGE,
  PROJECT_CONFLICT_MESSAGE,
  SAVED_TIMELINE_INVALID_MESSAGE,
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

const listSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    search: z.string().trim().max(120).default(""),
  })
  .optional()

// The timeline is checked against the editor's own schema here, before it can
// reach the database: a save is the only way anything gets into that column.
const saveSchema = projectIdSchema.extend({
  timeline: timelineSchema,
  version: z.number().int().min(1),
})

const listProjectsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }) => {
    return listOwnedProjects({
      userId: context.user.id,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? 24,
      search: data?.search,
    })
  })

const getProjectFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(projectIdSchema)
  .handler(async ({ data, context }) => {
    return getOwnedProjectDetail(context.user.id, data.projectId)
  })

const createProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(nameSchema)
  .handler(async ({ data, context }) => {
    return createOwnedProject(context.user.id, data.name)
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
    z.object({ projectIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data, context }) => {
    return deleteOwnedProjects(context.user.id, data.projectIds)
  })

const saveProjectTimelineFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveSchema)
  .handler(async ({ data, context }) => {
    return writeProjectTimeline(
      context.user.id,
      data.projectId,
      data.timeline,
      data.version
    )
  })

export function listProjects({
  page = 1,
  pageSize = 24,
  search,
}: { page?: number; pageSize?: number; search?: string } = {}) {
  return listProjectsFn({ data: { page, pageSize, search } })
}

export function getProject(projectId: string) {
  return getProjectFn({ data: { projectId } })
}

export function createProject(name: string) {
  return createProjectFn({ data: { name } })
}

export function duplicateProject(projectId: string) {
  return duplicateProjectFn({ data: { projectId } })
}

export function renameProject(projectId: string, name: string) {
  return renameProjectFn({ data: { projectId, name } })
}

export function deleteProjects(projectIds: string[]) {
  return deleteProjectsFn({ data: { projectIds } })
}

export function saveProjectTimeline(
  projectId: string,
  timeline: ProjectTimeline,
  version: number
) {
  return saveProjectTimelineFn({ data: { projectId, timeline, version } })
}
