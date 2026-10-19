import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  labelSchema,
  reorderTasksSchema,
  setTaskLabelsSchema,
  updateLabelSchema,
} from "@/lib/project/rules"
import { userPost } from "@/server/guards"
import { inTeam } from "@/server/project/access"
import { teamScope } from "@/lib/api/project/scope"
import {
  createLabel,
  deleteLabel,
  setTaskLabels,
  updateLabel,
} from "@/server/project/labels"
import { setProjectStar } from "@/server/project/projects"
import { reorderTasks } from "@/server/project/task-order"

export type { Label } from "@/server/project/labels"

/** Tags (labels in the code), the project's own order and pins (stars in the code). */

const id = z.string().min(1).max(36)

const createLabelFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(labelSchema.extend(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => createLabel(context.user.id, data)))

const updateLabelFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateLabelSchema)
  .handler(async ({ data, context }) => updateLabel(context.user.id, data))

const deleteLabelFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ labelId: id }))
  .handler(async ({ data, context }) => deleteLabel(context.user.id, data.labelId))

const setTaskLabelsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setTaskLabelsSchema)
  .handler(async ({ data, context }) => setTaskLabels(context.user.id, data))

const reorderTasksFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reorderTasksSchema)
  .handler(async ({ data, context }) => reorderTasks(context.user.id, data))

const setStarFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: id, starred: z.boolean() }))
  .handler(async ({ data, context }) => setProjectStar(context.user.id, data))

export function makeLabel(data: z.input<typeof labelSchema>, teamId?: string) {
  return createLabelFn({ data: { ...data, teamId } })
}
export function saveLabel(data: z.input<typeof updateLabelSchema>) {
  return updateLabelFn({ data })
}
export function removeLabel(labelId: string) {
  return deleteLabelFn({ data: { labelId } })
}
export function saveTaskLabels(taskId: string, labelIds: string[]) {
  return setTaskLabelsFn({ data: { taskId, labelIds } })
}
export function saveTaskOrder(projectId: string, taskIds: string[]) {
  return reorderTasksFn({ data: { projectId, taskIds } })
}
export function starProject(projectId: string, starred: boolean) {
  return setStarFn({ data: { projectId, starred } })
}
