'use server'

import { createClient } from '@supabase/supabase-js'
import { convertContentBlocksToArray, type EventBlock } from '@/lib/utils/event-block-utils'

// Create admin client for frontend data access
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

export interface EventWithBlocks {
  id: string
  title: string
  slug: string
  is_published: boolean
  featured_image: string | null
  description: string | null
  meta_description: string | null
  start_date: string | null
  end_date: string | null
  location: string | null
  blocks: EventBlock[]
}

export interface GetEventResult {
  success: boolean
  event?: EventWithBlocks
  error?: string
  site?: any // For direct event access
}

/**
 * Helper function to fetch event blocks from JSON content_blocks
 */
async function fetchEventBlocks(eventId: string): Promise<EventBlock[]> {
  try {
    const { data: event, error } = await supabaseAdmin
      .from('events')
      .select('content_blocks')
      .eq('id', eventId)
      .single()

    if (error || !event) {
      console.warn('Failed to load event for blocks:', error?.message)
      return []
    }

    // Convert JSON content_blocks to EventBlock array format using shared utility
    return convertContentBlocksToArray(event.content_blocks || {}, eventId)
  } catch (error) {
    console.warn('Error loading event blocks:', error)
    return []
  }
}

/**
 * Helper function to fetch site navigation and footer
 */
async function fetchSiteBlocks(siteId: string) {
  // Get the homepage for navigation/footer blocks
  const { data: homePage } = await supabaseAdmin
    .from('pages')
    .select('*')
    .eq('site_id', siteId)
    .eq('is_homepage', true)
    .eq('is_published', true)
    .single()

  if (!homePage) {
    return { navigation: null, footer: null }
  }

  // Get navigation and footer from home page's content_blocks JSON
  if (homePage.content_blocks) {
    const blocks = Object.values(homePage.content_blocks).flat() as any[]
    const navigationBlock = blocks.find(b => b.type === 'navigation')
    const footerBlock = blocks.find(b => b.type === 'footer')

    return {
      navigation: navigationBlock?.content || null,
      footer: footerBlock?.content || null
    }
  }

  return {
    navigation: null,
    footer: null
  }
}

/**
 * Get an event by slug for a specific site (subdomain-based access)
 */
export async function getEventBySlug(siteId: string, eventSlug: string): Promise<GetEventResult> {
  try {
    // Get the event
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', eventSlug)
      .eq('is_published', true)
      .single()

    if (eventError || !event) {
      return {
        success: false,
        error: 'Event not found'
      }
    }

    // Get event blocks
    const blocks = await fetchEventBlocks(event.id)

    const eventWithBlocks: EventWithBlocks = {
      id: event.id,
      title: event.title,
      slug: event.slug,
      is_published: event.is_published,
      featured_image: event.featured_image,
      description: event.description,
      meta_description: event.meta_description,
      start_date: event.start_date,
      end_date: event.end_date,
      location: event.location,
      blocks
    }

    return {
      success: true,
      event: eventWithBlocks
    }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get an event by slug directly (for non-subdomain access at /events/[slug])
 */
export async function getEventBySlugDirect(eventSlug: string): Promise<GetEventResult> {
  try {
    // Find the event across all sites
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*, site_id')
      .eq('slug', eventSlug)
      .eq('is_published', true)
      .single()

    if (eventError || !event) {
      return {
        success: false,
        error: 'Event not found'
      }
    }

    // Get the site data
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('id', event.site_id)
      .single()

    if (siteError || !site) {
      return {
        success: false,
        error: 'Site not found for this event'
      }
    }

    // Get navigation and footer blocks from site's homepage
    const siteBlocks = await fetchSiteBlocks(site.id)

    // Get event blocks
    const blocks = await fetchEventBlocks(event.id)

    const eventWithBlocks: EventWithBlocks = {
      id: event.id,
      title: event.title,
      slug: event.slug,
      is_published: event.is_published,
      featured_image: event.featured_image,
      description: event.description,
      meta_description: event.meta_description,
      start_date: event.start_date,
      end_date: event.end_date,
      location: event.location,
      blocks
    }

    // Format site data with blocks
    const siteWithBlocks = {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.custom_domain,
      settings: site.settings,
      blocks: siteBlocks
    }

    return {
      success: true,
      event: eventWithBlocks,
      site: siteWithBlocks
    }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
