'use server'

import { getAIConfig } from '@/lib/actions/integrations/config-helpers'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Verify the user owns this site */
async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

export interface GenerateAIContentParams {
  type: 'newsletter-batch'
  prompt: string
  voiceGuide?: string
  referenceText?: string
  referenceFileUrls?: string[]
  model?: string
  temperature?: number
  allowedBlockTypes?: string[]
}

export interface GenerateAIContentResult {
  content: string
  error: string | null
}

/**
 * Call an AI provider to generate content.
 * Picks the provider from the site's integrations and calls the API directly via fetch.
 */
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

    // Get AI config from site integrations
    const aiConfig = await getAIConfig(siteId)
    if (!aiConfig) return { content: '', error: 'No AI provider configured. Add an API key in Site Settings > Integrations.' }

    // Build the system prompt based on what we're generating
    const systemPrompt = buildNewsletterSystemPrompt(params)

    // Build the user message with all context
    const userMessage = buildUserMessage(params)

    // Call the appropriate provider
    const result = await callProvider(aiConfig.provider, aiConfig.apiKey, {
      systemPrompt,
      userMessage,
      model: params.model,
      temperature: params.temperature ?? 0.7,
    })

    return result
  } catch (err) {
    console.error('generateAIContent error:', err)
    return { content: '', error: err instanceof Error ? err.message : 'AI generation failed' }
  }
}

/**
 * Phase 1: Generate a sequence plan — a list of subjects/descriptions for each newsletter.
 * Returns an array of { subject, description } objects.
 */
export async function generateOutline(
  siteId: string,
  params: {
    prompt: string
    voiceGuide?: string
    model?: string
    temperature?: number
  }
): Promise<{ data: { subject: string; description: string }[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const aiConfig = await getAIConfig(siteId)
    if (!aiConfig) return { data: null, error: 'No AI provider configured. Add an API key in Site Settings > Integrations.' }

    const systemPrompt = `You are a newsletter strategist. Based on the user's instructions, create a sequence plan of newsletters.

Determine the right number of newsletters from the user's prompt. If they say "30 newsletters", plan 30. If they say "a weekly series for 3 months", plan 12. If they don't specify a number, decide based on the topic — enough to cover it thoroughly.

Respond with a JSON array of objects. Each object has:
- "subject": a compelling email subject line
- "description": 2-3 sentences describing what this specific newsletter should cover

The sequence should flow logically — order them from start to finish. Each newsletter should be distinct with no overlap.

Respond ONLY with the JSON array, no markdown fences, no extra text.`

    let userMessage = params.prompt
    if (params.voiceGuide) {
      userMessage += `\n\n--- VOICE & STYLE GUIDE ---\n${params.voiceGuide}`
    }

    const result = await callProvider(aiConfig.provider, aiConfig.apiKey, {
      systemPrompt,
      userMessage,
      model: params.model,
      temperature: params.temperature ?? 0.7,
    })

    if (result.error) return { data: null, error: result.error }

    // Parse the response
    let cleaned = result.content.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
    }
    if (!cleaned.startsWith('[')) {
      const match = cleaned.match(/\[[\s\S]*\]/)
      if (match) cleaned = match[0]
    }

    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return { data: null, error: 'Invalid outline format' }

    return { data: parsed, error: null }
  } catch (err) {
    console.error('generateOutline error:', err)
    return { data: null, error: 'Failed to generate outline' }
  }
}

/** Build system prompt for newsletter generation */
function buildNewsletterSystemPrompt(params: GenerateAIContentParams): string {
  const allowedTypes = params.allowedBlockTypes || ['newsletter-rich-text']
  const hasHeader = allowedTypes.includes('newsletter-header')
  const hasFooter = allowedTypes.includes('newsletter-footer')

  let prompt = `You are an expert newsletter writer. Generate exactly ONE newsletter based on the user's instructions.

You MUST respond with a single JSON object (not an array, not wrapped in another object). Use this exact top-level structure:
{
  "subject": "The email subject line",
  "blocks": [
    {
      "type": "block-type",
      "content": { ... }
    }
  ]
}

Do NOT wrap the response in {"newsletters": [...]} or any other wrapper. The root object must have "subject" and "blocks" keys directly.

Available block types and their content schemas:`

  // Always include rich-text info
  if (allowedTypes.includes('newsletter-rich-text')) {
    prompt += `
- "newsletter-rich-text": { "htmlContent": "<p>Your HTML content here</p>", "backgroundColor": "#ffffff", "padding": 20 }
  Use proper HTML with <p>, <h2>, <h3>, <strong>, <em>, <a>, <ul>, <li> tags. Write engaging, well-formatted content.`
  }

  if (hasHeader) {
    prompt += `
- "newsletter-header": { "logoUrl": "", "alignment": "center", "backgroundColor": "#ffffff", "paddingTop": 20, "paddingBottom": 20 }`
  }

  if (allowedTypes.includes('newsletter-divider')) {
    prompt += `
- "newsletter-divider": { "color": "#e5e7eb", "thickness": 1, "width": 100, "spacing": 20 }`
  }

  if (hasFooter) {
    prompt += `
- "newsletter-footer": { "companyName": "", "companyAddress": "", "showUnsubscribe": true, "socialLinks": [], "alignment": "center" }`
  }

  if (!hasHeader) {
    prompt += `\n\nNote: A header will be added automatically — do NOT include a header block.`
  }
  if (!hasFooter) {
    prompt += `\nNote: A footer will be added automatically — do NOT include a footer block.`
  }

  prompt += `\n\nIMPORTANT: Respond ONLY with the JSON object, no markdown fences, no extra text.`

  return prompt
}

/** Build user message with prompt + references */
function buildUserMessage(params: GenerateAIContentParams): string {
  let message = params.prompt

  if (params.voiceGuide) {
    message += `\n\n--- VOICE & STYLE GUIDE ---\n${params.voiceGuide}`
  }

  if (params.referenceText) {
    message += `\n\n--- REFERENCE MATERIAL ---\n${params.referenceText}`
  }

  return message
}

/** Call the AI provider's API directly */
async function callProvider(
  provider: 'anthropic' | 'openai' | 'google_ai',
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

/** Call Anthropic Messages API */
async function callAnthropic(
  apiKey: string,
  params: { systemPrompt: string; userMessage: string; model?: string; temperature: number }
): Promise<GenerateAIContentResult> {
  const model = params.model || 'claude-sonnet-4-20250514'

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
  // Extract text from the response content blocks
  const text = data.content?.map((c: any) => c.text).join('') || ''
  return { content: text, error: null }
}

/** Call OpenAI Chat Completions API */
async function callOpenAI(
  apiKey: string,
  params: { systemPrompt: string; userMessage: string; model?: string; temperature: number }
): Promise<GenerateAIContentResult> {
  const model = params.model || 'gpt-4o'

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

/** Call Google AI (Gemini) API */
async function callGoogleAI(
  apiKey: string,
  params: { systemPrompt: string; userMessage: string; model?: string; temperature: number }
): Promise<GenerateAIContentResult> {
  const model = params.model || 'gemini-2.0-flash'

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
