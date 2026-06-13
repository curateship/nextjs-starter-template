import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { events, eventTemplates } from '@/lib/db/schema'
import { pruneEventValueBlocksForTemplate } from '@/lib/actions/events/event-template-inheritance'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializeEvent } from '@/lib/utils/content-serializer'
import { UUID_REGEX } from '@/lib/utils/validation'

const config = {
  entityName: 'Event',
  table: events,
  paramName: 'eventId',
  serializeResponse: serializeEvent,
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    is_published: 'isPublished',
    display_order: 'displayOrder',
    content_blocks: 'contentBlocks',
    featured_image: 'featuredImage',
    template_id: 'templateId',
  },
  // Switching templates re-prunes the event's value blocks to the new template's shape
  transformUpdateValues: async (updates: Record<string, unknown>, entity: any, updateValues: Record<string, unknown>) => {
    const templateId = typeof updateValues.templateId === 'string'
      ? updateValues.templateId
      : entity.templateId
    if (!UUID_REGEX.test(templateId)) {
      return NextResponse.json({ data: null, error: 'Invalid template ID' }, { status: 400 })
    }

    const [template] = await db
      .select({ contentBlocks: eventTemplates.contentBlocks })
      .from(eventTemplates)
      .where(and(eq(eventTemplates.id, templateId), eq(eventTemplates.siteId, entity.siteId)))
      .limit(1)

    if (!template) {
      return NextResponse.json({ data: null, error: 'Template not found' }, { status: 400 })
    }

    if (updates.content_blocks !== undefined || updates.template_id !== undefined) {
      updateValues.contentBlocks = pruneEventValueBlocksForTemplate(
        (updates.content_blocks || entity.contentBlocks || {}) as Record<string, any>,
        (template.contentBlocks || {}) as Record<string, any>
      )
    }

    return updateValues
  },
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
