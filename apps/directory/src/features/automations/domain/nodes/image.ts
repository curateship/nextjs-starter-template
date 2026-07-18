import { AI_IMAGE_PROVIDER_DEFAULT_MODELS, isAIImageProvider } from '@/lib/utils/ai-models'
import { boundedString } from '../parse-utils'
import { defineNode } from '../node-descriptor'
import type { ImageAutomationNode } from '../types'

const IMAGE_SIZES = new Set(['square', 'landscape', 'portrait'])

export const imageNode = defineNode({
  kind: 'image',
  meta: { name: 'AI Image', description: 'Generate a featured image.', group: 'AI' },
  inputs: 'single',
  providerRequirement: 'optional',
  createConfig: () => ({
    provider: 'openai',
    model: AI_IMAGE_PROVIDER_DEFAULT_MODELS.openai,
    prompt: 'A clean, professional editorial header image that represents the article. Do not include any text or words in the image.',
    size: 'landscape',
  }),
  ports: () => [{ id: 'article', label: 'Article' }],
  parseConfig: (config) => {
    if (!isAIImageProvider(config.provider)) throw new Error('AI Image provider is invalid')
    if (typeof config.size !== 'string' || !IMAGE_SIZES.has(config.size)) throw new Error('AI Image size is invalid')
    return {
      provider: config.provider,
      model: boundedString(config.model, 'AI Image model', 120),
      prompt: boundedString(config.prompt, 'AI Image prompt', 4000),
      size: config.size as ImageAutomationNode['config']['size'],
    }
  },
  validate: (node, push) => {
    if (!node.config.model.trim()) push('image-model', 'Choose an AI Image model.')
    if (!node.config.prompt.trim()) push('image-prompt', 'Add an image prompt.')
  },
  allowedTargets: (port) => (port === 'article' ? ['post'] : []),
})
