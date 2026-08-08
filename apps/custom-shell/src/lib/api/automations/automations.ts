import { createServerFn } from "@tanstack/react-start"
import { adminGet, adminPost } from "@/server/guards"
import {
  listUserAutomations,
  getUserAutomation,
  createUserAutomation,
  saveUserAutomation,
  duplicateUserAutomation,
  deleteUserAutomations,
  inspectAutomation,
  automationTriggerName,
  setAutomationEnabled,
} from "@/server/automations/flows"
import {
  requireCurrentWorkspace,
  parseWorkspaceSettings,
  saveWorkspaceAutomationFavorites,
} from "@/server/people/workspaces"
import { createErrorMessage } from "../error-message"
import { z } from "zod"

import type { AutomationCompiledConfig } from "@/lib/automations/compile"
import {
  automationGraphSchema,
  type AutomationGraph,
  type AutomationValidationError,
} from "@/lib/automations/graph"
import { cleanAutomationPaletteKeys } from "@/lib/automations/node-registry"
import {
  AUTOMATION_TEMPLATE_KEYS,
  type AutomationTemplateKey,
} from "@/lib/automations/templates"
import type { AutomationTemplateListItem } from "@/lib/api/automations/automation-templates"
import {
  getUserAutomationTemplate,
  listUserAutomationTemplates,
} from "@/server/automations/templates"
import { plural } from "@/lib/format/plural"

export type AutomationListItem = {
  id: string
  name: string
  summary: string
  isValid: boolean
  nodeCount: number
  /** Whether this flow's trigger is live. Never about the Run button. */
  enabled: boolean
  /** What it reacts to, or null when it only ever runs by hand. */
  trigger_name: string | null
  updated_at: string
}

export type AutomationDetail = {
  id: string
  name: string
  graph: AutomationGraph
  compiledConfig: AutomationCompiledConfig | null
  errors: AutomationValidationError[]
  enabled: boolean
  trigger_name: string | null
  created_at: string
  updated_at: string
}

export type AutomationsPage = {
  automations: AutomationListItem[]
  templates: AutomationTemplateListItem[]
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
    enabled: automation.enabled,
    trigger_name: automation.trigger_name,
    summary: isValid
      ? `${nodeCount} ${plural(nodeCount, "step", "steps")}`
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
const idListSchema = z.object({
  automationIds: z.array(z.string().min(1).max(36)).min(1).max(200),
})
const createSchema = z.object({
  name: nameSchema,
  templateKey: z.enum(AUTOMATION_TEMPLATE_KEYS).nullable(),
})
const saveSchema = automationIdSchema.extend({
  name: nameSchema,
  graph: automationGraphSchema,
})
const enabledSchema = automationIdSchema.extend({ enabled: z.boolean() })
const favoritesSchema = z.object({
  favoriteNodeKeys: z.array(z.string().min(1).max(64)).max(50),
})

const automationErrorMessages: Record<string, string> = {
  NOT_FOUND: "That automation no longer exists.",
  NOT_RUNNABLE:
    "This flow has something to fix before it can go live. Check the steps marked in red.",
  NO_TRIGGER:
    "This flow has no trigger step, so there is nothing for it to react to. Add one from the Triggers group.",
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

const loadAutomationsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<AutomationsPage> => {
    const [rows, templates] = await Promise.all([
      listUserAutomations(context.user.id),
      listUserAutomationTemplates(context.user.id),
    ])
    return {
      automations: rows.map((row) => ({
        id: row.id,
        name: row.name,
        summary: row.summary,
        isValid: row.isValid,
        nodeCount: row.nodeCount,
        enabled: row.enabled,
        trigger_name: row.triggerName,
        updated_at: row.updatedAt.toISOString(),
      })),
      templates: templates.map((template) => ({
        key: template.key,
        name: template.name,
        description: template.description,
        steps: template.steps,
        isCustomized: template.isCustomized,
        isValid: template.isValid,
        updated_at: template.updatedAt?.toISOString() ?? null,
      })),
    }
  })

const getAutomationFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(automationIdSchema)
  .handler(async ({ data, context }): Promise<AutomationDetail> => {
    const row = await getUserAutomation(context.user.id, data.automationId)
    if (!row) throw new Error("NOT_FOUND")
    return serializeDetail(row)
  })

const createAutomationFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(createSchema)
  .handler(async ({ data, context }): Promise<AutomationDetail> => {
    const graph = data.templateKey
      ? (await getUserAutomationTemplate(context.user.id, data.templateKey))
          .graph
      : undefined
    return serializeDetail(
      await createUserAutomation(context.user.id, data.name, undefined, graph)
    )
  })

const saveAutomationFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(saveSchema)
  .handler(async ({ data, context }): Promise<AutomationDetail> => {
    const row = await saveUserAutomation(context.user.id, {
      id: data.automationId,
      name: data.name,
      graph: data.graph,
    })
    if (!row) throw new Error("NOT_FOUND")
    return serializeDetail(row)
  })

const duplicateAutomationFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(automationIdSchema)
  .handler(async ({ data, context }): Promise<AutomationDetail> => {
    const row = await duplicateUserAutomation(
      context.user.id,
      data.automationId
    )
    if (!row) throw new Error("NOT_FOUND")
    return serializeDetail(row)
  })

/**
 * Switches a flow's trigger on or off. Nothing about the Run button, which
 * works either way — that is a person asking for it.
 */
const setAutomationEnabledFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(enabledSchema)
  .handler(async ({ data, context }): Promise<AutomationDetail> => {
    return serializeDetail(
      await setAutomationEnabled(
        context.user.id,
        data.automationId,
        data.enabled
      )
    )
  })

const deleteAutomationsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(idListSchema)
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    return {
      count: await deleteUserAutomations(context.user.id, data.automationIds),
    }
  })

const loadAutomationFavoritesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ favoriteNodeKeys: string[] }> => {
    const workspace = await requireCurrentWorkspace(context.user.id)
    return {
      favoriteNodeKeys: parseWorkspaceSettings(workspace.settings)
        .automationFavoriteNodeKeys,
    }
  })

const saveAutomationFavoritesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(favoritesSchema)
  .handler(
    async ({ data, context }): Promise<{ favoriteNodeKeys: string[] }> => {
      return {
        favoriteNodeKeys: await saveWorkspaceAutomationFavorites(
          context.user.id,
          cleanAutomationPaletteKeys(data.favoriteNodeKeys)
        ),
      }
    }
  )

export function loadAutomationsPage() {
  return loadAutomationsPageFn()
}

export function getAutomation(automationId: string) {
  return getAutomationFn({ data: { automationId } })
}

export function createAutomation(
  name: string,
  templateKey: AutomationTemplateKey | null = null
) {
  return createAutomationFn({ data: { name, templateKey } })
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

export function setAutomationLive(automationId: string, enabled: boolean) {
  return setAutomationEnabledFn({ data: { automationId, enabled } })
}

export function deleteAutomations(automationIds: string[]) {
  return deleteAutomationsFn({ data: { automationIds } })
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
    enabled: row.enabled,
    trigger_name: automationTriggerName(inspected),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}
