
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { eventTemplates } from '@/lib/db/schema'
import { EVENT_BLANK_TEMPLATE_NAME, EVENT_CONTENT_BLOCK_TYPE } from './event-template-inheritance'

// The Blank template seeds one event-content block (mirrors migration 172) so
// value-only events always have a content block to edit — events have a single
// block type, and the instance builder can't add blocks (structure is template-owned).
const EVENT_BLANK_TEMPLATE_CONTENT_BLOCKS = {
  'event-content-default': {
    id: 'event-content-default',
    type: EVENT_CONTENT_BLOCK_TYPE,
    display_order: 0,
    content: { eventContentStyle: 'default' },
  },
}

// Every site needs at least one event template (events.template_id is NOT NULL).
// Creates the 'Blank' template on demand, marking it default when no default exists.
export async function ensureEventBlankTemplateForSite(siteId: string) {
  const [blankTemplate] = await db
    .select()
    .from(eventTemplates)
    .where(and(eq(eventTemplates.siteId, siteId), eq(eventTemplates.name, EVENT_BLANK_TEMPLATE_NAME)))
    .limit(1)

  if (blankTemplate) return blankTemplate

  const [defaultTemplate] = await db
    .select({ id: eventTemplates.id })
    .from(eventTemplates)
    .where(and(eq(eventTemplates.siteId, siteId), eq(eventTemplates.isDefault, true)))
    .orderBy(desc(eventTemplates.updatedAt))
    .limit(1)

  const [createdTemplate] = await db
    .insert(eventTemplates)
    .values({
      siteId,
      name: EVENT_BLANK_TEMPLATE_NAME,
      contentBlocks: EVENT_BLANK_TEMPLATE_CONTENT_BLOCKS,
      isDefault: !defaultTemplate,
    })
    .returning()

  return createdTemplate
}

// Resolve the template to assign when an event is created without an explicit
// choice (the /api/events create route): site default, else ensured Blank.
export async function getDefaultEventTemplateIdForSite(siteId: string) {
  const [defaultTemplate] = await db
    .select({ id: eventTemplates.id })
    .from(eventTemplates)
    .where(and(eq(eventTemplates.siteId, siteId), eq(eventTemplates.isDefault, true)))
    .orderBy(desc(eventTemplates.updatedAt))
    .limit(1)

  if (defaultTemplate) return defaultTemplate.id

  const blankTemplate = await ensureEventBlankTemplateForSite(siteId)
  return blankTemplate.id
}
