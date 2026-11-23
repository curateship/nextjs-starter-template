import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import {
  createProject as createProjectRow,
  listProjects as listProjectRows,
  renameProject as renameProjectRow,
  setProjectArchived as setProjectArchivedRow,
  setProjectPublic as setProjectPublicRow,
} from "@/server/pomodoro/projects"
import {
  PROJECT_NAME_MAX_LENGTH,
  TARGET_HOURS_MAX,
  targetPeriods,
} from "@/lib/pomodoro/project-targets"

/**
 * The project endpoints. Every one is guarded — reads with `userGet`, changes
 * with `userPost`, which also checks the request's origin — and every server
 * function passes the signed-in user's id down, so a project id from the
 * browser can only ever reach that person's own rows.
 */

const projectNameSchema = z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH)
const projectIdSchema = z.object({ projectId: z.string().uuid() })
// Hours and period travel together, so the server never sees one without the
// other. Null clears the target.
const projectTargetSchema = z
  .object({
    hours: z.number().int().min(1).max(TARGET_HOURS_MAX),
    period: z.enum(targetPeriods),
  })
  .nullable()

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
  .inputValidator(
    projectIdSchema.extend({
      name: projectNameSchema,
      target: projectTargetSchema.optional(),
    })
  )
  .handler(async ({ data, context }) =>
    renameProjectRow(context.user.id, data.projectId, data.name, data.target)
  )

const archiveProjectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema.extend({ archived: z.boolean() }))
  .handler(async ({ data, context }) =>
    setProjectArchivedRow(context.user.id, data.projectId, data.archived)
  )

const projectPublicFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema.extend({ isPublic: z.boolean() }))
  .handler(async ({ data, context }) =>
    setProjectPublicRow(context.user.id, data.projectId, data.isPublic)
  )

export const listProjects = () => listProjectsFn()
export const createProject = (name: string) => createProjectFn({ data: { name } })
export const renameProject = (
  projectId: string,
  name: string,
  target?: z.infer<typeof projectTargetSchema>
) => renameProjectFn({ data: { projectId, name, target } })
export const setProjectArchived = (projectId: string, archived: boolean) =>
  archiveProjectFn({ data: { projectId, archived } })
export const setProjectPublic = (projectId: string, isPublic: boolean) =>
  projectPublicFn({ data: { projectId, isPublic } })
