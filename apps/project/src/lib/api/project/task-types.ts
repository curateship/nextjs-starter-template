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
import { userGet, userPost } from "@/server/guards"
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

const loadTaskTypesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadTaskTypesPage(context.user.id))

export function loadTaskTypes() {
  return loadTaskTypesFn()
}

const createTypeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createTypeSchema)
  .handler(async ({ data, context }) => createTaskType(context.user.id, data))

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
  .inputValidator(reorderSchema)
  .handler(async ({ data, context }) => reorderTaskTypes(context.user.id, data.ids))

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

export function makeTaskType(data: z.input<typeof createTypeSchema>) {
  return createTypeFn({ data })
}
export function saveTaskType(data: z.input<typeof updateTypeSchema>) {
  return updateTypeFn({ data })
}
export function archiveType(typeId: string, archived: boolean) {
  return archiveTypeFn({ data: { typeId, archived } })
}
export function orderTaskTypes(ids: string[]) {
  return reorderTypesFn({ data: { ids } })
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
