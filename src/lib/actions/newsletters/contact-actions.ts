'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { verifyUnsubscribeToken } from '@/lib/utils/unsubscribe-token'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export interface CrmContact {
  id: string
  site_id: string
  email: string
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained'
  engagement_score: number
  last_engaged_at: string | null
  bounce_count: number
  metadata: {
    first_name?: string
    last_name?: string
    source?: string
    source_product_id?: string
    tags?: string[]
    [key: string]: any
  }
  created_at: string
  updated_at: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_STATUSES = ['active', 'unsubscribed', 'bounced', 'complained'] as const
const MAX_IMPORT_SIZE = 50000

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

export async function createOrUpsertContact(input: {
  siteId: string
  email: string
  firstName?: string
  lastName?: string
  source?: string
  sourceProductId?: string
  tags?: string[]
}): Promise<{ data: CrmContact | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const email = input.email?.toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { data: null, error: 'Invalid email address' }
    }

    const metadata: Record<string, any> = {}
    if (input.firstName) metadata.first_name = input.firstName
    if (input.lastName) metadata.last_name = input.lastName
    if (input.source) metadata.source = input.source
    if (input.sourceProductId) metadata.source_product_id = input.sourceProductId
    if (input.tags?.length) metadata.tags = input.tags

    const { data, error } = await supabaseAdmin
      .from('newsletter_contacts')
      .upsert({
        site_id: input.siteId,
        email,
        metadata,
      }, { onConflict: 'site_id,email' })
      .select()
      .single()

    if (error) {
      console.error('createOrUpsertContact error:', error.message)
      return { data: null, error: 'Failed to save contact' }
    }
    return { data: data as CrmContact, error: null }
  } catch (err) {
    console.error('createOrUpsertContact error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function bulkImportContacts(input: {
  siteId: string
  contacts: { email: string; first_name?: string; last_name?: string; tags?: string[] }[]
}): Promise<{ imported: number; skipped: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { imported: 0, skipped: 0, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { imported: 0, skipped: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { imported: 0, skipped: 0, error: 'Access denied' }
    }

    if (!input.contacts.length) return { imported: 0, skipped: 0, error: 'No contacts provided' }

    if (input.contacts.length > MAX_IMPORT_SIZE) {
      return { imported: 0, skipped: 0, error: `Maximum ${MAX_IMPORT_SIZE.toLocaleString()} contacts per import` }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const valid: typeof input.contacts = []
    let skipped = 0

    for (const c of input.contacts) {
      const email = c.email?.toLowerCase()
      if (email && emailRegex.test(email)) {
        valid.push({ ...c, email })
      } else {
        skipped++
      }
    }

    if (!valid.length) return { imported: 0, skipped, error: 'No valid emails found' }

    // Dedupe by email — last occurrence wins
    const deduped = new Map<string, typeof valid[0]>()
    for (const c of valid) {
      deduped.set(c.email, c)
    }
    const uniqueContacts = Array.from(deduped.values())
    skipped += valid.length - uniqueContacts.length

    // Process in batches of 500
    const batchSize = 500
    let imported = 0

    for (let i = 0; i < uniqueContacts.length; i += batchSize) {
      const batch = uniqueContacts.slice(i, i + batchSize)
      const rows = batch.map(c => {
        const metadata: Record<string, any> = { source: 'import' }
        if (c.first_name) metadata.first_name = c.first_name
        if (c.last_name) metadata.last_name = c.last_name
        if (c.tags?.length) metadata.tags = c.tags
        return {
          site_id: input.siteId,
          email: c.email,
          metadata,
        }
      })

      const { data, error } = await supabaseAdmin
        .from('newsletter_contacts')
        .upsert(rows, { onConflict: 'site_id,email', ignoreDuplicates: false })
        .select('id')

      if (error) {
        console.error('bulkImportContacts batch error:', error.message)
        return { imported, skipped, error: 'Failed to import batch' }
      }
      imported += data?.length ?? 0
    }

    return { imported, skipped, error: null }
  } catch (err) {
    console.error('bulkImportContacts error:', err)
    return { imported: 0, skipped: 0, error: 'Server error' }
  }
}

export async function updateContact(
  contactId: string,
  updates: { metadata?: Record<string, any>; status?: CrmContact['status'] }
): Promise<{ data: CrmContact | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(contactId)) return { data: null, error: 'Invalid contact ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: contact } = await supabaseAdmin
      .from('newsletter_contacts')
      .select('site_id, metadata')
      .eq('id', contactId)
      .single()

    if (!contact) return { data: null, error: 'Contact not found' }

    if (!await verifySiteOwnership(contact.site_id, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status)) {
      return { data: null, error: 'Invalid status' }
    }

    const updateFields: Record<string, any> = {}
    if (updates.status !== undefined) updateFields.status = updates.status
    if (updates.metadata !== undefined) {
      updateFields.metadata = { ...contact.metadata, ...updates.metadata }
    }

    const { data, error } = await supabaseAdmin
      .from('newsletter_contacts')
      .update(updateFields)
      .eq('id', contactId)
      .select()
      .single()

    if (error) {
      console.error('updateContact error:', error.message)
      return { data: null, error: 'Failed to update contact' }
    }
    return { data: data as CrmContact, error: null }
  } catch (err) {
    console.error('updateContact error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteContacts(contactIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!contactIds.length) return { success: false, error: 'No contacts selected' }
    for (const id of contactIds) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid contact ID' }
    }

    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: contacts } = await supabaseAdmin
      .from('newsletter_contacts')
      .select('id, site_id')
      .in('id', contactIds)

    if (!contacts?.length) return { success: false, error: 'Contacts not found' }

    const siteIds = [...new Set(contacts.map(c => c.site_id))]
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('id')
      .in('id', siteIds)
      .eq('user_id', user.id)

    if (!sites?.length || sites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await supabaseAdmin
      .from('newsletter_contacts')
      .delete()
      .in('id', contactIds)

    if (error) {
      console.error('deleteContacts error:', error.message)
      return { success: false, error: 'Failed to delete contacts' }
    }
    return { success: true, error: null }
  } catch (err) {
    console.error('deleteContacts error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function getContactsWithStats(
  siteId: string,
  options?: { source?: string; status?: string; page?: number; pageSize?: number }
): Promise<{
  data: CrmContact[] | null
  total: number
  stats: { total: number; active: number; unsubscribed: number; bounced: number; bySource: Record<string, number> } | null
  error: string | null
}> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, stats: null, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, total: 0, stats: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, total: 0, stats: null, error: 'Access denied' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let contactsQuery = supabaseAdmin
      .from('newsletter_contacts')
      .select('*', { count: 'exact' })
      .eq('site_id', siteId)

    if (options?.source && options.source !== 'all') {
      contactsQuery = contactsQuery.eq('metadata->>source', options.source)
    }
    if (options?.status && options.status !== 'all') {
      contactsQuery = contactsQuery.eq('status', options.status)
    }

    contactsQuery = contactsQuery.order('created_at', { ascending: false }).range(from, to)

    const statsQuery = supabaseAdmin
      .from('newsletter_contacts')
      .select('status, metadata')
      .eq('site_id', siteId)

    const [contactsResult, statsResult] = await Promise.all([contactsQuery, statsQuery])

    if (contactsResult.error) {
      console.error('getContactsWithStats contacts error:', contactsResult.error.message)
      return { data: null, total: 0, stats: null, error: 'Failed to load contacts' }
    }

    let stats = null
    if (!statsResult.error && statsResult.data) {
      stats = {
        total: statsResult.data.length,
        active: 0,
        unsubscribed: 0,
        bounced: 0,
        bySource: {} as Record<string, number>,
      }
      for (const c of statsResult.data) {
        if (c.status === 'active') stats.active++
        else if (c.status === 'unsubscribed') stats.unsubscribed++
        else if (c.status === 'bounced' || c.status === 'complained') stats.bounced++
        const source = c.metadata?.source || 'manual'
        stats.bySource[source] = (stats.bySource[source] || 0) + 1
      }
    }

    return { data: contactsResult.data as CrmContact[], total: contactsResult.count ?? 0, stats, error: null }
  } catch (err) {
    console.error('getContactsWithStats error:', err)
    return { data: null, total: 0, stats: null, error: 'Server error' }
  }
}

/** Public unsubscribe — requires signed HMAC token to prevent abuse */
export async function unsubscribeContact(
  siteId: string,
  email: string,
  token: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { success: false, error: 'Invalid request' }

    const emailLower = email?.toLowerCase()
    if (!emailLower) return { success: false, error: 'Invalid request' }

    if (!token || !verifyUnsubscribeToken(siteId, emailLower, token)) {
      return { success: false, error: 'Invalid unsubscribe link' }
    }

    // Intentionally returns success even if no row matched, to prevent email enumeration
    const { error } = await supabaseAdmin
      .from('newsletter_contacts')
      .update({ status: 'unsubscribed' })
      .eq('site_id', siteId)
      .eq('email', emailLower)

    if (error) {
      console.error('unsubscribeContact error:', error.message)
      return { success: false, error: 'Something went wrong' }
    }
    return { success: true, error: null }
  } catch (err) {
    console.error('unsubscribeContact error:', err)
    return { success: false, error: 'Server error' }
  }
}
