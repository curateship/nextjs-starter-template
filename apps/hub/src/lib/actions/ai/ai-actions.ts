'use server'

import { getAIConfig } from '@/lib/actions/integrations/config-helpers'
import { getDefaultAIModel, type AIProvider } from '@/lib/utils/ai-models'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)

  return !!site
}

export interface GenerateAIContentParams {
  systemPrompt: string
  userMessage: string
  provider?: AIProvider
  model?: string
  temperature?: number
}

export interface GenerateAIContentResult {
  content: string
  error: string | null
}

export async function generateAIContent(
  siteId: string,
  params: GenerateAIContentParams
): Promise<GenerateAIContentResult> {
  try {
    if (!UUID_REGEX.test(siteId)) return { content: '', error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { content: '', error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { content: '', error: 'Access denied' }
    }

    const aiConfig = await getAIConfig(siteId, params.provider)
    if (!aiConfig) return { content: '', error: getAIConfigError(params.provider) }

    return callProvider(aiConfig.provider, aiConfig.apiKey, {
      systemPrompt: params.systemPrompt,
      userMessage: params.userMessage,
      model: params.model,
      temperature: params.temperature ?? 0.7,
    })
  } catch (err) {
    console.error('generateAIContent error:', err)
    return { content: '', error: err instanceof Error ? err.message : 'AI generation failed' }
  }
}

function getAIConfigError(provider?: AIProvider): string {
  if (provider) {
    return 'Selected AI provider is not configured. Add its API key in Site Settings > Integrations.'
  }

  return 'No AI provider configured. Add an API key in Site Settings > Integrations.'
}

async function callProvider(
  provider: AIProvider,
  apiKey: string,
  params: {
    systemPrompt: string
    userMessage: string
    model?: string
    temperature: number
  }
): Promise<GenerateAIContentResult> {
  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, params)
    case 'openai':
      return callOpenAI(apiKey, params)
    case 'google_ai':
      return callGoogleAI(apiKey, params)
    default:
      return { content: '', error: `Unsupported provider: ${provider}` }
  }
}

async function callAnthropic(
  apiKey: string,
  params: { systemPrompt: string; userMessage: string; model?: string; temperature: number }
): Promise<GenerateAIContentResult> {
  const model = params.model || getDefaultAIModel('anthropic')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: params.temperature,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userMessage }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return { content: '', error: `Anthropic API error: ${response.status} - ${err}` }
  }

  const data = await response.json()
  const text = data.content?.map((c: any) => c.text).join('') || ''
  return { content: text, error: null }
}

async function callOpenAI(
  apiKey: string,
  params: { systemPrompt: string; userMessage: string; model?: string; temperature: number }
): Promise<GenerateAIContentResult> {
  const model = params.model || getDefaultAIModel('openai')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: params.temperature,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userMessage },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return { content: '', error: `OpenAI API error: ${response.status} - ${err}` }
  }

  const data = await response.json()
  return { content: data.choices?.[0]?.message?.content || '', error: null }
}

async function callGoogleAI(
  apiKey: string,
  params: { systemPrompt: string; userMessage: string; model?: string; temperature: number }
): Promise<GenerateAIContentResult> {
  const model = params.model || getDefaultAIModel('google_ai')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ parts: [{ text: params.userMessage }] }],
        generationConfig: { temperature: params.temperature },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    return { content: '', error: `Google AI API error: ${response.status} - ${err}` }
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
  return { content: text, error: null }
}
