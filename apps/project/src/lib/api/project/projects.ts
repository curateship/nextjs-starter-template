import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createProjectSchema, updateProjectSchema } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { listInvitesForMe } from "@/server/project/invites"
import { eachOf } from "@/server/project/teams"
import {
  addProjectMember,
  createProject,
  loadProjectPage,
  loadProjectsPage,
  removeProjectMember,
  setProjectArchived,
  updateProject,
} from "@/server/project/projects"

export type {
  ProjectListRow,
  ProjectMemberRow,
  ProjectPage,
  ProjectsPage,
} from "@/server/project/projects"

const id = z.string().min(1).max(36)

/** The Projects dashboard, with any invites waiting for this person's email. */
const loadProjectsPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const [page, invites] = await Promise.all([
      loadProjectsPage(context.user.id),
      listInvitesForMe(context.user),
    ])
    return { ...page, invites }
  })

const loadProjectPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ data, context }) => loadProjectPage(context.user.id, data.projectId))

const createProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createProjectSchema)
  .handler(async ({ data, context }) => createProject(context.user.id, data))

const updateProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateProjectSchema)
  .handler(async ({ data, context }) => updateProject(context.user.id, data))

const setArchivedFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: id, archived: z.boolean() }))
  .handler(async ({ data, context }) =>
    setProjectArchived(context.user.id, data.projectId, data.archived)
  )

const setManyArchivedFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ projectIds: z.array(id).min(1).max(200), archived: z.boolean() })
  )
  .handler(async ({ data, context }) =>
    eachOf(data.projectIds, (projectId) =>
      setProjectArchived(context.user.id, projectId, data.archived)
    )
  )

const addMemberFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: id, userId: id }))
  .handler(async ({ data, context }) =>
    addProjectMember(context.user.id, data.projectId, data.userId)
  )

const removeMemberFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: id, userId: id }))
  .handler(async ({ data, context }) =>
    removeProjectMember(context.user.id, data.projectId, data.userId)
  )

export function loadProjectsDashboard() {
  return loadProjectsPageFn()
}
export function loadProject(projectId: string) {
  return loadProjectPageFn({ data: { projectId } })
}
export function createNewProject(data: z.input<typeof createProjectSchema>) {
  return createProjectFn({ data })
}
export function saveProject(data: z.input<typeof updateProjectSchema>) {
  return updateProjectFn({ data })
}
export function archiveProject(projectId: string, archived: boolean) {
  return setArchivedFn({ data: { projectId, archived } })
}
export function archiveProjects(projectIds: string[], archived: boolean) {
  return setManyArchivedFn({ data: { projectIds, archived } })
}
export function addMemberToProject(projectId: string, userId: string) {
  return addMemberFn({ data: { projectId, userId } })
}
export function removeMemberFromProject(projectId: string, userId: string) {
  return removeMemberFn({ data: { projectId, userId } })
}
