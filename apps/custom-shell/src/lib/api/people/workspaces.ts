import { createServerFn } from "@tanstack/react-start"
import { describeAuthError } from "../error-message"
import { createUserWorkspace, switchUserWorkspace, updateUserWorkspace, deleteUserWorkspace, deleteUserWorkspaces, listUserWorkspaces, serializeWorkspace } from "@/server/people/workspaces"
import {
  MAX_CUSTOM_DOMAIN,
  MAX_SUBDOMAIN,
} from "@/lib/workspaces/addresses"
import {
  WORKSPACE_STATUSES,
  type WorkspaceStatus,
} from "@/lib/workspaces/status"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceBaseDomain } from "@/server/workspaces/host"
import { z } from "zod"

import { iconMeta, type IconKey } from "@/lib/custom-shell"
import type { CustomShellUser } from "@/server/schema"

export type WorkspaceItem = {
  id: string
  name: string
  icon: IconKey
  favicon: string
  /** The label it answers on, in front of the base domain. */
  subdomain: string
  /** A domain of its own, or empty. */
  customDomain: string
  status: WorkspaceStatus
  active: boolean
  created_at: string
  updated_at: string
}

export type WorkspaceListResponse = {
  workspaces: WorkspaceItem[]
  /**
   * The domain workspaces hang off, so the form can show what a workspace will
   * answer on as the address is typed. Empty when none is configured, which is
   * every app that is not serving several sites.
   */
  baseDomain: string
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

const addressSchema = z.object({
  subdomain: z.string().max(MAX_SUBDOMAIN),
  customDomain: z.string().max(MAX_CUSTOM_DOMAIN),
  status: z.enum(WORKSPACE_STATUSES),
})

/** The address half of the form, as it travels to the server. */
export type WorkspaceAddressInput = z.infer<typeof addressSchema>

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  icon: iconSchema.optional(),
  address: addressSchema.optional(),
})

const switchWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
})

const updateWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(255),
  icon: iconSchema,
  address: addressSchema.optional(),
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
  .middleware([adminGet])
  .handler(async ({ context }): Promise<WorkspaceListResponse> => {
    return workspaceListForUser(context.user)
  })

const createWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(createWorkspaceSchema)
  .handler(async ({ data, context }): Promise<WorkspaceListResponse> => {
    await createUserWorkspace(
      context.user.id,
      data.name,
      { icon: data.icon },
      undefined,
      data.address
    )
    return workspaceListForUser(context.user)
  })

const switchWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(switchWorkspaceSchema)
  .handler(async ({ data, context }): Promise<WorkspaceListResponse> => {
    await switchUserWorkspace(context.user.id, data.workspaceId, undefined, {
      seesEveryWorkspace: seesEveryWorkspace(context.user),
    })
    return workspaceListForUser(context.user)
  })

const updateWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(updateWorkspaceSchema)
  .handler(async ({ data, context }): Promise<WorkspaceListResponse> => {
    await updateUserWorkspace(
      context.user.id,
      data.workspaceId,
      { name: data.name, settings: { icon: data.icon }, address: data.address },
      undefined,
      { seesEveryWorkspace: seesEveryWorkspace(context.user) }
    )
    return workspaceListForUser(context.user)
  })

const deleteWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(deleteWorkspaceSchema)
  .handler(async ({ data, context }): Promise<WorkspaceListResponse> => {
    await deleteUserWorkspace(context.user.id, data.workspaceId, undefined, {
      seesEveryWorkspace: seesEveryWorkspace(context.user),
    })
    return workspaceListForUser(context.user)
  })

const deleteWorkspacesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(deleteWorkspacesSchema)
  .handler(async ({ data, context }): Promise<WorkspaceBulkDeleteResponse> => {
    const result = await deleteUserWorkspaces(context.user.id, data.workspaceIds, undefined, {
      seesEveryWorkspace: seesEveryWorkspace(context.user),
    })
    return { ...(await workspaceListForUser(context.user)), ...result }
  })

export function loadWorkspaces() {
  return loadWorkspacesFn()
}

export function createWorkspace(
  name: string,
  icon?: IconKey,
  address?: WorkspaceAddressInput
) {
  return createWorkspaceFn({ data: { name, icon, address } })
}

export function switchWorkspace(workspaceId: string) {
  return switchWorkspaceFn({ data: { workspaceId } })
}

export function updateWorkspace(
  workspaceId: string,
  name: string,
  icon: IconKey,
  address?: WorkspaceAddressInput
) {
  return updateWorkspaceFn({ data: { workspaceId, name, icon, address } })
}

export function deleteWorkspace(workspaceId: string) {
  return deleteWorkspaceFn({ data: { workspaceId } })
}

export function deleteWorkspaces(workspaceIds: string[]) {
  return deleteWorkspacesFn({ data: { workspaceIds } })
}

/**
 * True for an admin, checked without reaching into `@/server`.
 *
 * `isAdmin` lives in `@/server/auth/security`, and this file is reachable from
 * the browser — the switcher calls it. Importing it here dragged that module,
 * and `node:crypto` with it, into the client bundle, which broke the whole app
 * with "Cannot read properties of undefined". The role is already on the user
 * the guard put in context, so comparing it costs nothing.
 */
function seesEveryWorkspace(user: Pick<CustomShellUser, "role">) {
  return user.role === "admin"
}

/**
 * An admin sees every workspace on the deployment; anybody else sees their own.
 *
 * A workspace is a thing the deployment has, not one person's property, so an
 * admin has to be able to reach one another admin made — and the ones nobody
 * owns, which is how a departed admin's work stays reachable. **Members are
 * deliberately unchanged**: these endpoints are `userGet`/`userPost` and
 * `/workspaces` carries no admin check, so widening for everybody would hand a
 * member somebody else's contacts and broadcasts.
 */
async function workspaceListForUser(
  user: Pick<CustomShellUser, "id" | "role">
): Promise<WorkspaceListResponse> {
  const userId = user.id
  const { workspaces, currentWorkspaceId } = await listUserWorkspaces(
    userId,
    undefined,
    { seesEveryWorkspace: seesEveryWorkspace(user) }
  )
  return {
    workspaces: workspaces.map((row) =>
      serializeWorkspace(row, currentWorkspaceId)
    ),
    // A server value: the form shows the address as it is typed and cannot work
    // out on its own what the workspace will answer on.
    baseDomain: workspaceBaseDomain(),
  }
}
