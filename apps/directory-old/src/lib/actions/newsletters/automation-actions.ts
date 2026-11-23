import { createServerFn } from "@tanstack/react-start"
import { getAutomationsBySiteImpl, getAutomationByIdImpl, getAutomationJourneyIndicatorsImpl, createAutomationImpl, updateAutomationImpl, deleteAutomationsImpl, createStepImpl, reorderStepsImpl, getStepByIdImpl, updateStepImpl, deleteStepImpl, getAutomationReportImpl, getAutomationStepStatusEventsImpl } from "./automation-actions.server"
import type { AutomationTriggerType, AutomationStepStatusEventFilter } from "./automation-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./automation-actions.server"

export const getAutomationsBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getAutomationsBySiteImpl(data.siteId, data.options))

export const getAutomationById = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string }) => data)
  .handler(async ({ data }) => getAutomationByIdImpl(data.automationId))

export const getAutomationJourneyIndicators = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string }) => data)
  .handler(async ({ data }) => getAutomationJourneyIndicatorsImpl(data.automationId))

export const createAutomation = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof createAutomationImpl>[0] }) => data)
  .handler(async ({ data }) => createAutomationImpl(data.input))

export const updateAutomation = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string; updates: {
    name?: string
    description?: string
    status?: string
    trigger_type?: AutomationTriggerType
    trigger_config?: Record<string, any>
    goal_type?: string
    goal_config?: Record<string, any>
  } }) => data)
  .handler(async ({ data }) => updateAutomationImpl(data.automationId, data.updates))

export const deleteAutomations = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => deleteAutomationsImpl(data.ids))

export const createStep = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof createStepImpl>[0] }) => data)
  .handler(async ({ data }) => createStepImpl(data.input))

export const reorderSteps = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string; stepIds: string[] }) => data)
  .handler(async ({ data }) => reorderStepsImpl(data.automationId, data.stepIds))

export const getStepById = createServerFn({ method: "POST" })
  .inputValidator((data: { stepId: string }) => data)
  .handler(async ({ data }) => getStepByIdImpl(data.stepId))

export const updateStep = createServerFn({ method: "POST" })
  .inputValidator((data: { stepId: string; updates: { subject?: string; content?: string; content_blocks?: Record<string, any>; delay_minutes?: number; node_config?: Record<string, any> } }) => data)
  .handler(async ({ data }) => updateStepImpl(data.stepId, data.updates))

export const deleteStep = createServerFn({ method: "POST" })
  .inputValidator((data: { stepId: string }) => data)
  .handler(async ({ data }) => deleteStepImpl(data.stepId))

export const getAutomationReport = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string }) => data)
  .handler(async ({ data }) => getAutomationReportImpl(data.automationId))

export const getAutomationStepStatusEvents = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string; stepOrder: number; options?: { page?: number; pageSize?: number; eventFilter?: AutomationStepStatusEventFilter } }) => data)
  .handler(async ({ data }) => getAutomationStepStatusEventsImpl(data.automationId, data.stepOrder, data.options))
