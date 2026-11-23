import { createServerFn } from "@tanstack/react-start"
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

export function getWorkspaceErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Workspace request failed."
}

const loadWorkspacesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkspaceListResponse> => {
    const user = await requireUser()
    return workspaceListForUser(user.id)
  }
)

const createWorkspaceFn = createServerFn({ method: "POST" })
  .inputValidator(createWorkspaceSchema)
  .handler(async ({ data }): Promise<WorkspaceListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { createUserWorkspace } = await import("@/server/workspaces")
    requireAppOrigin()
    const user = await requireUser()
    await createUserWorkspace(user.id, data.name, { icon: data.icon })
    return workspaceListForUser(user.id)
  })

const switchWorkspaceFn = createServerFn({ method: "POST" })
  .inputValidator(switchWorkspaceSchema)
  .handler(async ({ data }): Promise<WorkspaceListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { switchUserWorkspace } = await import("@/server/workspaces")
    requireAppOrigin()
    const user = await requireUser()
    await switchUserWorkspace(user.id, data.workspaceId)
    return workspaceListForUser(user.id)
  })

const updateWorkspaceFn = createServerFn({ method: "POST" })
  .inputValidator(updateWorkspaceSchema)
  .handler(async ({ data }): Promise<WorkspaceListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { updateUserWorkspace } = await import("@/server/workspaces")
    requireAppOrigin()
    const user = await requireUser()
    await updateUserWorkspace(user.id, data.workspaceId, {
      name: data.name,
      settings: { icon: data.icon },
    })
    return workspaceListForUser(user.id)
  })

const deleteWorkspaceFn = createServerFn({ method: "POST" })
  .inputValidator(deleteWorkspaceSchema)
  .handler(async ({ data }): Promise<WorkspaceListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { deleteUserWorkspace } = await import("@/server/workspaces")
    requireAppOrigin()
    const user = await requireUser()
    await deleteUserWorkspace(user.id, data.workspaceId)
    return workspaceListForUser(user.id)
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

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

async function workspaceListForUser(
  userId: string
): Promise<WorkspaceListResponse> {
  const { listUserWorkspaces, serializeWorkspace } = await import(
    "@/server/workspaces"
  )
  const { workspaces, currentWorkspaceId } = await listUserWorkspaces(userId)
  return {
    workspaces: workspaces.map((row) =>
      serializeWorkspace(row, currentWorkspaceId)
    ),
  }
}
