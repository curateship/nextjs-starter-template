import { and, eq } from 'drizzle-orm'
import type { NewsletterAutomationNode, StructuredArticle } from '@/features/automations/domain/types'
import { db } from '@/lib/db'
import { newsletters, newsletterTemplates } from '@/lib/db/schema'
import { sortNewsletterBlocks } from '@/lib/actions/newsletters/render'
import { renderNewsletterEmailHtml } from '@/lib/actions/newsletters/render-blocks'
import { buildAutomationNewsletterBlocks, resolveNewsletterSubject } from './newsletter-content'

export interface NewsletterNodeResult {
  newsletterId: string
  subject: string
  url: string
}

/**
 * Drafts one newsletter from the article the pipeline is carrying, ready for the owner
 * to skim, tweak, and send from the newsletter builder.
 *
 * Nothing is ever sent here, under any configuration: the row is written as a `draft`
 * with no schedule and no audience, and this module imports no delivery code at all.
 * The empty audience is a second lock — the send path refuses a newsletter that has no
 * segment or audience chosen, so a draft cannot go out until a human picks who gets it.
 */
export async function runNewsletterNode(
  siteId: string,
  node: NewsletterAutomationNode,
  article: StructuredArticle
): Promise<NewsletterNodeResult> {
  const templateBlocks = await loadTemplateBlocks(siteId, node.config.templateId)
  const contentBlocks = buildAutomationNewsletterBlocks(templateBlocks, article)
  const subject = resolveNewsletterSubject(node.config, article)
  const content = await renderNewsletterEmailHtml(siteId, sortNewsletterBlocks(contentBlocks))

  const [created] = await db
    .insert(newsletters)
    .values({
      siteId,
      name: subject,
      subject,
      content,
      contentBlocks,
      status: 'draft',
      audienceFilter: {},
      scheduledAt: null,
    })
    .returning()
  if (!created) throw new Error('Newsletter draft could not be created')

  return {
    newsletterId: created.id,
    subject: created.subject,
    url: `/admin/newsletters/${created.id}`,
  }
}

async function loadTemplateBlocks(siteId: string, templateId: string | null): Promise<Record<string, unknown>> {
  if (!templateId) return {}
  const [template] = await db
    .select({ contentBlocks: newsletterTemplates.contentBlocks })
    .from(newsletterTemplates)
    .where(and(eq(newsletterTemplates.id, templateId), eq(newsletterTemplates.siteId, siteId)))
    .limit(1)
  if (!template) throw new Error('The Newsletter template was not found')
  return (template.contentBlocks ?? {}) as Record<string, unknown>
}
