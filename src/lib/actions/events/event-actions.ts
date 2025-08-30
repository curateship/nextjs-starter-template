'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidateTag } from 'next/cache'

// Create admin client with service role key for admin operations
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

// Create server client to access user session
async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

// Helper functions to work with is_private in content_blocks
function getIsPrivateFromContentBlocks(content_blocks: Record<string, any>): boolean {
  return content_blocks?._settings?.is_private === true
}

function setIsPrivateInContentBlocks(content_blocks: Record<string, any>, is_private: boolean): Record<string, any> {
  return {
    ...content_blocks,
    _settings: {
      ...content_blocks._settings,
      is_private
    }
  }
}

export interface Event {
  id: string
  site_id: string
  title: string
  slug: string
  is_published: boolean
  display_order: number
  content_blocks: Record<string, any>
  featured_image: string | null
  description: string | null
  meta_description: string | null
  created_at: string
  updated_at: string
}

export interface EventWithDetails extends Event {
  site_name: string
  subdomain: string
  user_id: string
}

export interface CreateEventData {
  title: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
}

export interface UpdateEventData {
  title?: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 100)
}

export async function getSiteEventsAction(siteId: string) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Use admin client to verify site ownership
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found' }
    }

    if (site.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Get events for the site using admin client
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (eventsError) {
      return { data: null, error: eventsError.message }
    }

    return { data: events as Event[], error: null }
  } catch (error) {
    console.error('Error fetching events:', error)
    return { data: null, error: 'Failed to fetch events' }
  }
}

export async function createEventAction(siteId: string, data: CreateEventData) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Verify user owns the site using admin client
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      return { data: null, error: 'Site not found' }
    }

    if (site.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Generate slug if not provided
    const slug = data.slug || generateSlug(data.title)

    // Check if slug is already taken for this site
    const { data: existingEvent } = await supabaseAdmin
      .from('events')
      .select('id')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (existingEvent) {
      return { data: null, error: 'An event with this slug already exists' }
    }

    // Get the highest display_order for this site
    const { data: maxOrderEvent } = await supabaseAdmin
      .from('events')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextDisplayOrder = maxOrderEvent ? maxOrderEvent.display_order + 1 : 0

    // Create the event using admin client
    const { data: newEvent, error: createError } = await supabaseAdmin
      .from('events')
      .insert({
        site_id: siteId,
        title: data.title,
        slug,
        is_published: data.is_published ?? false,
        featured_image: data.featured_image || null,
        description: data.description || null,
        meta_description: data.meta_description || null,
        content_blocks: data.content_blocks || {},
        display_order: nextDisplayOrder
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    // Revalidate cache
    revalidateTag('events')
    revalidateTag(`site-${siteId}`)

    return { data: newEvent as Event, error: null }
  } catch (error) {
    console.error('Error creating event:', error)
    return { data: null, error: 'Failed to create event' }
  }
}

export async function updateEventAction(eventId: string, data: UpdateEventData) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the event to verify ownership
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*, sites!inner(user_id)')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return { data: null, error: 'Event not found' }
    }

    if (event.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // If slug is being updated, check if it's already taken
    if (data.slug && data.slug !== event.slug) {
      const { data: existingEvent } = await supabaseAdmin
        .from('events')
        .select('id')
        .eq('site_id', event.site_id)
        .eq('slug', data.slug)
        .neq('id', eventId)
        .single()

      if (existingEvent) {
        return { data: null, error: 'An event with this slug already exists' }
      }
    }

    // Update the event
    const { data: updatedEvent, error: updateError } = await supabaseAdmin
      .from('events')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId)
      .select()
      .single()

    if (updateError) {
      return { data: null, error: updateError.message }
    }

    // Revalidate cache
    revalidateTag('events')
    revalidateTag(`event-${eventId}`)
    revalidateTag(`site-${event.site_id}`)

    return { data: updatedEvent as Event, error: null }
  } catch (error) {
    console.error('Error updating event:', error)
    return { data: null, error: 'Failed to update event' }
  }
}

export async function deleteEventAction(eventId: string) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the event to verify ownership
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*, sites!inner(user_id)')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return { success: false, error: 'Event not found' }
    }

    if (event.sites.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Delete the event
    const { error: deleteError } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('id', eventId)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Revalidate cache
    revalidateTag('events')
    revalidateTag(`event-${eventId}`)
    revalidateTag(`site-${event.site_id}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error deleting event:', error)
    return { success: false, error: 'Failed to delete event' }
  }
}

export async function duplicateEventAction(eventId: string, newTitle: string) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the event to duplicate
    const { data: originalEvent, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*, sites!inner(user_id)')
      .eq('id', eventId)
      .single()

    if (eventError || !originalEvent) {
      return { data: null, error: 'Event not found' }
    }

    if (originalEvent.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Generate a unique slug for the duplicate
    const baseSlug = generateSlug(newTitle)
    let slug = baseSlug
    let counter = 1

    while (true) {
      const { data: existingEvent } = await supabaseAdmin
        .from('events')
        .select('id')
        .eq('site_id', originalEvent.site_id)
        .eq('slug', slug)
        .single()

      if (!existingEvent) break
      slug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the highest display_order for this site
    const { data: maxOrderEvent } = await supabaseAdmin
      .from('events')
      .select('display_order')
      .eq('site_id', originalEvent.site_id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextDisplayOrder = maxOrderEvent ? maxOrderEvent.display_order + 1 : 0

    // Create the duplicate
    const { data: newEvent, error: createError } = await supabaseAdmin
      .from('events')
      .insert({
        site_id: originalEvent.site_id,
        title: newTitle,
        slug,
        is_published: false, // Always create duplicates as draft
        featured_image: originalEvent.featured_image,
        description: originalEvent.description,
        meta_description: originalEvent.meta_description,
        content_blocks: originalEvent.content_blocks || {},
        display_order: nextDisplayOrder
      })
      .select()
      .single()

    if (createError) {
      return { data: null, error: createError.message }
    }

    // Revalidate cache
    revalidateTag('events')
    revalidateTag(`site-${originalEvent.site_id}`)

    return { data: newEvent as Event, error: null }
  } catch (error) {
    console.error('Error duplicating event:', error)
    return { data: null, error: 'Failed to duplicate event' }
  }
}

export async function getEventBySlugAction(siteId: string, slug: string) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the event with site details
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*, sites!inner(user_id, name, subdomain)')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .single()

    if (eventError || !event) {
      return { data: null, error: 'Event not found' }
    }

    if (event.sites.user_id !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    const eventWithDetails: EventWithDetails = {
      ...event,
      site_name: event.sites.name,
      subdomain: event.sites.subdomain,
      user_id: event.sites.user_id
    }

    return { data: eventWithDetails, error: null }
  } catch (error) {
    console.error('Error fetching event:', error)
    return { data: null, error: 'Failed to fetch event' }
  }
}