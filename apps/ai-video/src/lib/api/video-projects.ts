import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  ProjectDetail,
  ProjectItem,
  ProjectListResponse,
  ProjectTimeline,
} from "@/server/video-projects"

export type { ProjectDetail, ProjectItem, ProjectListResponse, ProjectTimeline }

// Bounded mirror of EditorClip — keeps persisted timelines within sane limits.
const clipSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["video", "audio", "image", "text"]),
  name: z.string().max(255),
  startMs: z.number().nonnegative().finite(),
  durationMs: z.number().nonnegative().finite(),
  trimStartMs: z.number().nonnegative().finite(),
  mediaId: z.string().max(36).optional(),
  url: z.string().max(2048).optional(),
  sourceDurationMs: z.number().nonnegative().finite().optional(),
  text: z.string().max(5000).optional(),
  fontSize: z.number().finite().optional(),
  color: z.string().max(32).optional(),
  // Template slot flags (see EditorClip).
  replaceable: z.boolean().optional(),
  segmentLabel: z.string().max(100).optional(),
})

const timelineSchema = z.object({
  tracks: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        muted: z.boolean(),
        clips: z.array(clipSchema).max(500),
      })
    )
    .max(50),
  aspect: z.enum(["16:9", "9:16", "1:1", "4:3"]),
})

const projectNameSchema = z.string().min(1).max(255)

const projectIdSchema = z.object({
  projectId: z.string().min(1).max(36),
})

const projectSafeErrorMessages = new Set([
  "Project name is required",
  "Project not found",
])

export function getProjectErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Project request failed."
  if (projectSafeErrorMessages.has(error.message)) return error.message
  return "Project request failed."
}

const listProjectsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProjectListResponse> => {
    const { listProjectsForCurrentUser } = await import(
      "@/server/video-projects"
    )
    return listProjectsForCurrentUser()
  }
)

const getProjectFn = createServerFn({ method: "GET" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<ProjectDetail> => {
    const { getProjectForCurrentUser } = await import(
      "@/server/video-projects"
    )
    return getProjectForCurrentUser(data.projectId)
  })

const createProjectFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: projectNameSchema }))
  .handler(async ({ data }): Promise<ProjectDetail> => {
    const { createProjectForCurrentUser } = await import(
      "@/server/video-projects"
    )
    return createProjectForCurrentUser(data)
  })

const renameProjectFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema.extend({ name: projectNameSchema }))
  .handler(async ({ data }): Promise<ProjectItem> => {
    const { renameProjectForCurrentUser } = await import(
      "@/server/video-projects"
    )
    return renameProjectForCurrentUser(data.projectId, data.name)
  })

const saveProjectTimelineFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema.extend({ timeline: timelineSchema }))
  .handler(async ({ data }): Promise<ProjectItem> => {
    const { saveProjectTimelineForCurrentUser } = await import(
      "@/server/video-projects"
    )
    return saveProjectTimelineForCurrentUser(data.projectId, data.timeline)
  })

const deleteProjectFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<{ projectId: string }> => {
    const { deleteProjectForCurrentUser } = await import(
      "@/server/video-projects"
    )
    return deleteProjectForCurrentUser(data.projectId)
  })

export function listProjects() {
  return listProjectsFn()
}

export function getProject(projectId: string) {
  return getProjectFn({ data: { projectId } })
}

export function createProject(name: string) {
  return createProjectFn({ data: { name } })
}

export function renameProject(projectId: string, name: string) {
  return renameProjectFn({ data: { projectId, name } })
}

export function saveProjectTimeline(
  projectId: string,
  timeline: ProjectTimeline
) {
  return saveProjectTimelineFn({ data: { projectId, timeline } })
}

export function deleteProject(projectId: string) {
  return deleteProjectFn({ data: { projectId } })
}

const bulkDeleteProjectsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectIds: z.array(z.string().min(1).max(36)).min(1).max(100),
    })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteProjectsForCurrentUser } = await import(
      "@/server/video-projects"
    )
    return deleteProjectsForCurrentUser(data.projectIds)
  })

export function bulkDeleteProjects(projectIds: string[]) {
  return bulkDeleteProjectsFn({ data: { projectIds } })
}
