
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from '@/lib/cache'
import type { AutomationImageSize, ImageAutomationNode, StructuredArticle } from '@/features/automations/domain/types'
import { db } from '@/lib/db'
import { media, sites } from '@/lib/db/schema'
import { getAIConfig } from '@/lib/actions/integrations/config-helpers'
import { storeAutomationImageMedia } from '@/lib/actions/media/media-upload'
import { AI_IMAGE_PROVIDER_MODELS, AI_PROVIDER_LABELS } from '@/lib/utils/ai-models'
import { getFromR2 } from '@/lib/utils/r2'
import { generateAutomationImage, type AutomationImageInput } from '../provider'

const PROMPT_CONTEXT_CHARS = 2000
// gpt-image-1 rejects reference images over 50MB; stop well before that so a
// stray large upload fails here with a clear reason instead of at the provider.
// The media library's own image cap is 10MB, so this only catches odd rows.
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024

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
      model: AI_IMAGE_PROVIDER_MODELS[node.config.provider],
      apiKey: config.apiKey,
      prompt: buildImagePrompt(node.config.prompt, article),
      size: SIZE_PIXELS[node.config.size],
      reference: await loadReferenceImage(siteId, node.config.referenceImage),
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

/**
 * Read the chosen reference picture straight out of this site's media library.
 *
 * The stored value is a media URL, but the bytes come from the object store via
 * the matching `media` row rather than by fetching that URL: the row proves the
 * picture belongs to this site, and reading by storage key keeps the run from
 * making an outbound request to an address the config could point at.
 */
async function loadReferenceImage(siteId: string, referenceImage: string) {
  if (!referenceImage.trim()) return undefined

  const [row] = await db
    .select({
      storagePath: media.storagePath,
      mimeType: media.mimeType,
      filename: media.filename,
      fileSize: media.fileSize,
    })
    .from(media)
    .where(and(
      eq(media.publicUrl, referenceImage),
      eq(media.siteId, siteId),
      // A video row would sail through the lookup and then be rejected by the
      // provider, so rule it out here where the reason can be stated plainly.
      eq(media.fileType, 'image'),
    ))
    .limit(1)
  if (!row) throw new Error('The reference image is no longer in this site\'s media library')
  // Checked from the stored size so an oversized object is never downloaded.
  if (row.fileSize > MAX_REFERENCE_BYTES) throw new Error('The reference image is too large to send to the image model')

  const object = await getFromR2(row.storagePath)
  if (!object.Body) throw new Error('The reference image could not be read from storage')
  const bytes = Buffer.isBuffer(object.Body)
    ? object.Body
    : Buffer.from(await object.Body.transformToByteArray())

  return { bytes, mimeType: row.mimeType, filename: row.filename }
}

function buildImagePrompt(prompt: string, article: StructuredArticle) {
  const summary = article.excerpt.slice(0, PROMPT_CONTEXT_CHARS)
  return [
    prompt.trim(),
    `Article title: ${article.title}`,
    summary ? `Article summary: ${summary}` : '',
  ].filter(Boolean).join('\n\n')
}
