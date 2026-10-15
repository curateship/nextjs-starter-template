import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  copyProjectSchema,
  createMilestoneSchema,
  createProjectSchema,
  projectClientSchema,
  projectHealthSchema,
  projectLeadSchema,
  renameTemplateSchema,
  saveTemplateSchema,
  statusOrderSchema,
  taskMilestoneSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  wholeTeamSchema,
} from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { listInvitesForMe } from "@/server/project/invites"
import {
  createMilestone,
  deleteMilestone,
  setTaskMilestone,
  updateMilestone,
} from "@/server/project/milestones"
import { loadProjectActivity } from "@/server/project/project-activity"
import { eachOf } from "@/server/project/teams"
import {
  addProjectMember,
  copyProject,
  createProject,
  loadProjectPage,
  loadProjectsPage,
  removeProjectMember,
  setProjectArchived,
  setProjectClient,
  setProjectHealth,
  setProjectLead,
  setStatusOrder,
  setWholeTeam,
  updateProject,
} from "@/server/project/projects"
import {
  deleteTemplate,
  listMyTeamTemplates,
  renameTemplate,
  saveTemplate,
} from "@/server/project/templates"

export type {
  ActivityEntry,
  ProjectActivity,
  ProjectActivityEntry,
  TaskActivityEntry,
} from "@/server/project/project-activity"
export type { Milestone } from "@/server/project/milestones"
export type { TemplateRow } from "@/lib/project/templates"
export type {
  ProjectHealthView,
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

const statusOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(statusOrderSchema)
  .handler(async ({ data, context }) => setStatusOrder(context.user.id, data))

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

const copyProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(copyProjectSchema)
  .handler(async ({ data, context }) => copyProject(context.user.id, data))

const loadActivityFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      projectId: id,
      before: z.object({ at: z.string().datetime(), id }).optional(),
    })
  )
  .handler(async ({ data, context }) => loadProjectActivity(context.user.id, data))

const removeMemberFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: id, userId: id }))
  .handler(async ({ data, context }) =>
    removeProjectMember(context.user.id, data.projectId, data.userId)
  )

const healthFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectHealthSchema)
  .handler(async ({ data, context }) => setProjectHealth(context.user.id, data))

const leadFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectLeadSchema)
  .handler(async ({ data, context }) => setProjectLead(context.user.id, data))

const clientFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectClientSchema)
  .handler(async ({ data, context }) => setProjectClient(context.user.id, data))

const wholeTeamFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(wholeTeamSchema)
  .handler(async ({ data, context }) => setWholeTeam(context.user.id, data))

const createMilestoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createMilestoneSchema)
  .handler(async ({ data, context }) => createMilestone(context.user.id, data))

const updateMilestoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateMilestoneSchema)
  .handler(async ({ data, context }) => updateMilestone(context.user.id, data))

const deleteMilestoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ milestoneId: id }))
  .handler(async ({ data, context }) => deleteMilestone(context.user.id, data.milestoneId))

const taskMilestoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(taskMilestoneSchema)
  .handler(async ({ data, context }) => setTaskMilestone(context.user.id, data))

const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listMyTeamTemplates(context.user.id))

const saveTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveTemplateSchema)
  .handler(async ({ data, context }) => saveTemplate(context.user.id, data))

const renameTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(renameTemplateSchema)
  .handler(async ({ data, context }) => renameTemplate(context.user.id, data))

const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ templateId: id }))
  .handler(async ({ data, context }) => deleteTemplate(context.user.id, data.templateId))

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
export function saveStatusOrder(data: z.input<typeof statusOrderSchema>) {
  return statusOrderFn({ data })
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
export function copyOfProject(projectId: string, name: string) {
  return copyProjectFn({ data: { projectId, name } })
}
export function loadActivity(projectId: string, before?: { at: string; id: string }) {
  return loadActivityFn({ data: { projectId, before } })
}
export function removeMemberFromProject(projectId: string, userId: string) {
  return removeMemberFn({ data: { projectId, userId } })
}
export function saveProjectHealth(data: z.input<typeof projectHealthSchema>) {
  return healthFn({ data })
}
export function saveProjectLead(projectId: string, userId: string | null) {
  return leadFn({ data: { projectId, userId } })
}
export function saveProjectClient(projectId: string, client: string | null) {
  return clientFn({ data: { projectId, client } })
}
export function saveWholeTeam(projectId: string, wholeTeam: boolean) {
  return wholeTeamFn({ data: { projectId, wholeTeam } })
}
export function addMilestone(data: z.input<typeof createMilestoneSchema>) {
  return createMilestoneFn({ data })
}
export function saveMilestone(data: z.input<typeof updateMilestoneSchema>) {
  return updateMilestoneFn({ data })
}
export function removeMilestone(milestoneId: string) {
  return deleteMilestoneFn({ data: { milestoneId } })
}
export function saveTaskMilestone(taskId: string, milestoneId: string | null) {
  return taskMilestoneFn({ data: { taskId, milestoneId } })
}
export function loadTemplates() {
  return listTemplatesFn()
}
export function saveAsTemplate(projectId: string, name: string) {
  return saveTemplateFn({ data: { projectId, name } })
}
export function renameProjectTemplate(templateId: string, name: string) {
  return renameTemplateFn({ data: { templateId, name } })
}
export function deleteProjectTemplate(templateId: string) {
  return deleteTemplateFn({ data: { templateId } })
}
