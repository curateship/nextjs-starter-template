'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export interface Segment {
  id: string
  site_id: string
  name: string
  description: string
  filter_rules: { tags?: string[] }
  created_at: string
  updated_at: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifyAuth() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

async function verifySiteOwnership(siteId: string, userId: string) {
  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single()
  return !!site
}

export async function getSegmentsBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: Segment[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, total: 0, error: 'Access denied' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await supabaseAdmin
      .from('newsletter_segments')
      .select('*', { count: 'exact' })
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('getSegmentsBySite error:', error.message)
      return { data: null, total: 0, error: 'Failed to load segments' }
    }

    return { data: data as Segment[], total: count ?? 0, error: null }
  } catch (err) {
    console.error('getSegmentsBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getSegmentById(
  segmentId: string
): Promise<{ data: Segment | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { data: null, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: segment, error } = await supabaseAdmin
      .from('newsletter_segments')
      .select('*')
      .eq('id', segmentId)
      .single()

    if (error || !segment) return { data: null, error: 'Segment not found' }

    if (!await verifySiteOwnership(segment.site_id, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    return { data: segment as Segment, error: null }
  } catch (err) {
    console.error('getSegmentById error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function createSegment(input: {
  siteId: string
  name: string
  description?: string
  filterRules: { tags?: string[] }
}): Promise<{ data: Segment | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (!input.name?.trim()) return { data: null, error: 'Segment name is required' }

    const { data, error } = await supabaseAdmin
      .from('newsletter_segments')
      .insert({
        site_id: input.siteId,
        name: input.name.trim(),
        description: input.description || '',
        filter_rules: input.filterRules || {},
      })
      .select()
      .single()

    if (error) {
      console.error('createSegment error:', error.message)
      return { data: null, error: 'Failed to create segment' }
    }

    return { data: data as Segment, error: null }
  } catch (err) {
    console.error('createSegment error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateSegment(
  segmentId: string,
  updates: { name?: string; description?: string; filterRules?: { tags?: string[] } }
): Promise<{ data: Segment | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { data: null, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: segment } = await supabaseAdmin
      .from('newsletter_segments')
      .select('site_id')
      .eq('id', segmentId)
      .single()

    if (!segment) return { data: null, error: 'Segment not found' }

    if (!await verifySiteOwnership(segment.site_id, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const allowedFields: Record<string, any> = { updated_at: new Date().toISOString() }
    if (updates.name !== undefined) allowedFields.name = updates.name
    if (updates.description !== undefined) allowedFields.description = updates.description
    if (updates.filterRules !== undefined) allowedFields.filter_rules = updates.filterRules

    const { data, error } = await supabaseAdmin
      .from('newsletter_segments')
      .update(allowedFields)
      .eq('id', segmentId)
      .select()
      .single()

    if (error) {
      console.error('updateSegment error:', error.message)
      return { data: null, error: 'Failed to update segment' }
    }

    return { data: data as Segment, error: null }
  } catch (err) {
    console.error('updateSegment error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteSegments(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }
    for (const id of ids) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' }
    }

    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: segments } = await supabaseAdmin
      .from('newsletter_segments')
      .select('id, site_id')
      .in('id', ids)

    if (!segments?.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(segments.map(s => s.site_id))]
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('id')
      .in('id', siteIds)
      .eq('user_id', user.id)

    if (!sites?.length || sites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await supabaseAdmin
      .from('newsletter_segments')
      .delete()
      .in('id', ids)

    if (error) {
      console.error('deleteSegments error:', error.message)
      return { success: false, error: 'Failed to delete' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteSegments error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function getSegmentContactCount(
  segmentId: string
): Promise<{ count: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { count: 0, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { count: 0, error: 'Not authenticated' }

    const { data: segment } = await supabaseAdmin
      .from('newsletter_segments')
      .select('site_id, filter_rules')
      .eq('id', segmentId)
      .single()

    if (!segment) return { count: 0, error: 'Segment not found' }

    if (!await verifySiteOwnership(segment.site_id, user.id)) {
      return { count: 0, error: 'Access denied' }
    }

    let query = supabaseAdmin
      .from('newsletter_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', segment.site_id)
      .eq('status', 'active')

    const rules = segment.filter_rules as { tags?: string[] }
    if (rules.tags?.length) {
      for (const tag of rules.tags) {
        query = query.contains('metadata', { tags: [tag] })
      }
    }

    const { count, error } = await query

    if (error) {
      console.error('getSegmentContactCount error:', error.message)
      return { count: 0, error: 'Failed to count' }
    }

    return { count: count ?? 0, error: null }
  } catch (err) {
    console.error('getSegmentContactCount error:', err)
    return { count: 0, error: 'Server error' }
  }
}

export async function addContactsToSegment(
  contactIds: string[],
  segmentId: string
): Promise<{ updated: number; error: string | null }> {
  try {
    if (!contactIds.length) return { updated: 0, error: 'No contacts selected' }
    if (!UUID_REGEX.test(segmentId)) return { updated: 0, error: 'Invalid segment ID' }
    for (const id of contactIds) {
      if (!UUID_REGEX.test(id)) return { updated: 0, error: 'Invalid contact ID' }
    }

    const user = await verifyAuth()
    if (!user) return { updated: 0, error: 'Not authenticated' }

    const { data: segment } = await supabaseAdmin
      .from('newsletter_segments')
      .select('site_id, filter_rules')
      .eq('id', segmentId)
      .single()

    if (!segment) return { updated: 0, error: 'Segment not found' }

    if (!await verifySiteOwnership(segment.site_id, user.id)) {
      return { updated: 0, error: 'Access denied' }
    }

    const segmentTags: string[] = segment.filter_rules?.tags || []
    if (!segmentTags.length) return { updated: 0, error: 'Segment has no tags to add' }

    // Fetch contacts and merge tags
    const { data: contacts } = await supabaseAdmin
      .from('newsletter_contacts')
      .select('id, metadata')
      .in('id', contactIds)
      .eq('site_id', segment.site_id)

    if (!contacts?.length) return { updated: 0, error: 'No matching contacts found' }

    let updated = 0
    for (const contact of contacts) {
      const existingTags: string[] = contact.metadata?.tags || []
      const mergedTags = [...new Set([...existingTags, ...segmentTags])]
      if (mergedTags.length === existingTags.length) continue // no new tags

      const { error } = await supabaseAdmin
        .from('newsletter_contacts')
        .update({ metadata: { ...contact.metadata, tags: mergedTags } })
        .eq('id', contact.id)

      if (!error) updated++
    }

    return { updated, error: null }
  } catch (err) {
    console.error('addContactsToSegment error:', err)
    return { updated: 0, error: 'Server error' }
  }
}
