import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  automationGraphSchema,
  type AutomationGraph,
  type AutomationValidationError,
} from "@/lib/automations/automation"
import type { CompiledConfig } from "@/lib/automations/compiled-config"
import {
  AUTOMATION_PALETTE_KEYS,
  type AutomationPaletteKey,
} from "@/lib/automations/palette"
import type { NewsletterAutomation } from "@/server/schema"

export const AUTOMATION_STATUSES = ["draft", "active", "paused"] as const
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number]

export type AutomationListItem = {
  id: string
  name: string
  status: AutomationStatus
  summary: string
  isValid: boolean
  updated_at: string
}

export type AutomationDetail = {
  id: string
  name: string
  status: AutomationStatus
  graph: AutomationGraph
  compiledConfig: CompiledConfig | null
  errors: AutomationValidationError[]
  created_at: string
  updated_at: string
}

const nameSchema = z.string().trim().min(1).max(80)
const automationIdSchema = z.object({ automationId: z.string().uuid() })
const createSchema = z.object({ name: nameSchema })
const saveSchema = automationIdSchema.extend({
  name: nameSchema,
  graph: automationGraphSchema,
})
const setStatusSchema = automationIdSchema.extend({
  status: z.enum(AUTOMATION_STATUSES),
})
const favoriteNodeKeysSchema = z.object({
  favoriteNodeKeys: z
    .array(
      z.enum(
        AUTOMATION_PALETTE_KEYS as [
          AutomationPaletteKey,
          ...AutomationPaletteKey[],
        ]
      )
    )
    .max(AUTOMATION_PALETTE_KEYS.length),
})

const SAFE_ERROR_MESSAGES = new Set([
  "Automation not found",
  "Automation name already exists",
  "Could not create a unique Automation copy",
  "Missing Custom Shell session",
  "This automation is active. Fix the validation errors or pause it before saving.",
  "This automation has validation errors and cannot be activated.",
])
const FALLBACK_ERROR = "Automation request failed."

export function getAutomationErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return FALLBACK_ERROR
  return SAFE_ERROR_MESSAGES.has(error.message) ? error.message : FALLBACK_ERROR
}

const listAutomationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ automations: AutomationListItem[] }> =>
    safeRequest(async () => {
      const user = await requireUser()
      const workspace = await requireWorkspace(user.id)
      const { listWorkspaceAutomations } = await import(
        "@/server/automations/crud"
      )
      const rows = await listWorkspaceAutomations(workspace.id)
      return {
        automations: rows.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          summary: row.summary,
          isValid: row.isValid,
          updated_at: row.updatedAt.toISOString(),
        })),
      }
    })
)

const getAutomationFn = createServerFn({ method: "GET" })
  .inputValidator(automationIdSchema)
  .handler(
    async ({ data }): Promise<AutomationDetail> =>
      safeRequest(async () => {
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { getWorkspaceAutomation } = await import(
          "@/server/automations/crud"
        )
        const row = await getWorkspaceAutomation(
          workspace.id,
          data.automationId
        )
        if (!row) throw new Error("Automation not found")
        return serializeDetail(row)
      })
  )

const createAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(createSchema)
  .handler(
    async ({ data }): Promise<AutomationDetail> =>
      safeRequest(async () => {
        const { requireAppOrigin } = await import("@/server/origin")
        requireAppOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { createWorkspaceAutomation } = await import(
          "@/server/automations/crud"
        )
        return serializeDetail(
          await createWorkspaceAutomation(workspace.id, data)
        )
      })
  )

const saveAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(saveSchema)
  .handler(
    async ({ data }): Promise<AutomationDetail> =>
      safeRequest(async () => {
        const { requireAppOrigin } = await import("@/server/origin")
        requireAppOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { saveWorkspaceAutomation } = await import(
          "@/server/automations/crud"
        )
        const row = await saveWorkspaceAutomation(workspace.id, {
          id: data.automationId,
          name: data.name,
          graph: data.graph,
        })
        if (!row) throw new Error("Automation not found")
        return serializeDetail(row)
      })
  )

const setAutomationStatusFn = createServerFn({ method: "POST" })
  .inputValidator(setStatusSchema)
  .handler(
    async ({ data }): Promise<AutomationDetail> =>
      safeRequest(async () => {
        const { requireAppOrigin } = await import("@/server/origin")
        requireAppOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { setWorkspaceAutomationStatus } = await import(
          "@/server/automations/crud"
        )
        const row = await setWorkspaceAutomationStatus(workspace.id, {
          id: data.automationId,
          status: data.status,
        })
        if (!row) throw new Error("Automation not found")
        return serializeDetail(row)
      })
  )

const duplicateAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(automationIdSchema)
  .handler(
    async ({ data }): Promise<AutomationDetail> =>
      safeRequest(async () => {
        const { requireAppOrigin } = await import("@/server/origin")
        requireAppOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { duplicateWorkspaceAutomation } = await import(
          "@/server/automations/crud"
        )
        const row = await duplicateWorkspaceAutomation(
          workspace.id,
          data.automationId
        )
        if (!row) throw new Error("Automation not found")
        return serializeDetail(row)
      })
  )

const deleteAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(automationIdSchema)
  .handler(
    async ({ data }): Promise<{ ok: boolean }> =>
      safeRequest(async () => {
        const { requireAppOrigin } = await import("@/server/origin")
        requireAppOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { deleteWorkspaceAutomation } = await import(
          "@/server/automations/crud"
        )
        return {
          ok: await deleteWorkspaceAutomation(workspace.id, data.automationId),
        }
      })
  )

const loadAutomationFavoritesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ favoriteNodeKeys: AutomationPaletteKey[] }> =>
    safeRequest(async () => {
      const user = await requireUser()
      const { getOrCreateCurrentWorkspace, parseWorkspaceSettings } =
        await import("@/server/workspaces")
      const workspace = await getOrCreateCurrentWorkspace(user.id)
      return {
        favoriteNodeKeys: parseWorkspaceSettings(workspace.settings)
          .automationFavoriteNodeKeys,
      }
    })
)

const saveAutomationFavoritesFn = createServerFn({ method: "POST" })
  .inputValidator(favoriteNodeKeysSchema)
  .handler(
    async ({ data }): Promise<{ favoriteNodeKeys: AutomationPaletteKey[] }> =>
      safeRequest(async () => {
        const { requireAppOrigin } = await import("@/server/origin")
        requireAppOrigin()
        const user = await requireUser()
        const { saveWorkspaceAutomationFavorites } = await import(
          "@/server/workspaces"
        )
        return {
          favoriteNodeKeys: await saveWorkspaceAutomationFavorites(
            user.id,
            data.favoriteNodeKeys
          ),
        }
      })
  )

export function listAutomations() {
  return listAutomationsFn()
}

export function getAutomation(automationId: string) {
  return getAutomationFn({ data: { automationId } })
}

export function createAutomation(input: z.input<typeof createSchema>) {
  return createAutomationFn({ data: input })
}

export function saveAutomation(input: z.input<typeof saveSchema>) {
  return saveAutomationFn({ data: input })
}

export function setAutomationStatus(
  automationId: string,
  status: AutomationStatus
) {
  return setAutomationStatusFn({ data: { automationId, status } })
}

export function duplicateAutomation(automationId: string) {
  return duplicateAutomationFn({ data: { automationId } })
}

export function deleteAutomation(automationId: string) {
  return deleteAutomationFn({ data: { automationId } })
}

export function loadAutomationFavorites() {
  return loadAutomationFavoritesFn()
}

export function saveAutomationFavorites(
  favoriteNodeKeys: AutomationPaletteKey[]
) {
  return saveAutomationFavoritesFn({ data: { favoriteNodeKeys } })
}

/** The list-row shape for a detail the dashboard just created or duplicated. */
export function toAutomationListItem(
  automation: AutomationDetail
): AutomationListItem {
  const isValid =
    automation.compiledConfig !== null && automation.errors.length === 0
  const steps = automation.compiledConfig
    ? Object.keys(automation.compiledConfig.nodes).length - 1
    : 0
  return {
    id: automation.id,
    name: automation.name,
    status: automation.status,
    isValid,
    summary: isValid
      ? `${steps} step${steps === 1 ? "" : "s"} after the trigger`
      : automation.graph.nodes.length === 0
        ? "Empty draft"
        : "Needs attention",
    updated_at: automation.updated_at,
  }
}

async function serializeDetail(
  row: NewsletterAutomation
): Promise<AutomationDetail> {
  const { inspectAutomation } = await import("@/server/automations/crud")
  const inspected = inspectAutomation(row)
  return {
    id: row.id,
    name: row.name,
    status: inspected.status,
    graph: inspected.graph,
    compiledConfig: inspected.compiledConfig,
    errors: inspected.errors,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}

async function requireWorkspace(userId: string) {
  const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
  return getOrCreateCurrentWorkspace(userId)
}

async function safeRequest<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const message = getAutomationErrorMessage(error)
    if (message === FALLBACK_ERROR) {
      console.error("automation request failed", error)
    }
    throw new Error(message)
  }
}
