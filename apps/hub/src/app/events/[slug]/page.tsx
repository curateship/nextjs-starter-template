import { EventBlockRenderer } from "@/components/frontend/events/EventBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { events } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import { headers } from "next/headers"
import { getSessionCookie } from "better-auth/cookies"

interface EventPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params
  const isLoggedIn = !!getSessionCookie(await headers())

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  const [event] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.siteId, site.id),
        eq(events.slug, slug),
        eq(events.isPublished, true)
      )
    )
    .limit(1)

  if (!event) {
    notFound()
  }

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

  return (
    <>
      <StructuredData site={site} content={eventWithBlocks} contentType="event" />
      <EventBlockRenderer
        site={site}
        event={eventWithBlocks}
        initialHasSession={isLoggedIn}
      />
    </>
  )
}

export async function generateMetadata({ params }: EventPageProps) {
  const { slug } = await params

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Event Not Found',
        description: 'The requested event could not be found.',
      }
    }

    const [event] = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.siteId, site.id),
          eq(events.slug, slug),
          eq(events.isPublished, true)
        )
      )
      .limit(1)

    if (!event) {
      return {
        title: 'Event Not Found',
        description: 'The requested event could not be found.',
      }
    }

    return {
      title: `${event.title} | ${site.name}`,
      description: event.metaDescription || event.description || `${event.title} on ${site.name}`,
      ...buildSeoMetadata(site, event as any, 'event', `/events/${slug}`),
    }
  } catch (error) {
    return {
      title: 'Event Not Found',
      description: 'The requested event could not be found.',
    }
  }
}
