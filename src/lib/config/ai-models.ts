/**
 * AI Models Configuration
 * Available AI models for content generation
 */

import type { AIModel } from '@/lib/ai/types'

export const AI_MODELS: AIModel[] = [
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and cost-effective model for most content generation tasks',
    badge: 'Recommended'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most capable model for complex or creative content generation'
  }
]
