import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  AutomationDetail,
  AutomationEditorData,
  AutomationListItem,
  AutomationRunDetail,
  AutomationRunSummary,
} from "@/server/automations"
import {
  automationGraphSchema,
  type AutomationGraph,
} from "@/lib/automations/automation"

export type {
  AutomationDetail,
  AutomationEditorData,
  AutomationListItem,
  AutomationRunDetail,
  AutomationRunSummary,
}
export type {
  AutomationCreatorOption,
  AutomationRunStatus,
  AutomationStepItem,
} from "@/server/automations"

const automationIdSchema = z.object({
  automationId: z.string().min(1).max(36),
})
const runIdSchema = z.object({ runId: z.string().min(1).max(36) })

const automationSafeErrorMessages = new Set([
  "Automation not found",
  "Automation was not created",
  "Automation name is required.",
  "Automation graph is invalid.",
  "Fix the automation's validation errors before running.",
  "Run not found",
  "Creator not found",
  "Missing AI Video session",
])

export function getAutomationErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Automation request failed."
  if (automationSafeErrorMessages.has(error.message)) return error.message
  return "Automation request failed."
}

const listAutomationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ automations: AutomationListItem[] }> => {
    const { listAutomationsForCurrentUser } = await import(
      "@/server/automations"
    )
    return listAutomationsForCurrentUser()
  }
)

const createAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1).max(120) }))
  .handler(async ({ data }): Promise<{ automationId: string }> => {
    const { createAutomationForCurrentUser } = await import(
      "@/server/automations"
    )
    return createAutomationForCurrentUser(data.name)
  })

const getAutomationEditorDataFn = createServerFn({ method: "GET" })
  .inputValidator(automationIdSchema)
  .handler(async ({ data }): Promise<AutomationEditorData> => {
    const { getAutomationEditorDataForCurrentUser } = await import(
      "@/server/automations"
    )
    return getAutomationEditorDataForCurrentUser(data.automationId)
  })

const saveAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(
    automationIdSchema.extend({
      name: z.string().min(1).max(120),
      graph: automationGraphSchema,
      enabled: z.boolean(),
    })
  )
  .handler(async ({ data }): Promise<AutomationDetail> => {
    const { saveAutomationForCurrentUser } = await import(
      "@/server/automations"
    )
    return saveAutomationForCurrentUser({
      automationId: data.automationId,
      name: data.name,
      graph: data.graph as AutomationGraph,
      enabled: data.enabled,
    })
  })

const setAutomationEnabledFn = createServerFn({ method: "POST" })
  .inputValidator(automationIdSchema.extend({ enabled: z.boolean() }))
  .handler(async ({ data }): Promise<AutomationDetail> => {
    const { setAutomationEnabledForCurrentUser } = await import(
      "@/server/automations"
    )
    return setAutomationEnabledForCurrentUser(data.automationId, data.enabled)
  })

const deleteAutomationsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ automationIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteAutomationsForCurrentUser } = await import(
      "@/server/automations"
    )
    return deleteAutomationsForCurrentUser(data.automationIds)
  })

const runAutomationFn = createServerFn({ method: "POST" })
  .inputValidator(automationIdSchema)
  .handler(async ({ data }): Promise<AutomationRunDetail> => {
    const { runAutomationForCurrentUser } = await import(
      "@/server/automations"
    )
    return runAutomationForCurrentUser(data.automationId)
  })

const cancelAutomationRunFn = createServerFn({ method: "POST" })
  .inputValidator(runIdSchema)
  .handler(async ({ data }): Promise<AutomationRunDetail> => {
    const { cancelAutomationRunForCurrentUser } = await import(
      "@/server/automations"
    )
    return cancelAutomationRunForCurrentUser(data.runId)
  })

const listAutomationRunsFn = createServerFn({ method: "GET" })
  .inputValidator(automationIdSchema)
  .handler(async ({ data }): Promise<{ runs: AutomationRunSummary[] }> => {
    const { listAutomationRunsForCurrentUser } = await import(
      "@/server/automations"
    )
    return listAutomationRunsForCurrentUser(data.automationId)
  })

const getAutomationRunFn = createServerFn({ method: "GET" })
  .inputValidator(runIdSchema)
  .handler(async ({ data }): Promise<AutomationRunDetail> => {
    const { getAutomationRunForCurrentUser } = await import(
      "@/server/automations"
    )
    return getAutomationRunForCurrentUser(data.runId)
  })

export function listAutomations() {
  return listAutomationsFn()
}

export function createAutomation(name: string) {
  return createAutomationFn({ data: { name } })
}

export function getAutomationEditorData(automationId: string) {
  return getAutomationEditorDataFn({ data: { automationId } })
}

export function saveAutomation(data: {
  automationId: string
  name: string
  graph: AutomationGraph
  enabled: boolean
}) {
  return saveAutomationFn({ data })
}

export function setAutomationEnabled(automationId: string, enabled: boolean) {
  return setAutomationEnabledFn({ data: { automationId, enabled } })
}

export function deleteAutomations(automationIds: string[]) {
  return deleteAutomationsFn({ data: { automationIds } })
}

export function runAutomation(automationId: string) {
  return runAutomationFn({ data: { automationId } })
}

export function cancelAutomationRun(runId: string) {
  return cancelAutomationRunFn({ data: { runId } })
}

export function listAutomationRuns(automationId: string) {
  return listAutomationRunsFn({ data: { automationId } })
}

export function getAutomationRun(runId: string) {
  return getAutomationRunFn({ data: { runId } })
}
