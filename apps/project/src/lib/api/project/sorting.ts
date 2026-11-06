import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { reorderTasksSchema } from "@/lib/project/rules"
import { userPost } from "@/server/guards"
import { setProjectStar } from "@/server/project/projects"
import { reorderTasks } from "@/server/project/task-order"

/** The project's own order and pins (stars in the code). */

const id = z.string().min(1).max(36)

const reorderTasksFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reorderTasksSchema)
  .handler(async ({ data, context }) => reorderTasks(context.user.id, data))

const setStarFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: id, starred: z.boolean() }))
  .handler(async ({ data, context }) => setProjectStar(context.user.id, data))

export function saveTaskOrder(projectId: string, taskIds: string[]) {
  return reorderTasksFn({ data: { projectId, taskIds } })
}
export function starProject(projectId: string, starred: boolean) {
  return setStarFn({ data: { projectId, starred } })
}
