import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  automationGraphSchema,
  type AutomationGraph,
} from "@/lib/automations/graph"
import {
  AUTOMATION_TEMPLATE_KEYS,
  type AutomationTemplateKey,
} from "@/lib/automations/templates"
import { createErrorMessage } from "@/lib/api/error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  getUserAutomationTemplate,
  listUserAutomationTemplates,
  resetUserAutomationTemplate,
  saveUserAutomationTemplateDetails,
  saveUserAutomationTemplateGraph,
  type UserAutomationTemplate,
} from "@/server/automations/templates"

export type AutomationTemplateListItem = {
  key: AutomationTemplateKey
  name: string
  description: string
  steps: string[]
  isCustomized: boolean
  isValid: boolean
  updated_at: string | null
}

export type AutomationTemplateDetail = AutomationTemplateListItem & {
  graph: AutomationGraph
}

export type AutomationTemplatesPage = {
  templates: AutomationTemplateListItem[]
}

const keySchema = z.object({
  templateKey: z.enum(AUTOMATION_TEMPLATE_KEYS),
})
const detailsSchema = keySchema.extend({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(300),
})
const graphSchema = keySchema.extend({ graph: automationGraphSchema })

const templateErrorMessages: Record<string, string> = {
  NAME_REQUIRED: "Give the template a name.",
  DESCRIPTION_REQUIRED: "Describe what the template does.",
}

export const getAutomationTemplateErrorMessage = createErrorMessage(
  templateErrorMessages,
  "We could not save that template. Please try again."
)

export const getAutomationTemplateLoadErrorMessage = createErrorMessage(
  templateErrorMessages,
  "We could not load the automation templates. Please try again."
)

function serializeTemplate(
  template: UserAutomationTemplate
): AutomationTemplateDetail {
  return {
    key: template.key,
    name: template.name,
    description: template.description,
    graph: template.graph,
    steps: template.steps,
    isCustomized: template.isCustomized,
    isValid: template.isValid,
    updated_at: template.updatedAt?.toISOString() ?? null,
  }
}

function serializeTemplateListItem(
  template: UserAutomationTemplate
): AutomationTemplateListItem {
  return {
    key: template.key,
    name: template.name,
    description: template.description,
    steps: template.steps,
    isCustomized: template.isCustomized,
    isValid: template.isValid,
    updated_at: template.updatedAt?.toISOString() ?? null,
  }
}

const loadAutomationTemplatesPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<AutomationTemplatesPage> => ({
    templates: (await listUserAutomationTemplates(context.user.id)).map(
      serializeTemplateListItem
    ),
  }))

const getAutomationTemplateFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(keySchema)
  .handler(async ({ data, context }): Promise<AutomationTemplateDetail> =>
    serializeTemplate(
      await getUserAutomationTemplate(context.user.id, data.templateKey)
    )
  )

const saveAutomationTemplateDetailsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(detailsSchema)
  .handler(async ({ data, context }): Promise<AutomationTemplateDetail> =>
    serializeTemplate(
      await saveUserAutomationTemplateDetails(context.user.id, {
        key: data.templateKey,
        name: data.name,
        description: data.description,
      })
    )
  )

const saveAutomationTemplateGraphFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(graphSchema)
  .handler(async ({ data, context }): Promise<AutomationTemplateDetail> =>
    serializeTemplate(
      await saveUserAutomationTemplateGraph(
        context.user.id,
        data.templateKey,
        data.graph
      )
    )
  )

const resetAutomationTemplateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(keySchema)
  .handler(async ({ data, context }): Promise<AutomationTemplateDetail> =>
    serializeTemplate(
      await resetUserAutomationTemplate(context.user.id, data.templateKey)
    )
  )

export function loadAutomationTemplatesPage() {
  return loadAutomationTemplatesPageFn()
}

export function getAutomationTemplate(templateKey: AutomationTemplateKey) {
  return getAutomationTemplateFn({ data: { templateKey } })
}

export function saveAutomationTemplateDetails(input: {
  templateKey: AutomationTemplateKey
  name: string
  description: string
}) {
  return saveAutomationTemplateDetailsFn({ data: input })
}

export function saveAutomationTemplateGraph(input: {
  templateKey: AutomationTemplateKey
  graph: AutomationGraph
}) {
  return saveAutomationTemplateGraphFn({ data: input })
}

export function resetAutomationTemplate(templateKey: AutomationTemplateKey) {
  return resetAutomationTemplateFn({ data: { templateKey } })
}
