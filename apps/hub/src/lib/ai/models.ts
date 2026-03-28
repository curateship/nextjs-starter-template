export type AIProvider = 'anthropic' | 'openai' | 'google_ai'

export interface AIModelOption {
  value: string
  label: string
}

const AI_MODELS: Record<AIProvider, AIModelOption[]> = {
  anthropic: [
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5' },
  ],
  openai: [
    { label: 'GPT-5.4', value: 'gpt-5.4' },
    { label: 'GPT-5.4 mini', value: 'gpt-5.4-mini' },
    { label: 'GPT-5.4 nano', value: 'gpt-5.4-nano' },
  ],
  google_ai: [
    { label: 'Gemini 3.1 Pro Preview', value: 'gemini-3.1-pro-preview' },
    { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 3.1 Flash-Lite Preview', value: 'gemini-3.1-flash-lite-preview' },
  ],
}

const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  google_ai: 'Google AI (Gemini)',
}

export function isAIProvider(value: string): value is AIProvider {
  return value === 'anthropic' || value === 'openai' || value === 'google_ai'
}

export function getAIProviderLabel(provider: AIProvider): string {
  return AI_PROVIDER_LABELS[provider]
}

export function getAIModelOptions(provider: AIProvider): AIModelOption[] {
  return AI_MODELS[provider]
}

export function getDefaultAIModel(provider: AIProvider): string {
  return AI_MODELS[provider][0]?.value || ''
}
