import { EventBlockRenderer } from "@/components/frontend/events/EventBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { createClient } from '@supabase/supabase-js'
import { convertContentBlocksToArray } from '@/lib/utils/event-block-utils'
import { notFound } from "next/navigation"

// Create admin client for direct database queries
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

interface EventPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params

  // Get site data from headers
  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  // Direct query to events table
  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('site_id', site.id)
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!event || error) {
    notFound()
  }

  // Convert event blocks to array format
  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray(event.content_blocks || {}, event.id)
  } catch (error) {
    console.warn('Error loading event blocks:', error)
    blocks = []
  }

  const eventWithBlocks = {
    ...event,
    blocks
  }

  return <EventBlockRenderer
    site={site}
    event={eventWithBlocks}
  />
}

export async function generateMetadata({ params }: EventPageProps) {
  const { slug } = await params

  try {
    // Get site data from headers
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Event Not Found',
        description: 'The requested event could not be found.',
      }
    }

    // Direct query to events table
    const { data: event, error } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('site_id', site.id)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (!event || error) {
      return {
        title: 'Event Not Found',
        description: 'The requested event could not be found.',
      }
    }

    return {
      title: `${event.title} | ${site.name}`,
      description: event.meta_description || event.description || `${event.title} on ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Event Not Found',
      description: 'The requested event could not be found.',
    }
  }
}
