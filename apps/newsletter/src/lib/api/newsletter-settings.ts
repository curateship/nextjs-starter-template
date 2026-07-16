import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type EmailSettingsResponse = {
  fromEmail: string
  fromName: string
  hasApiKey: boolean
}

export type ConnectionItem = {
  id: string
  name: string
  appKey: string
  secretPrefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  created_at: string
}

export type CreatedConnection = {
  connection: ConnectionItem
  // The full plaintext secret — shown to the user exactly once.
  secret: string
}

const saveEmailSettingsSchema = z.object({
  fromEmail: z.string().trim().max(255),
  fromName: z.string().trim().max(255),
  // Empty string keeps the stored key; null clears it.
  apiKey: z.string().max(500).nullable().optional(),
})

const createConnectionSchema = z.object({
  name: z.string().trim().min(1).max(255),
  appKey: z.string().trim().min(2).max(100),
})

const revokeConnectionSchema = z.object({
  connectionId: z.string().min(1),
})

export function getSettingsErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Settings request failed."
}

const loadEmailSettingsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EmailSettingsResponse> => {
    const user = await requireUser()
    const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
    const { getEmailSettings } = await import("@/server/email-settings")

    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const settings = await getEmailSettings(workspace.id)

    return {
      fromEmail: settings?.fromEmail ?? "",
      fromName: settings?.fromName ?? "",
      hasApiKey: Boolean(settings?.resendApiKeyEncrypted),
    }
  }
)

const saveEmailSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(saveEmailSettingsSchema)
  .handler(async ({ data }): Promise<EmailSettingsResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
    const { saveEmailSettings } = await import("@/server/email-settings")

    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const saved = await saveEmailSettings(workspace.id, {
      fromEmail: data.fromEmail,
      fromName: data.fromName,
      apiKey: data.apiKey,
    })

    return {
      fromEmail: saved?.fromEmail ?? "",
      fromName: saved?.fromName ?? "",
      hasApiKey: Boolean(saved?.resendApiKeyEncrypted),
    }
  })

const listConnectionsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ connections: ConnectionItem[] }> => {
    const user = await requireUser()
    const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
    const { listConnections } = await import("@/server/connections")

    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const connections = await listConnections(workspace.id)
    return { connections: connections.map(serializeConnection) }
  }
)

const createConnectionFn = createServerFn({ method: "POST" })
  .inputValidator(createConnectionSchema)
  .handler(async ({ data }): Promise<CreatedConnection> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
    const { createConnection } = await import("@/server/connections")

    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const { connection, secret } = await createConnection(workspace.id, data)
    return { connection: serializeConnection(connection), secret }
  })

const revokeConnectionFn = createServerFn({ method: "POST" })
  .inputValidator(revokeConnectionSchema)
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
    const { revokeConnection } = await import("@/server/connections")

    const workspace = await getOrCreateCurrentWorkspace(user.id)
    await revokeConnection(workspace.id, data.connectionId)
    return { ok: true }
  })

export function loadEmailSettings() {
  return loadEmailSettingsFn()
}

export function saveWorkspaceEmailSettings(input: {
  fromEmail: string
  fromName: string
  apiKey?: string | null
}) {
  return saveEmailSettingsFn({ data: input })
}

export function loadConnections() {
  return listConnectionsFn()
}

export function createWorkspaceConnection(input: {
  name: string
  appKey: string
}) {
  return createConnectionFn({ data: input })
}

export function revokeWorkspaceConnection(connectionId: string) {
  return revokeConnectionFn({ data: { connectionId } })
}

function serializeConnection(connection: {
  id: string
  name: string
  appKey: string
  secretPrefix: string
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}): ConnectionItem {
  return {
    id: connection.id,
    name: connection.name,
    appKey: connection.appKey,
    secretPrefix: connection.secretPrefix,
    lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
    revokedAt: connection.revokedAt?.toISOString() ?? null,
    created_at: connection.createdAt.toISOString(),
  }
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
