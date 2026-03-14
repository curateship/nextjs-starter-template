'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export interface Broadcast {
  id: string
  site_id: string
  name: string
  subject: string
  content: string
  from_name: string | null
  status: 'draft' | 'scheduled' | 'sending' | 'sent'
  audience_filter: Record<string, any>
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  total_sent: number
  total_opened: number
  total_clicked: number
  metadata: Record<string, any>
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

export async function getBroadcastsBySite(
  siteId: string
): Promise<{ data: Broadcast[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const { data, error } = await supabaseAdmin
      .from('newsletter_broadcasts')
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getBroadcastsBySite error:', error.message)
      return { data: null, error: 'Failed to load newsletters' }
    }

    return { data: data as Broadcast[], error: null }
  } catch (err) {
    console.error('getBroadcastsBySite error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function createBroadcast(input: {
  siteId: string
  name: string
  subject: string
  content?: string
  status?: 'draft' | 'scheduled'
}): Promise<{ data: Broadcast | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (!input.name?.trim()) return { data: null, error: 'Newsletter name is required' }
    if (!input.subject?.trim()) return { data: null, error: 'Subject is required' }

    const { data, error } = await supabaseAdmin
      .from('newsletter_broadcasts')
      .insert({
        site_id: input.siteId,
        name: input.name.trim(),
        subject: input.subject.trim(),
        content: input.content || '',
        status: input.status || 'draft',
      })
      .select()
      .single()

    if (error) {
      console.error('createBroadcast error:', error.message)
      return { data: null, error: 'Failed to create newsletter' }
    }

    return { data: data as Broadcast, error: null }
  } catch (err) {
    console.error('createBroadcast error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateBroadcast(
  broadcastId: string,
  updates: { name?: string; subject?: string; content?: string; status?: string }
): Promise<{ data: Broadcast | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(broadcastId)) return { data: null, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: broadcast } = await supabaseAdmin
      .from('newsletter_broadcasts')
      .select('site_id')
      .eq('id', broadcastId)
      .single()

    if (!broadcast) return { data: null, error: 'Newsletter not found' }

    if (!await verifySiteOwnership(broadcast.site_id, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const allowedFields: Record<string, any> = {}
    if (updates.name !== undefined) allowedFields.name = updates.name
    if (updates.subject !== undefined) allowedFields.subject = updates.subject
    if (updates.content !== undefined) allowedFields.content = updates.content
    if (updates.status !== undefined) allowedFields.status = updates.status

    const { data, error } = await supabaseAdmin
      .from('newsletter_broadcasts')
      .update(allowedFields)
      .eq('id', broadcastId)
      .select()
      .single()

    if (error) {
      console.error('updateBroadcast error:', error.message)
      return { data: null, error: 'Failed to update newsletter' }
    }

    return { data: data as Broadcast, error: null }
  } catch (err) {
    console.error('updateBroadcast error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteBroadcasts(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }
    for (const id of ids) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' }
    }

    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: broadcasts } = await supabaseAdmin
      .from('newsletter_broadcasts')
      .select('id, site_id')
      .in('id', ids)

    if (!broadcasts?.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(broadcasts.map(b => b.site_id))]
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('id')
      .in('id', siteIds)
      .eq('user_id', user.id)

    if (!sites?.length || sites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await supabaseAdmin
      .from('newsletter_broadcasts')
      .delete()
      .in('id', ids)

    if (error) {
      console.error('deleteBroadcasts error:', error.message)
      return { success: false, error: 'Failed to delete' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteBroadcasts error:', err)
    return { success: false, error: 'Server error' }
  }
}
