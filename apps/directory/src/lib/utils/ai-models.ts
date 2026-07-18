export type AIProvider = 'anthropic' | 'openai' | 'google_ai'

export const AI_PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'google_ai']

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google_ai: 'Google AI',
}

export const AI_PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-5.5',
  anthropic: 'claude-opus-4-8',
  google_ai: 'gemini-3.5-flash',
}

export function isAIProvider(provider: unknown): provider is AIProvider {
  return provider === 'openai' || provider === 'anthropic' || provider === 'google_ai'
}

// Providers that can generate images. Anthropic has no image model, so it is
// excluded here even though it is a valid text provider.
export const AI_IMAGE_PROVIDERS: AIProvider[] = ['openai']

export const AI_IMAGE_PROVIDER_DEFAULT_MODELS: Record<'openai', string> = {
  openai: 'gpt-image-1',
}

export function isAIImageProvider(provider: unknown): provider is 'openai' {
  return AI_IMAGE_PROVIDERS.includes(provider as AIProvider)
}
