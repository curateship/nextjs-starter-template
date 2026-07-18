
import type { AIProvider } from '@/lib/utils/ai-models'
import { RetryableAutomationError } from './errors'

export interface AutomationTextInput {
  provider: AIProvider
  model: string
  apiKey: string
  system: string
  prompt: string
  maxOutputTokens?: number
}

export interface AutomationTextResult {
  output: string
  usage: Record<string, unknown>
}

const DEFAULT_TIMEOUT_MS = 90_000

export async function generateAutomationText(input: AutomationTextInput): Promise<AutomationTextResult> {
  if (input.provider === 'openai') return generateOpenAIText(input)
  if (input.provider === 'anthropic') return generateAnthropicText(input)
  if (input.provider === 'google_ai') return generateGoogleAIText(input)
  throw new Error('Unsupported AI provider')
}

export interface AutomationImageInput {
  provider: AIProvider
  model: string
  apiKey: string
  prompt: string
  // OpenAI gpt-image-1 pixel sizes for each supported orientation.
  size: '1024x1024' | '1536x1024' | '1024x1536'
}

export interface AutomationImageResult {
  bytes: Buffer
  mimeType: string
}

export async function generateAutomationImage(input: AutomationImageInput): Promise<AutomationImageResult> {
  if (input.provider === 'openai') return generateOpenAIImage(input)
  throw new Error('Unsupported AI image provider')
}

async function generateOpenAIImage(input: AutomationImageInput): Promise<AutomationImageResult> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      n: 1,
      size: input.size,
    }),
  })
  const json = await readProviderJson(response)
  assertProviderResponse(response, json, 'OpenAI image request failed')
  const b64 = Array.isArray(json.data) && isRecord(json.data[0]) && typeof json.data[0].b64_json === 'string'
    ? json.data[0].b64_json
    : ''
  if (!b64) throw new Error('OpenAI image response did not contain image data')
  return { bytes: Buffer.from(b64, 'base64'), mimeType: 'image/png' }
}

async function generateOpenAIText(input: AutomationTextInput) {
  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      input: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
      max_output_tokens: input.maxOutputTokens ?? 4000,
      store: false,
    }),
  })
  const json = await readProviderJson(response)
  assertProviderResponse(response, json, 'OpenAI request failed')
  const output = typeof json.output_text === 'string' ? json.output_text : extractOpenAIOutput(json.output)
  return { output, usage: isRecord(json.usage) ? json.usage : {} }
}

async function generateAnthropicText(input: AutomationTextInput) {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxOutputTokens ?? 4000,
      system: input.system,
      messages: [{ role: 'user', content: input.prompt }],
    }),
  })
  const json = await readProviderJson(response)
  assertProviderResponse(response, json, 'Anthropic request failed')
  return { output: extractAnthropicOutput(json.content), usage: isRecord(json.usage) ? json.usage : {} }
}

async function generateGoogleAIText(input: AutomationTextInput) {
  const model = input.model.startsWith('models/') ? input.model : `models/${input.model}`
  const safeModelPath = model.split('/').map(encodeURIComponent).join('/')
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/${safeModelPath}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        generationConfig: { maxOutputTokens: input.maxOutputTokens ?? 4000 },
      }),
    }
  )
  const json = await readProviderJson(response)
  assertProviderResponse(response, json, 'Google AI request failed')
  return { output: extractGoogleAIOutput(json.candidates), usage: isRecord(json.usageMetadata) ? json.usageMetadata : {} }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'AI provider request timed out'
      : 'AI provider could not be reached'
    throw new RetryableAutomationError(message)
  } finally {
    clearTimeout(timeout)
  }
}

function assertProviderResponse(response: Response, json: Record<string, unknown>, fallback: string) {
  if (response.ok) return
  const message = readProviderError(json, fallback)
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    throw new RetryableAutomationError(message)
  }
  throw new Error(message)
}

async function readProviderJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    const json: unknown = JSON.parse(text)
    return isRecord(json) ? json : {}
  } catch {
    return { error: { message: text.slice(0, 1000) } }
  }
}

function readProviderError(json: Record<string, unknown>, fallback: string) {
  const directError = json.error
  if (isRecord(directError) && typeof directError.message === 'string' && directError.message.trim()) {
    return directError.message.slice(0, 1000)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
