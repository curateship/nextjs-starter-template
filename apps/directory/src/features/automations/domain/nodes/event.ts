import { AI_PROVIDER_DEFAULT_MODELS, isAIProvider } from '@/lib/utils/ai-models'
import { boundedString, requiredString } from '../parse-utils'
import { defineNode } from '../node-descriptor'

export const eventNode = defineNode({
  kind: 'event',
  meta: { name: 'Event', description: 'Draft calendar events.', group: 'Actions' },
  inputs: 'multi',
  terminal: true,
  providerRequirement: 'required',
  createConfig: () => ({
    provider: 'openai',
    model: AI_PROVIDER_DEFAULT_MODELS.openai,
    templateId: '',
    categoryId: null,
    instructions: '',
  }),
  ports: () => [],
  parseConfig: (config) => {
    if (!isAIProvider(config.provider)) throw new Error('Event provider is invalid')
    return {
      provider: config.provider,
      model: boundedString(config.model, 'Event model', 120),
      templateId: boundedString(config.templateId, 'Event template', 64),
      categoryId: config.categoryId === null || config.categoryId === undefined
        ? null
        : requiredString(config.categoryId, 'Event category', 64),
      instructions: boundedString(config.instructions ?? '', 'Event instructions', 4000),
    }
  },
  validate: (node, push) => {
    if (!node.config.model.trim()) push('event-model', 'Choose an Event AI model.')
    if (!node.config.templateId) push('event-template', 'Choose an Event template.')
  },
  allowedTargets: () => [],
  resourceRefs: (node) => ({
    eventTemplateIds: node.config.templateId ? [node.config.templateId] : [],
    categoryIds: node.config.categoryId ? [node.config.categoryId] : [],
  }),
  validateResources: (node, resolved, push) => {
    if (node.config.templateId && !resolved.eventTemplates.has(node.config.templateId)) {
      push('event-template-missing', 'The selected Event template is unavailable.')
    }
    if (node.config.categoryId && !resolved.categories.has(node.config.categoryId)) {
      push('event-category-missing', 'The selected Event category is unavailable.')
    }
  },
})
