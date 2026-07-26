// Pure helpers for claim outreach: resolving a listing's business contact email
// from its content blocks, and the resend cooldown. Kept free of 'server-only'
// so they stay unit-testable (see directory-claim-outreach-email.test.ts).

import { DIRECTORY_CORE_BLOCK_TYPE } from './directory-core'

// How long after a successful invitation before the same listing may be invited
// again. Stops outreach from nagging the same business; the send action skips a
// listing invited within this window and the admin list flags it.
export const CLAIM_OUTREACH_COOLDOWN_DAYS = 30

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The business contact email carried by a listing's content, or null.
 *
 * Listings store contact links in the Core block's `menuLinks` array; a link of
 * type `email` holds the address — this is exactly what an approved submission
 * writes and what the listing page renders as its Email button. The address is
 * returned trimmed, lowercased, and with any `mailto:` prefix removed; null when
 * the listing has no Core block or no valid email link.
 */
export function resolveDirectoryContactEmail(contentBlocks: unknown): string | null {
  if (!isRecord(contentBlocks)) return null

  for (const block of Object.values(contentBlocks)) {
    if (!isRecord(block) || block.type !== DIRECTORY_CORE_BLOCK_TYPE) continue

    const content = isRecord(block.content) ? block.content : null
    const menuLinks = content && Array.isArray(content.menuLinks) ? content.menuLinks : []

    for (const link of menuLinks) {
      if (!isRecord(link) || link.type !== 'email') continue
      const email = typeof link.value === 'string'
        ? link.value.trim().replace(/^mailto:/i, '').toLowerCase()
        : ''
      if (EMAIL_REGEX.test(email)) return email
    }
  }

  return null
}
