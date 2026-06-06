import { EventBlockRenderer } from "@/components/frontend/events/EventBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import { shouldShowFrontendBreadcrumbs } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"

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
        with recursive event_row as (
          select
            e.id,
            e.site_id as "siteId",
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
        ),
        primary_category as (
          select c.id
          from event_row e
          inner join category_relationships cr
            on cr.content_id = e.id
            and cr.content_type = 'event'
            and cr.is_primary = true
          inner join categories c on c.id = cr.category_id
          where c.site_id = ${siteId}
            and c.is_published = true
          limit 1
        ),
        category_trail as (
          select c.id, c.title, c.slug, c.parent_id, 0 as depth
          from categories c
          inner join primary_category pc on pc.id = c.id
          where c.site_id = ${siteId}
            and c.is_published = true
          union all
          select parent.id, parent.title, parent.slug, parent.parent_id, category_trail.depth + 1
          from categories parent
          inner join category_trail on parent.id = category_trail.parent_id
          where parent.site_id = ${siteId}
            and parent.is_published = true
            and category_trail.depth < 20
        ),
        breadcrumb_items as (
          select coalesce(jsonb_agg(jsonb_build_object(
            'label', title,
            'href', '/categories/' || slug
          ) order by depth desc), '[]'::jsonb) as data
          from category_trail
        )
        select
          to_jsonb(event_row) as event,
          (select data from breadcrumb_items) as breadcrumbs
        from event_row
      `)

      const row = rows.rows[0] as any
      if (!row) throw new Error(EVENT_PAGE_NOT_FOUND_ERROR)
      return row
    },
    ['event-page-data', siteId, slug],
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
    blocks = convertContentBlocksToArray((event.contentBlocks as any) || {}, event.id)
  } catch (error) {
    console.warn('Error loading event blocks:', error)
    blocks = []
  }

  const eventWithBlocks = {
    ...toSnakeCase(event),
    blocks
  } as any
  const categoryBreadcrumbs = Array.isArray(pageData.breadcrumbs)
    ? pageData.breadcrumbs as FrontendBreadcrumbItem[]
    : []
  const breadcrumbs = shouldShowFrontendBreadcrumbs(site.settings, 'events') && categoryBreadcrumbs.length > 0
    ? [...categoryBreadcrumbs, { label: event.title }]
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
