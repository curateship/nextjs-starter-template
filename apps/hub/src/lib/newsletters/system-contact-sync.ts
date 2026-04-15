import { and, eq } from 'drizzle-orm'

import { syncDynamicSegmentsForContacts } from '@/lib/actions/newsletters/segment-actions'
import { db } from '@/lib/db'
import { newsletterContacts } from '@/lib/db/schema'

export const SITE_REGISTRATION_CONTACT_SOURCE = 'site_registration'
export const SITE_REGISTRATION_CONTACT_TAG = 'Site Registration'

type UpsertSystemNewsletterContactInput = {
  siteId: string
  email: string
  source?: string
  preserveExistingSource?: boolean
  firstName?: string | null
  lastName?: string | null
  tags?: string[]
  extraMetadata?: Record<string, unknown>
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return { ...(value as Record<string, unknown>) }
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(
    value
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean)
  )]
}

function mergeContactMetadata(
  existingMetadata: unknown,
  input: UpsertSystemNewsletterContactInput
) {
  const metadata = normalizeMetadata(existingMetadata)

  if (input.extraMetadata) {
    Object.assign(metadata, input.extraMetadata)
  }

  const firstName = input.firstName?.trim()
  if (firstName) {
    metadata.first_name = firstName
  }

  const lastName = input.lastName?.trim()
  if (lastName) {
    metadata.last_name = lastName
  }

  if (input.source) {
    const existingSource = typeof metadata.source === 'string' ? metadata.source : null
    if (!existingSource || !input.preserveExistingSource) {
      metadata.source = input.source
    }
  }

  const mergedTags = normalizeTags(metadata.tags)
  const nextTags = normalizeTags([...(input.tags || []), ...mergedTags])

  if (nextTags.length) {
    metadata.tags = nextTags
  }

  return metadata
}

export async function upsertSystemNewsletterContact(
  input: UpsertSystemNewsletterContactInput
): Promise<{ id: string | null; error: string | null }> {
  try {
    const siteId = input.siteId?.trim()
    const email = input.email?.trim().toLowerCase()

    if (!siteId || !email) {
      return { id: null, error: 'Missing site or email' }
    }

    const [existingContact] = await db
      .select({
        id: newsletterContacts.id,
        metadata: newsletterContacts.metadata,
      })
      .from(newsletterContacts)
      .where(and(
        eq(newsletterContacts.siteId, siteId),
        eq(newsletterContacts.email, email),
      ))
      .limit(1)

    const metadata = mergeContactMetadata(existingContact?.metadata, input)

    let contactId: string | null = null

    if (existingContact) {
      const [updatedContact] = await db
        .update(newsletterContacts)
        .set({
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(newsletterContacts.id, existingContact.id))
        .returning({ id: newsletterContacts.id })

      contactId = updatedContact?.id ?? null
    } else {
      const [createdContact] = await db
        .insert(newsletterContacts)
        .values({
          siteId,
          email,
          metadata,
        })
        .returning({ id: newsletterContacts.id })

      contactId = createdContact?.id ?? null
    }

    if (contactId) {
      await syncDynamicSegmentsForContacts([contactId])
    }

    return { id: contactId, error: contactId ? null : 'Failed to save contact' }
  } catch (error) {
    console.error('upsertSystemNewsletterContact error:', error)
    return { id: null, error: 'Failed to save contact' }
  }
}
