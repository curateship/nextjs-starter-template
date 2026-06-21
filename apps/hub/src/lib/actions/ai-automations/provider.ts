import 'server-only'

import type { AIProvider } from '@/lib/utils/ai-models'

export interface AiGenerateTextInput {
  provider: AIProvider
  model: string
  apiKey: string
  system: string
  prompt: string
  maxOutputTokens?: number
}

export interface AiGenerateTextResult {
  output: string
  usage: Record<string, any>
  rawStatus?: string | null
}

const DEFAULT_TIMEOUT_MS = 90_000

export async function generateAutomationText(input: AiGenerateTextInput): Promise<AiGenerateTextResult> {
  if (input.provider === 'openai') return generateOpenAIText(input)
  if (input.provider === 'anthropic') return generateAnthropicText(input)
  if (input.provider === 'google_ai') return generateGoogleAIText(input)
  throw new Error('Unsupported AI provider')
}

async function generateOpenAIText(input: AiGenerateTextInput) {
  // Official API shape: https://developers.openai.com/api/reference/resources/responses/methods/create
  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      input: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
      max_output_tokens: input.maxOutputTokens ?? 1800,
      store: false,
    }),
  })

  const json = await readProviderJson(response)
  if (!response.ok) throw new Error(readProviderError(json, 'OpenAI request failed'))

  const output = typeof json.output_text === 'string'
    ? json.output_text
    : extractOpenAIOutput(json.output)

  return {
    output,
    usage: isRecord(json.usage) ? json.usage : {},
    rawStatus: typeof json.status === 'string' ? json.status : null,
  }
}

async function generateAnthropicText(input: AiGenerateTextInput) {
  // Official API shape: https://platform.claude.com/docs/en/build-with-claude/working-with-messages
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxOutputTokens ?? 1800,
      system: input.system,
      messages: [{ role: 'user', content: input.prompt }],
    }),
  })

  const json = await readProviderJson(response)
  if (!response.ok) throw new Error(readProviderError(json, 'Anthropic request failed'))

  return {
    output: extractAnthropicOutput(json.content),
    usage: isRecord(json.usage) ? json.usage : {},
    rawStatus: typeof json.stop_reason === 'string' ? json.stop_reason : null,
  }
}

async function generateGoogleAIText(input: AiGenerateTextInput) {
  // Official API shape: https://ai.google.dev/api/generate-content
  const model = input.model.startsWith('models/') ? input.model : `models/${input.model}`
  const safeModelPath = model.split('/').map(encodeURIComponent).join('/')
  const url = `https://generativelanguage.googleapis.com/v1beta/${safeModelPath}:generateContent`
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': input.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      generationConfig: { maxOutputTokens: input.maxOutputTokens ?? 1800 },
    }),
  })

  const json = await readProviderJson(response)
  if (!response.ok) throw new Error(readProviderError(json, 'Google AI request failed'))

  return {
    output: extractGoogleAIOutput(json.candidates),
    usage: isRecord(json.usageMetadata) ? json.usageMetadata : {},
    rawStatus: typeof json.candidates?.[0]?.finishReason === 'string' ? json.candidates[0].finishReason : null,
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function readProviderJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    const json = JSON.parse(text)
    return isRecord(json) ? json : {}
  } catch {
    return { error: { message: text.slice(0, 1000) } }
  }
}

function readProviderError(json: Record<string, any>, fallback: string) {
  const directError = json.error
  if (isRecord(directError)) {
    const message = directError.message
    if (typeof message === 'string' && message.trim()) return message.slice(0, 1000)
  }
  if (typeof directError === 'string' && directError.trim()) return directError.slice(0, 1000)
  return fallback
}

function extractOpenAIOutput(output: unknown) {
  if (!Array.isArray(output)) return ''
  return output
    .flatMap((item) => isRecord(item) && Array.isArray(item.content) ? item.content : [])
    .flatMap((content) => isRecord(content) && typeof content.text === 'string' ? [content.text] : [])
    .join('\n')
    .trim()
}

function extractAnthropicOutput(content: unknown) {
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((block) => isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])
    .join('\n')
    .trim()
}

function extractGoogleAIOutput(candidates: unknown) {
  if (!Array.isArray(candidates)) return ''
  return candidates
    .flatMap((candidate) => isRecord(candidate) && isRecord(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : [])
    .flatMap((part) => isRecord(part) && typeof part.text === 'string' ? [part.text] : [])
    .join('\n')
    .trim()
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
