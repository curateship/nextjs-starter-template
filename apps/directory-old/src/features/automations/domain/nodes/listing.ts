import { AI_PROVIDER_DEFAULT_MODELS, isAIProvider } from '@/lib/utils/ai-models'
import { boundedString, requiredString } from '../parse-utils'
import { defineNode } from '../node-descriptor'

export const listingNode = defineNode({
  kind: 'listing',
  meta: { name: 'Listing', description: 'Draft directory listings.', group: 'Actions' },
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
    if (!isAIProvider(config.provider)) throw new Error('Listing provider is invalid')
    return {
      provider: config.provider,
      model: boundedString(config.model, 'Listing model', 120),
      templateId: boundedString(config.templateId, 'Listing template', 64),
      categoryId: config.categoryId === null || config.categoryId === undefined
        ? null
        : requiredString(config.categoryId, 'Listing category', 64),
      instructions: boundedString(config.instructions ?? '', 'Listing instructions', 4000),
    }
  },
  validate: (node, push) => {
    if (!node.config.model.trim()) push('listing-model', 'Choose a Listing AI model.')
    if (!node.config.templateId) push('listing-template', 'Choose a Listing template.')
  },
  allowedTargets: () => [],
  resourceRefs: (node) => ({
    listingTemplateIds: node.config.templateId ? [node.config.templateId] : [],
    categoryIds: node.config.categoryId ? [node.config.categoryId] : [],
  }),
  validateResources: (node, resolved, push) => {
    if (node.config.templateId && !resolved.listingTemplates.has(node.config.templateId)) {
      push('listing-template-missing', 'The selected Listing template is unavailable.')
    }
    if (node.config.categoryId && !resolved.categories.has(node.config.categoryId)) {
      push('listing-category-missing', 'The selected Listing category is unavailable.')
    }
  },
})
