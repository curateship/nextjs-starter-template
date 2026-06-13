import { EventBlockRenderer } from "@/components/frontend/events/EventBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { mergeEventTemplateBlocks } from '@/lib/actions/events/event-template-inheritance'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import {
  getContentBreadcrumbItems,
  shouldShowFrontendBreadcrumbs,
} from "@/lib/actions/categories/frontend-breadcrumb-actions"

interface EventPageProps {
  params: Promise<{
    slug: string
  }>
}

const EVENT_PAGE_NOT_FOUND_ERROR = 'EVENT_PAGE_NOT_FOUND'

function isValidEventSlug(slug: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(slug)
}

function isEventPageNotFoundError(error: unknown) {
  return error instanceof Error && error.message === EVENT_PAGE_NOT_FOUND_ERROR
}

function getCachedEventPageData(siteId: string, slug: string) {
  return unstable_cache(
    async () => {
      const rows = await db.execute(sql`
        with event_row as (
          select
            e.id,
            e.site_id as "siteId",
            e.template_id as "templateId",
            e.title,
            e.slug,
            e.meta_description as "metaDescription",
            e.is_published as "isPublished",
            e.display_order as "displayOrder",
            e.content_blocks as "contentBlocks",
            e.featured_image as "featuredImage",
            e.created_at as "createdAt",
            e.updated_at as "updatedAt"
          from events e
          where e.site_id = ${siteId}
            and e.slug = ${slug}
            and e.is_published = true
          limit 1
        )
        select
          to_jsonb(event_row) as event,
          et.content_blocks as "templateContentBlocks"
        from event_row
        inner join event_templates et
          on et.id = event_row."templateId"
          and et.site_id = event_row."siteId"
      `)

      const row = rows.rows[0] as any
      if (!row) throw new Error(EVENT_PAGE_NOT_FOUND_ERROR)
      return row
    },
    // v2: template-merged content blocks
    ['event-page-data-v2', siteId, slug],
    {
      revalidate: false,
      tags: ['events', 'categories', 'content-categories', `site-${siteId}`, 'all'],
    }
  )()
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params

  if (!isValidEventSlug(slug)) {
    notFound()
  }

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  let pageData: any
  try {
    pageData = await getCachedEventPageData(site.id, slug)
  } catch (error) {
    if (isEventPageNotFoundError(error)) notFound()
    throw error
  }
  const event = pageData.event

  let blocks: any[] = []
  try {
    // Template owns block structure; the event row stores only values
    const mergedContentBlocks = mergeEventTemplateBlocks(
      (pageData.templateContentBlocks as any) || {},
      (event.contentBlocks as any) || {}
    )
    blocks = convertContentBlocksToArray(mergedContentBlocks, event.id)
  } catch (error) {
    console.warn('Error loading event blocks:', error)
    blocks = []
  }

  const eventWithBlocks = {
    ...toSnakeCase(event),
    blocks
  } as any
  const breadcrumbs = shouldShowFrontendBreadcrumbs(site.settings, 'events')
    ? await getContentBreadcrumbItems({
        siteId: site.id,
        contentId: event.id,
        contentType: 'event',
        currentLabel: event.title,
      })
    : []

  return (
    <>
      <StructuredData site={site} content={eventWithBlocks} contentType="event" />
      <EventBlockRenderer
        site={site}
        event={eventWithBlocks}
        breadcrumbs={breadcrumbs}
      />
    </>
  )
}

export async function generateMetadata({ params }: EventPageProps) {
  const { slug } = await params

  if (!isValidEventSlug(slug)) {
    return {
      title: 'Event Not Found',
      description: 'The requested event could not be found.',
    }
  }

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Event Not Found',
        description: 'The requested event could not be found.',
      }
    }

    const pageData = await getCachedEventPageData(site.id, slug)
    const event = pageData.event

    return {
      title: `${event.title} | ${site.name}`,
      description: event.metaDescription || `${event.title} on ${site.name}`,
      ...buildSeoMetadata(site, event as any, 'event', `/events/${slug}`),
    }
  } catch (error) {
    return {
      title: 'Event Not Found',
      description: 'The requested event could not be found.',
    }
  }
}
