import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  archiveTypeSchema,
  createFieldSchema,
  createTypeSchema,
  projectTypesSchema,
  reorderFieldsSchema,
  reorderSchema,
  setFieldValueSchema,
  setTaskTypeSchema,
  updateFieldSchema,
  updateTypeSchema,
} from "@/lib/project/task-types"
import { teamScope } from "@/lib/api/project/scope"
import { userGet, userPost } from "@/server/guards"
import { inTeam, isSiteAdmin } from "@/server/project/access"
import { listTeamNames } from "@/server/project/record-team"
import {
  archiveTaskType,
  createTaskType,
  createTypeField,
  deleteTypeField,
  loadTaskTypesPage,
  reorderTaskTypes,
  reorderTypeFields,
  setProjectTypes,
  setTaskFieldValue,
  setTaskType,
  updateTaskType,
  updateTypeField,
} from "@/server/project/task-types"

export type { TaskFields, TaskFieldView } from "@/server/project/task-types"

/**
 * Task types: the team's own kinds of task and their fields (owner and
 * admins), a task's type and its values (anyone who can change the task,
 * within each field's "Who can change it"), and a project's own pick.
 */

const id = z.string().min(1).max(36)

/**
 * A team's types. The site admin picks the team in the page's filter, starting
 * on the first by name; `teams` lists every one for it, and is empty for an
 * employee, who sees their own team.
 */
const loadTaskTypesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) => {
    const teams = (await isSiteAdmin(context.user.id)) ? await listTeamNames() : []
    const teamId = teams.length ? (teams.find((team) => team.id === data.teamId) ?? teams[0]).id : undefined
    const page = await inTeam(teamId, () => loadTaskTypesPage(context.user.id))
    return page ? { ...page, teams, teamId: teamId ?? null } : null
  })

export function loadTaskTypes(teamId?: string) {
  return loadTaskTypesFn({ data: { teamId } })
}

const createTypeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createTypeSchema.extend(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => createTaskType(context.user.id, data)))

const updateTypeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateTypeSchema)
  .handler(async ({ data, context }) => updateTaskType(context.user.id, data))

const archiveTypeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(archiveTypeSchema)
  .handler(async ({ data, context }) => archiveTaskType(context.user.id, data))

const reorderTypesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reorderSchema.extend(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => reorderTaskTypes(context.user.id, data.ids)))

const createFieldFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createFieldSchema)
  .handler(async ({ data, context }) => createTypeField(context.user.id, data))

const updateFieldFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateFieldSchema)
  .handler(async ({ data, context }) => updateTypeField(context.user.id, data))

const reorderFieldsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reorderFieldsSchema)
  .handler(async ({ data, context }) => reorderTypeFields(context.user.id, data))

const deleteFieldFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ fieldId: id }))
  .handler(async ({ data, context }) => deleteTypeField(context.user.id, data.fieldId))

const setTaskTypeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setTaskTypeSchema)
  .handler(async ({ data, context }) => setTaskType(context.user, data))

const setFieldValueFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setFieldValueSchema)
  .handler(async ({ data, context }) => setTaskFieldValue(context.user, data))

const setProjectTypesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectTypesSchema)
  .handler(async ({ data, context }) => setProjectTypes(context.user.id, data))

export function makeTaskType(data: z.input<typeof createTypeSchema>, teamId?: string) {
  return createTypeFn({ data: { ...data, teamId } })
}
export function saveTaskType(data: z.input<typeof updateTypeSchema>) {
  return updateTypeFn({ data })
}
export function archiveType(typeId: string, archived: boolean) {
  return archiveTypeFn({ data: { typeId, archived } })
}
export function orderTaskTypes(ids: string[], teamId?: string) {
  return reorderTypesFn({ data: { ids, teamId } })
}
export function makeTypeField(data: z.input<typeof createFieldSchema>) {
  return createFieldFn({ data })
}
export function saveTypeField(data: z.input<typeof updateFieldSchema>) {
  return updateFieldFn({ data })
}
export function orderTypeFields(typeId: string, ids: string[]) {
  return reorderFieldsFn({ data: { typeId, ids } })
}
export function removeTypeField(fieldId: string) {
  return deleteFieldFn({ data: { fieldId } })
}
export function saveTaskTypeOf(taskId: string, typeId: string | null) {
  return setTaskTypeFn({ data: { taskId, typeId } })
}
export function saveFieldValue(data: z.input<typeof setFieldValueSchema>) {
  return setFieldValueFn({ data })
}
export function saveProjectTypes(data: z.input<typeof projectTypesSchema>) {
  return setProjectTypesFn({ data })
}
