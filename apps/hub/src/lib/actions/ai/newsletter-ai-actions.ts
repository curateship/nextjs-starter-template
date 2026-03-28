'use server'

import { generateAIContent, type GenerateAIContentResult } from '@/lib/actions/ai/ai-actions'
import { type AIProvider } from '@/lib/utils/ai-models'

export interface GenerateNewsletterBatchContentParams {
  prompt: string
  voiceGuide?: string
  referenceText?: string
  provider?: AIProvider
  model?: string
  temperature?: number
  allowedBlockTypes?: string[]
}

export interface GenerateNewsletterRichTextParams {
  prompt: string
  subject: string
  currentContent?: string
  provider?: AIProvider
  model?: string
  temperature?: number
}

export async function generateNewsletterBatchContent(
  siteId: string,
  params: GenerateNewsletterBatchContentParams
): Promise<GenerateAIContentResult> {
  return generateAIContent(siteId, {
    systemPrompt: buildNewsletterBatchSystemPrompt(params.allowedBlockTypes),
    userMessage: buildNewsletterBatchUserMessage(params),
    provider: params.provider,
    model: params.model,
    temperature: params.temperature,
  })
}

export async function generateNewsletterRichText(
  siteId: string,
  params: GenerateNewsletterRichTextParams
): Promise<{ html: string; error: string | null }> {
  const result = await generateAIContent(siteId, {
    systemPrompt: buildNewsletterRichTextSystemPrompt(),
    userMessage: buildNewsletterRichTextUserMessage(params),
    provider: params.provider,
    model: params.model,
    temperature: params.temperature,
  })

  if (result.error) {
    return { html: '', error: result.error }
  }

  const html = parseNewsletterRichTextResponse(result.content)
  if (!html) {
    return { html: '', error: 'AI returned invalid newsletter content' }
  }

  return { html, error: null }
}

export async function generateOutline(
  siteId: string,
  params: {
    prompt: string
    voiceGuide?: string
    provider?: AIProvider
    model?: string
    temperature?: number
  }
): Promise<{ data: { subject: string; description: string }[] | null; error: string | null }> {
  try {
    const result = await generateAIContent(siteId, {
      systemPrompt: `You are a newsletter strategist. Based on the user's instructions, create a sequence plan of newsletters.

Determine the right number of newsletters from the user's prompt. If they say "30 newsletters", plan 30. If they say "a weekly series for 3 months", plan 12. If they don't specify a number, decide based on the topic — enough to cover it thoroughly.

Respond with a JSON array of objects. Each object has:
- "subject": a compelling email subject line
- "description": 2-3 sentences describing what this specific newsletter should cover

The sequence should flow logically — order them from start to finish. Each newsletter should be distinct with no overlap.

Respond ONLY with the JSON array, no markdown fences, no extra text.`,
      userMessage: buildNewsletterBatchUserMessage({
        prompt: params.prompt,
        voiceGuide: params.voiceGuide,
      }),
      provider: params.provider,
      model: params.model,
      temperature: params.temperature,
    })

    if (result.error) return { data: null, error: result.error }

    let cleaned = stripCodeFences(result.content).trim()
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

function buildNewsletterBatchSystemPrompt(allowedBlockTypes?: string[]): string {
  const blockTypes = allowedBlockTypes || ['newsletter-rich-text']
  const hasHeader = blockTypes.includes('newsletter-header')
  const hasFooter = blockTypes.includes('newsletter-footer')

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

  if (blockTypes.includes('newsletter-rich-text')) {
    prompt += `
- "newsletter-rich-text": { "htmlContent": "<p>Your HTML content here</p>", "backgroundColor": "#ffffff", "padding": 20 }
  Use proper HTML with <p>, <h2>, <h3>, <strong>, <em>, <a>, <ul>, <li> tags. Write engaging, well-formatted content.`
  }

  if (hasHeader) {
    prompt += `
- "newsletter-header": { "logoUrl": "", "alignment": "center", "backgroundColor": "#ffffff", "paddingTop": 20, "paddingBottom": 20 }`
  }

  if (blockTypes.includes('newsletter-divider')) {
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

function buildNewsletterRichTextSystemPrompt(): string {
  return `You are an expert email newsletter writer. Turn the user's subject, current draft, and instructions into polished newsletter body HTML.

Return only the finished newsletter body HTML.

Rules:
- Return only HTML for the newsletter body. Do not include a subject line in the HTML.
- Use clean, readable email-safe HTML.
- Allowed tags: <p>, <h2>, <h3>, <strong>, <em>, <a>, <ul>, <ol>, <li>, <blockquote>, <br>.
- Do not include JSON, markdown fences, explanations, <html>, <body>, <script>, or <style> tags.
- If the draft is partial, expand and rewrite it into a finished newsletter while keeping the intent of the existing draft and subject.`
}

function buildNewsletterBatchUserMessage(params: {
  prompt: string
  voiceGuide?: string
  referenceText?: string
}): string {
  let message = params.prompt

  if (params.voiceGuide) {
    message += `\n\n--- VOICE & STYLE GUIDE ---\n${params.voiceGuide}`
  }

  if (params.referenceText) {
    message += `\n\n--- REFERENCE MATERIAL ---\n${params.referenceText}`
  }

  return message
}

function buildNewsletterRichTextUserMessage(params: GenerateNewsletterRichTextParams): string {
  let message = `SUBJECT LINE
${params.subject}

CURRENT DRAFT HTML
${params.currentContent?.trim() || '(empty draft)'}

USER INSTRUCTIONS
${params.prompt}`

  return message
}

function stripCodeFences(content: string): string {
  return content.trim().replace(/^```(?:json|html)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
}

function parseNewsletterRichTextResponse(content: string): string | null {
  const cleaned = stripCodeFences(content).trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)

  if (cleaned.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned)
      if (typeof parsed?.html === 'string' && parsed.html.trim()) {
        return parsed.html.trim()
      }
    } catch {
      // Fall through to HTML extraction.
    }
  }

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (typeof parsed?.html === 'string' && parsed.html.trim()) {
        return parsed.html.trim()
      }
    } catch {
      // Fall through to HTML extraction.
    }
  }

  const firstTagIndex = cleaned.search(/<[a-z]/i)
  const lastTagIndex = cleaned.lastIndexOf('>')

  if (firstTagIndex !== -1 && lastTagIndex > firstTagIndex) {
    return cleaned.slice(firstTagIndex, lastTagIndex + 1).trim()
  }

  if (cleaned.startsWith('{')) {
    return null
  }

  if (/<[a-z][\s\S]*>/i.test(cleaned)) {
    return cleaned
  }

  return null
}
