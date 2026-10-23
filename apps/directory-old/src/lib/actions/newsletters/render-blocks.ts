import { getActiveSponsorsByIdsActionImpl } from '@/lib/actions/sponsors/sponsor-actions.server'
import {
  DEFAULT_NEWSLETTER_MAX_WIDTH,
  extractNewsletterSponsorIds,
  generateEmailHtml,
  type NewsletterRenderBlock,
} from './render'

/**
 * The email HTML stored on a newsletter, rendered from its blocks with this site's
 * sponsors resolved. Every writer shares this one path — the builder's create and
 * save, the send, and the automation Newsletter node — so a drafted newsletter's
 * stored HTML is exactly what the builder would produce for the same blocks.
 */
export async function renderNewsletterEmailHtml(
  siteId: string,
  blocks: NewsletterRenderBlock[],
  maxWidth: number = DEFAULT_NEWSLETTER_MAX_WIDTH
): Promise<string> {
  const sponsorIds = extractNewsletterSponsorIds(blocks)
  const sponsorsById = sponsorIds.length > 0
    ? await getActiveSponsorsByIdsActionImpl(siteId, sponsorIds)
    : {}

  return generateEmailHtml(blocks, maxWidth, { sponsorsById })
}
