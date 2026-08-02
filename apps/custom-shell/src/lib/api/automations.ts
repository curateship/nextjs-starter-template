import { createServerFn } from "@tanstack/react-start"
import { requireAdmin } from "@/server/security"
import { listUserAutomations, getUserAutomation, createUserAutomation, saveUserAutomation, duplicateUserAutomation, deleteUserAutomation, inspectAutomation } from "@/server/automations"
import { requireAppOrigin } from "@/server/origin"
import { getOrCreateCurrentWorkspace, parseWorkspaceSettings, saveWorkspaceAutomationFavorites } from "@/server/workspaces"
import { createErrorMessage } from "./error-message"
import { z } from "zod"

import type {
  AutomationCompiledConfig,
} from "@/lib/automations/compile"
import {
  automationGraphSchema,
  type AutomationGraph,
  type AutomationValidationError,
} from "@/lib/automations/graph"
import { cleanAutomationPaletteKeys } from "@/lib/automations/node-registry"

export type AutomationListItem = {
  id: string
  name: string
  summary: string
  isValid: boolean
  nodeCount: number
  updated_at: string
}

export type AutomationDetail = {
  id: string
  name: string
  graph: AutomationGraph
  compiledConfig: AutomationCompiledConfig | null
  errors: AutomationValidationError[]
  created_at: string
  updated_at: string
}

export type AutomationsPage = {
  automations: AutomationListItem[]
}

/**
 * The list-row shape for a detail the dashboard just created or duplicated,
 * matching the server's summary wording without another round trip.
 */
export function toAutomationListItem(
  automation: AutomationDetail
): AutomationListItem {
  const nodeCount = automation.graph.nodes.length
  const isValid =
    automation.compiledConfig !== null && automation.errors.length === 0
  return {
    id: automation.id,
    name: automation.name,
    isValid,
    nodeCount,
    summary: isValid
      ? `${nodeCount} step${nodeCount === 1 ? "" : "s"}`
      : nodeCount === 0
        ? "Empty draft"
        : "Needs attention",
    updated_at: automation.updated_at,
  }
}

const nameSchema = z.string().trim().min(1).max(80)
const automationIdSchema = z.object({
  automationId: z.string().min(1).max(36),
})
const createSchema = z.object({ name: nameSchema })
const saveSchema = automationIdSchema.extend({
  name: nameSchema,
  graph: automationGraphSchema,
})
const favoritesSchema = z.object({
  favoriteNodeKeys: z.array(z.string().min(1).max(64)).max(50),
})

const automationErrorMessages: Record<string, string> = {
  NOT_FOUND: "That automation no longer exists.",
  NAME_REQUIRED: "Name the automation first.",
  NAME_TAKEN: "An automation with that name already exists.",
  COPY_LIMIT: "Could not find a free name for the copy.",
}

export const getAutomationErrorMessage = createErrorMessage(
  automationErrorMessages,
  "We could not save that change. Please try again."
)

/** The same codes, said the way a page that would not open needs them said. */
export const getAutomationLoadErrorMessage = createErrorMessage(
  automationErrorMessages,
  "We could not load your automations. Please try again."
)

const loadAutomationsPageFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AutomationsPage> => {
    const user = await requireAdmin()
    const rows = await listUserAutomations(user.id)
    return {
      automations: rows.map((row) => ({
        id: row.id,
        name: row.name,
        summary: row.summary,
        isValid: row.isValid,
        nodeCount: row.nodeCount,
        updated_at: row.updatedAt.toISOString(),
      })),
    }
  }
)

const getAutomationFn = createServerFn({ method: "GET" })
  .inputValidator(automationIdSchema)
  .handler(async ({ data }): Promise<AutomationDetail> => {
    const user = await requireAdmin()
    const row = await getUserAutomation(user.id, data.automationId)
    if (!row) throw new Error("NOT_FOUND")
    return serializeDetail(row)
  })

const createAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(createSchema)
  .handler(async ({ data }): Promise<AutomationDetail> => {
    requireAppOrigin()
    const user = await requireAdmin()
    return serializeDetail(await createUserAutomation(user.id, data.name))
  })

const saveAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(saveSchema)
  .handler(async ({ data }): Promise<AutomationDetail> => {
    requireAppOrigin()
    const user = await requireAdmin()
    const row = await saveUserAutomation(user.id, {
      id: data.automationId,
      name: data.name,
      graph: data.graph,
    })
    if (!row) throw new Error("NOT_FOUND")
    return serializeDetail(row)
  })

const duplicateAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(automationIdSchema)
  .handler(async ({ data }): Promise<AutomationDetail> => {
    requireAppOrigin()
    const user = await requireAdmin()
    const row = await duplicateUserAutomation(user.id, data.automationId)
    if (!row) throw new Error("NOT_FOUND")
    return serializeDetail(row)
  })

const deleteAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(automationIdSchema)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    requireAppOrigin()
    const user = await requireAdmin()
    return { ok: await deleteUserAutomation(user.id, data.automationId) }
  })

const loadAutomationFavoritesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ favoriteNodeKeys: string[] }> => {
    const user = await requireAdmin()
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    return {
      favoriteNodeKeys: parseWorkspaceSettings(workspace.settings)
        .automationFavoriteNodeKeys,
    }
  }
)

const saveAutomationFavoritesFn = createServerFn({ method: "POST" })
  .inputValidator(favoritesSchema)
  .handler(async ({ data }): Promise<{ favoriteNodeKeys: string[] }> => {
    requireAppOrigin()
    const user = await requireAdmin()
    return {
      favoriteNodeKeys: await saveWorkspaceAutomationFavorites(
        user.id,
        cleanAutomationPaletteKeys(data.favoriteNodeKeys)
      ),
    }
  })

export function loadAutomationsPage() {
  return loadAutomationsPageFn()
}

export function getAutomation(automationId: string) {
  return getAutomationFn({ data: { automationId } })
}

export function createAutomation(name: string) {
  return createAutomationFn({ data: { name } })
}

export function saveAutomation(input: {
  automationId: string
  name: string
  graph: AutomationGraph
}) {
  return saveAutomationFn({ data: input })
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

export function saveAutomationFavorites(favoriteNodeKeys: string[]) {
  return saveAutomationFavoritesFn({ data: { favoriteNodeKeys } })
}

async function serializeDetail(
  row: import("@/server/schema").CustomShellAutomation
): Promise<AutomationDetail> {
  const inspected = inspectAutomation(row)
  return {
    id: row.id,
    name: row.name,
    graph: inspected.graph,
    compiledConfig: inspected.compiledConfig,
    errors: inspected.errors,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}
