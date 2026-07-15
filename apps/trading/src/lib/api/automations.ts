import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  automationBacktestSettingsSchema,
  automationGraphSchema,
  DEFAULT_AUTOMATION_BACKTEST_SETTINGS,
  type AutomationBacktestSettings,
  type AutomationGraph,
  type AutomationProtection,
  type AutomationConfig,
  type AutomationValidationError,
} from "@/lib/automations/automation"
import {
  AUTOMATION_PALETTE_KEYS,
  type AutomationPaletteKey,
} from "@/lib/automations/palette"
import { automationTypeSchema } from "@/lib/automations/automation-types"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"
import type { TradingAutomation } from "@/server/schema"

export type AutomationListItem = {
  id: string
  name: string
  type: string
  interval: AutomationInterval
  summary: string
  isValid: boolean
  updated_at: string
}

export type AutomationDetail = {
  id: string
  name: string
  type: string
  interval: AutomationInterval
  graph: AutomationGraph
  protection: AutomationProtection
  backtest: AutomationBacktestSettings
  compiledConfig: AutomationConfig | null
  errors: AutomationValidationError[]
  created_at: string
  updated_at: string
}

const intervalSchema = z.enum(["1m", "5m", "15m", "1h", "4h", "1d"])
const nameSchema = z.string().trim().min(1).max(80)
const automationIdSchema = z.object({ automationId: z.string().uuid() })
const createSchema = z.object({
  name: nameSchema,
  type: automationTypeSchema,
  interval: intervalSchema,
  backtest: automationBacktestSettingsSchema.default(
    DEFAULT_AUTOMATION_BACKTEST_SETTINGS
  ),
})
const saveSchema = automationIdSchema.extend({
  name: nameSchema,
  type: automationTypeSchema,
  interval: intervalSchema,
  graph: automationGraphSchema,
  backtest: automationBacktestSettingsSchema.default(
    DEFAULT_AUTOMATION_BACKTEST_SETTINGS
  ),
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
      const { inspectAutomation, listUserAutomations } =
        await import("@/server/automations")
      const rows = await listUserAutomations(user.id)
      return {
        automations: rows.map((row) => {
          const inspected = inspectAutomation(row)
          const isValid =
            inspected.compiledConfig !== null && inspected.errors.length === 0
          const rules = inspected.compiledConfig?.rules.length ?? 0
          return {
            id: row.id,
            name: row.name,
            type: row.type,
            interval: row.interval,
            summary: isValid
              ? `${rules} action ${rules === 1 ? "rule" : "rules"}`
              : row.graph.nodes.length === 0
                ? "Empty draft"
                : "Needs attention",
            isValid,
            updated_at: row.updatedAt.toISOString(),
          }
        }),
      }
    })
)

const getAutomationFn = createServerFn({ method: "GET" })
  .inputValidator(automationIdSchema)
  .handler(
    async ({ data }): Promise<AutomationDetail> =>
      safeRequest(async () => {
        const user = await requireUser()
        const { getUserAutomation } = await import("@/server/automations")
        const row = await getUserAutomation(user.id, data.automationId)
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
        const { createUserAutomation } = await import("@/server/automations")
        return serializeDetail(await createUserAutomation(user.id, data))
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
        const { saveUserAutomation } = await import("@/server/automations")
        const row = await saveUserAutomation(user.id, data.automationId, data)
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
        const { duplicateUserAutomation } = await import("@/server/automations")
        const row = await duplicateUserAutomation(user.id, data.automationId)
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
        const { deleteUserAutomation } = await import("@/server/automations")
        return { ok: await deleteUserAutomation(user.id, data.automationId) }
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
        const { saveWorkspaceAutomationFavorites } =
          await import("@/server/workspaces")
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

async function serializeDetail(
  row: TradingAutomation
): Promise<AutomationDetail> {
  const { inspectAutomation } = await import("@/server/automations")
  const inspected = inspectAutomation(row)
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    interval: row.interval,
    graph: inspected.graph,
    protection: inspected.protection,
    backtest: inspected.backtest,
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
