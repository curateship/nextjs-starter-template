import { createServerFn } from "@tanstack/react-start"
import { describeAuthError } from "./error-message"
import { createUserWorkspace, switchUserWorkspace, updateUserWorkspace, deleteUserWorkspace, deleteUserWorkspaces, listUserWorkspaces, serializeWorkspace } from "@/server/workspaces"
import { userGet, userPost } from "@/server/guards"
import { z } from "zod"

import { iconMeta, type IconKey } from "@/lib/custom-shell"

export type WorkspaceItem = {
  id: string
  name: string
  icon: IconKey
  favicon: string
  active: boolean
  created_at: string
  updated_at: string
}

export type WorkspaceListResponse = {
  workspaces: WorkspaceItem[]
}

/** A bulk delete's honest accounting: what went, and what is still there. */
export type WorkspaceBulkDeleteResponse = WorkspaceListResponse & {
  deleted: string[]
  kept: string[]
}

const iconSchema = z.custom<IconKey>(
  (value) => typeof value === "string" && value in iconMeta,
  { message: "Invalid workspace icon." }
)

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  icon: iconSchema.optional(),
})

const switchWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
})

const updateWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(255),
  icon: iconSchema,
})

const deleteWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
})

const deleteWorkspacesSchema = z.object({
  workspaceIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})

export function getWorkspaceErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Workspace request failed."
  return describeAuthError(error.message) ?? error.message
}

const loadWorkspacesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<WorkspaceListResponse> => {
    return workspaceListForUser(context.user.id)
  })

const createWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createWorkspaceSchema)
  .handler(async ({ data, context }): Promise<WorkspaceListResponse> => {
    await createUserWorkspace(context.user.id, data.name, { icon: data.icon })
    return workspaceListForUser(context.user.id)
  })

const switchWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(switchWorkspaceSchema)
  .handler(async ({ data, context }): Promise<WorkspaceListResponse> => {
    await switchUserWorkspace(context.user.id, data.workspaceId)
    return workspaceListForUser(context.user.id)
  })

const updateWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateWorkspaceSchema)
  .handler(async ({ data, context }): Promise<WorkspaceListResponse> => {
    await updateUserWorkspace(context.user.id, data.workspaceId, {
      name: data.name,
      settings: { icon: data.icon },
    })
    return workspaceListForUser(context.user.id)
  })

const deleteWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deleteWorkspaceSchema)
  .handler(async ({ data, context }): Promise<WorkspaceListResponse> => {
    await deleteUserWorkspace(context.user.id, data.workspaceId)
    return workspaceListForUser(context.user.id)
  })

const deleteWorkspacesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deleteWorkspacesSchema)
  .handler(async ({ data, context }): Promise<WorkspaceBulkDeleteResponse> => {
    const result = await deleteUserWorkspaces(
      context.user.id,
      data.workspaceIds
    )
    return { ...(await workspaceListForUser(context.user.id)), ...result }
  })

export function loadWorkspaces() {
  return loadWorkspacesFn()
}

export function createWorkspace(name: string, icon?: IconKey) {
  return createWorkspaceFn({ data: { name, icon } })
}

export function switchWorkspace(workspaceId: string) {
  return switchWorkspaceFn({ data: { workspaceId } })
}

export function updateWorkspace(
  workspaceId: string,
  name: string,
  icon: IconKey
) {
  return updateWorkspaceFn({ data: { workspaceId, name, icon } })
}

export function deleteWorkspace(workspaceId: string) {
  return deleteWorkspaceFn({ data: { workspaceId } })
}

export function deleteWorkspaces(workspaceIds: string[]) {
  return deleteWorkspacesFn({ data: { workspaceIds } })
}

async function workspaceListForUser(
  userId: string
): Promise<WorkspaceListResponse> {
  const { workspaces, currentWorkspaceId } = await listUserWorkspaces(userId)
  return {
    workspaces: workspaces.map((row) =>
      serializeWorkspace(row, currentWorkspaceId)
    ),
  }
}
