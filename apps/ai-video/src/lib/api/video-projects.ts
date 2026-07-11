import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  SAVED_TIMELINE_INVALID_MESSAGE,
  timelineSchema,
  type ProjectTimeline,
} from "@/lib/timeline-schema"
import type {
  ProjectDetail,
  ProjectItem,
  ProjectListResponse,
} from "@/server/video-projects"
import type {
  BatchRenderItem,
  BatchRenderResponse,
  ProjectRenderInfo,
} from "@/server/render-queue"
import type { RenderQuality } from "@/server/video-render"

export type {
  BatchRenderItem,
  BatchRenderResponse,
  ProjectDetail,
  ProjectItem,
  ProjectListResponse,
  ProjectRenderInfo,
  ProjectTimeline,
  RenderQuality,
}

// Canonical export-quality choices for every quality picker (editor modal,
// dashboard bulk export). Mirrors the server's QUALITY_PRESETS.
export const RENDER_QUALITY_OPTIONS: {
  value: RenderQuality
  label: string
  hint: string
}[] = [
  { value: "high", label: "High", hint: "1080p" },
  { value: "medium", label: "Medium", hint: "720p" },
  { value: "low", label: "Low", hint: "480p" },
]

const projectNameSchema = z.string().min(1).max(255)

const projectIdSchema = z.object({
  projectId: z.string().min(1).max(36),
})

const projectSafeErrorMessages = new Set([
  "Project name is required",
  "Project not found",
  "Nothing to export",
  "Timeline too long to export",
  "No queued export to cancel",
  "Too many exports queued",
  SAVED_TIMELINE_INVALID_MESSAGE,
])

export function getProjectErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Project request failed."
  if (projectSafeErrorMessages.has(error.message)) return error.message
  return "Project request failed."
}

const listProjectsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProjectListResponse> => {
    const { listProjectsForCurrentUser } =
      await import("@/server/video-projects")
    return listProjectsForCurrentUser()
  }
)

const getProjectFn = createServerFn({ method: "GET" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<ProjectDetail> => {
    const { getProjectForCurrentUser } = await import("@/server/video-projects")
    return getProjectForCurrentUser(data.projectId)
  })

const createProjectFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: projectNameSchema }))
  .handler(async ({ data }): Promise<ProjectDetail> => {
    const { createProjectForCurrentUser } =
      await import("@/server/video-projects")
    return createProjectForCurrentUser(data)
  })

const renameProjectFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema.extend({ name: projectNameSchema }))
  .handler(async ({ data }): Promise<ProjectItem> => {
    const { renameProjectForCurrentUser } =
      await import("@/server/video-projects")
    return renameProjectForCurrentUser(data.projectId, data.name)
  })

const saveProjectTimelineFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema.extend({ timeline: timelineSchema }))
  .handler(async ({ data }): Promise<ProjectItem> => {
    const { saveProjectTimelineForCurrentUser } =
      await import("@/server/video-projects")
    return saveProjectTimelineForCurrentUser(data.projectId, data.timeline)
  })

const deleteProjectFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<{ projectId: string }> => {
    const { deleteProjectForCurrentUser } =
      await import("@/server/video-projects")
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

const startRenderFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      quality: z.enum(["high", "medium", "low"]),
      includeEndCard: z.boolean(),
    })
  )
  .handler(async ({ data }): Promise<ProjectRenderInfo> => {
    const { enqueueProjectRenderForCurrentUser } =
      await import("@/server/render-queue")
    return enqueueProjectRenderForCurrentUser(
      data.projectId,
      data.quality,
      data.includeEndCard
    )
  })

const getRenderFn = createServerFn({ method: "GET" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<ProjectRenderInfo> => {
    const { getProjectRenderForCurrentUser } =
      await import("@/server/render-queue")
    return getProjectRenderForCurrentUser(data.projectId)
  })

const enqueueRendersFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectIds: z.array(z.string().min(1).max(36)).min(1).max(100),
      quality: z.enum(["high", "medium", "low"]),
      includeEndCard: z.boolean(),
    })
  )
  .handler(async ({ data }): Promise<BatchRenderResponse> => {
    const { enqueueProjectRendersForCurrentUser } =
      await import("@/server/render-queue")
    return enqueueProjectRendersForCurrentUser(
      data.projectIds,
      data.quality,
      data.includeEndCard
    )
  })

const cancelRenderFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<ProjectRenderInfo> => {
    const { cancelProjectRenderForCurrentUser } =
      await import("@/server/render-queue")
    return cancelProjectRenderForCurrentUser(data.projectId)
  })

export function startProjectRender(
  projectId: string,
  quality: RenderQuality,
  includeEndCard: boolean
) {
  return startRenderFn({ data: { projectId, quality, includeEndCard } })
}

export function getProjectRender(projectId: string) {
  return getRenderFn({ data: { projectId } })
}

export function enqueueProjectRenders(
  projectIds: string[],
  quality: RenderQuality,
  includeEndCard: boolean
) {
  return enqueueRendersFn({ data: { projectIds, quality, includeEndCard } })
}

export function cancelProjectRender(projectId: string) {
  return cancelRenderFn({ data: { projectId } })
}

const bulkDeleteProjectsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectIds: z.array(z.string().min(1).max(36)).min(1).max(100),
    })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteProjectsForCurrentUser } =
      await import("@/server/video-projects")
    return deleteProjectsForCurrentUser(data.projectIds)
  })

export function bulkDeleteProjects(projectIds: string[]) {
  return bulkDeleteProjectsFn({ data: { projectIds } })
}
