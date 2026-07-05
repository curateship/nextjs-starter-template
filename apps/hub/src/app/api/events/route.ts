import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { events, eventTemplates } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializeEvent } from '@/lib/utils/content-serializer'
import { getDefaultEventTemplateIdForSite } from '@/lib/actions/events/event-template-ensure'
import { pruneEventValueBlocksForTemplate } from '@/lib/actions/events/event-template-inheritance'
import { UUID_REGEX } from '@/lib/utils/validation'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'

export const POST = createResourceHandler({
  entityName: 'Event',
  table: events,
  serializeResponse: serializeEvent,
  // events.template_id is NOT NULL — use the chosen template (validated for the
  // site), else fall back to the site default (which ensures a Blank exists)
  prepareCreateData: async (data) => {
    let templateId = typeof data.template_id === 'string' && data.template_id ? data.template_id : ''
    if (templateId && !UUID_REGEX.test(templateId)) {
      return NextResponse.json({ data: null, error: 'Invalid template ID' }, { status: 400 })
    }
    if (!templateId) {
      templateId = await getDefaultEventTemplateIdForSite(data.site_id)
    }

    const [template] = await db
      .select({ id: eventTemplates.id, contentBlocks: eventTemplates.contentBlocks })
      .from(eventTemplates)
      .where(and(eq(eventTemplates.id, templateId), eq(eventTemplates.siteId, data.site_id)))
      .limit(1)

    if (!template) {
      return NextResponse.json({ data: null, error: 'Template not found' }, { status: 400 })
    }

    return {
      ...data,
      templateId: template.id,
      // event rows store only values; keep row settings, drop anything not in the template
      content_blocks: pruneEventValueBlocksForTemplate(
        data.content_blocks || {},
        (template.contentBlocks || {}) as Record<string, any>,
      ),
    }
  },
  buildInsertValues: (data, siteId, slug, nextOrder, contentBlocks) => ({
    siteId,
    templateId: data.templateId,
    title: data.title.trim(),
    slug,
    isPublished: data.is_published !== false,
    displayOrder: nextOrder,
    featuredImage: data.featured_image || null,
    metaDescription: data.meta_description || null,
    contentBlocks,
  }),
  afterInsert: (row) => safeSyncSiteSearchDocument('event', row),
})
