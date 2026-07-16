import type { StructuredArticle } from '@/features/automations/domain/types'
import { prunePostValueBlocksForTemplate } from '@/lib/actions/posts/post-template-inheritance'
import { sanitizeRichHtml } from '@/lib/utils/html-sanitizer'

export function buildAutomationPostContent(templateBlocks: Record<string, any>, article: StructuredArticle) {
  const coreEntry = Object.entries(templateBlocks).find(([, value]) => isRecord(value) && value.type === 'core')
  if (!coreEntry) throw new Error('Post template needs a Core block')
  const [coreId, coreBlock] = coreEntry
  const sanitizedHtml = sanitizeRichHtml(article.html)
  if (!sanitizedHtml.trim()) throw new Error('AI Agent article body was empty after safety checks')
  return prunePostValueBlocksForTemplate({
    [coreId]: {
      id: coreId,
      type: 'core',
      display_order: Number((coreBlock as Record<string, any>).display_order ?? 0),
      content: { body: sanitizedHtml, format: 'html' },
    },
  }, templateBlocks)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
