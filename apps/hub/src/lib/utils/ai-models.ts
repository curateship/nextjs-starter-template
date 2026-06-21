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
