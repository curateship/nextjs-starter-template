import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import {
  createProject as createProjectRow,
  listProjects as listProjectRows,
  renameProject as renameProjectRow,
  setProjectArchived as setProjectArchivedRow,
} from "@/server/pomodoro/projects"

/**
 * The project endpoints. Every one is guarded — reads with `userGet`, changes
 * with `userPost`, which also checks the request's origin — and every server
 * function passes the signed-in user's id down, so a project id from the
 * browser can only ever reach that person's own rows.
 */

const projectNameSchema = z.string().trim().min(1).max(60)
const projectIdSchema = z.object({ projectId: z.string().uuid() })

const listProjectsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listProjectRows(context.user.id))

const createProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name: projectNameSchema }))
  .handler(async ({ data, context }) =>
    createProjectRow(context.user.id, data.name)
  )

const renameProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema.extend({ name: projectNameSchema }))
  .handler(async ({ data, context }) =>
    renameProjectRow(context.user.id, data.projectId, data.name)
  )

const archiveProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema.extend({ archived: z.boolean() }))
  .handler(async ({ data, context }) =>
    setProjectArchivedRow(context.user.id, data.projectId, data.archived)
  )

export const listProjects = () => listProjectsFn()
export const createProject = (name: string) => createProjectFn({ data: { name } })
export const renameProject = (projectId: string, name: string) =>
  renameProjectFn({ data: { projectId, name } })
export const setProjectArchived = (projectId: string, archived: boolean) =>
  archiveProjectFn({ data: { projectId, archived } })
