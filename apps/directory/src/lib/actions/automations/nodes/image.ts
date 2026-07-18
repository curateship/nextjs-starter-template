
import { eq } from 'drizzle-orm'
import { revalidatePath } from '@/lib/cache'
import type { AutomationImageSize, ImageAutomationNode, StructuredArticle } from '@/features/automations/domain/types'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { getAIConfig } from '@/lib/actions/integrations/config-helpers'
import { storeAutomationImageMedia } from '@/lib/actions/media/media-upload'
import { AI_PROVIDER_LABELS } from '@/lib/utils/ai-models'
import { generateAutomationImage, type AutomationImageInput } from '../provider'

const PROMPT_CONTEXT_CHARS = 2000

const SIZE_PIXELS: Record<AutomationImageSize, AutomationImageInput['size']> = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
}

export interface ImageNodeResult {
  article: StructuredArticle
  // Set when no image could be attached, so the run step can report a clear
  // reason while the article is still created downstream without an image.
  imageError?: string
}

export async function runImageNode(
  siteId: string,
  node: ImageAutomationNode,
  article: StructuredArticle
): Promise<ImageNodeResult> {
  try {
    const [site] = await db.select({ userId: sites.userId }).from(sites).where(eq(sites.id, siteId)).limit(1)
    if (!site) throw new Error('Site was not found')

    const config = await getAIConfig(siteId, node.config.provider)
    if (!config?.apiKey) {
      return { article, imageError: `${AI_PROVIDER_LABELS[node.config.provider]} integration is not configured` }
    }

    const result = await generateAutomationImage({
      provider: node.config.provider,
      model: node.config.model,
      apiKey: config.apiKey,
      prompt: buildImagePrompt(node.config.prompt, article),
      size: SIZE_PIXELS[node.config.size],
    })

    const stored = await storeAutomationImageMedia({
      userId: site.userId,
      siteId,
      buffer: result.bytes,
      mimeType: result.mimeType,
      originalName: `${article.title}.png`,
      altText: article.title,
    })
    revalidatePath('/admin/media')
    revalidatePath('/admin/images')

    return { article: { ...article, featuredImage: stored.public_url } }
  } catch (error) {
    // Image generation is best-effort: never block the article/listing the
    // pipeline is creating. Report a clear reason on the step instead.
    return { article, imageError: error instanceof Error ? error.message : 'The featured image could not be generated' }
  }
}

function buildImagePrompt(prompt: string, article: StructuredArticle) {
  const summary = article.excerpt.slice(0, PROMPT_CONTEXT_CHARS)
  return [
    prompt.trim(),
    `Article title: ${article.title}`,
    summary ? `Article summary: ${summary}` : '',
  ].filter(Boolean).join('\n\n')
}
