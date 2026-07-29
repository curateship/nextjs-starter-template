import { AI_PROVIDER_DEFAULT_MODELS, isAIProvider } from '@/lib/utils/ai-models'
import { boundedString } from '../parse-utils'
import { defineNode } from '../node-descriptor'

export const agentNode = defineNode({
  kind: 'agent',
  meta: { name: 'AI Agent', description: 'Write a structured article.', group: 'AI' },
  defaultName: 'Article Writer',
  inputs: 'multi',
  providerRequirement: 'required',
  createConfig: () => ({
    provider: 'openai',
    model: AI_PROVIDER_DEFAULT_MODELS.openai,
    instructions: 'Write an accurate, useful article from the supplied research.',
  }),
  ports: () => [{ id: 'article', label: 'Article' }],
  parseConfig: (config) => {
    if (!isAIProvider(config.provider)) throw new Error('AI Agent provider is invalid')
    return {
      provider: config.provider,
      model: boundedString(config.model, 'AI Agent model', 120),
      instructions: boundedString(config.instructions, 'AI Agent instructions', 12_000),
    }
  },
  validate: (node, push) => {
    if (!node.config.model.trim()) push('agent-model', 'Choose an AI Agent model.')
    if (!node.config.instructions.trim()) push('agent-prompt', 'Add instructions for this AI Agent.')
  },
  allowedTargets: (port) => (port === 'article' ? ['image', 'approval', 'post'] : []),
})
