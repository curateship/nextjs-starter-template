'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export interface NewsletterTemplate {
  id: string
  site_id: string
  name: string
  content_blocks: Record<string, any>
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

export async function getTemplatesBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: NewsletterTemplate[] | null; total: number; error: string | null }> {
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
      .from('newsletter_templates')
      .select('*', { count: 'exact' })
      .eq('site_id', siteId)
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('getTemplatesBySite error:', error.message)
      return { data: null, total: 0, error: 'Failed to load templates' }
    }

    return { data: data as NewsletterTemplate[], total: count ?? 0, error: null }
  } catch (err) {
    console.error('getTemplatesBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getTemplateById(
  templateId: string
): Promise<{ data: NewsletterTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: template, error } = await supabaseAdmin
      .from('newsletter_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (error || !template) return { data: null, error: 'Template not found' }

    if (!await verifySiteOwnership(template.site_id, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    return { data: template as NewsletterTemplate, error: null }
  } catch (err) {
    console.error('getTemplateById error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function createTemplate(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: NewsletterTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (!input.name?.trim()) return { data: null, error: 'Template name is required' }

    const { data, error } = await supabaseAdmin
      .from('newsletter_templates')
      .insert({
        site_id: input.siteId,
        name: input.name.trim(),
        content_blocks: input.contentBlocks || {},
      })
      .select()
      .single()

    if (error) {
      console.error('createTemplate error:', error.message)
      return { data: null, error: 'Failed to create template' }
    }

    return { data: data as NewsletterTemplate, error: null }
  } catch (err) {
    console.error('createTemplate error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateTemplate(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: NewsletterTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: template } = await supabaseAdmin
      .from('newsletter_templates')
      .select('site_id')
      .eq('id', templateId)
      .single()

    if (!template) return { data: null, error: 'Template not found' }

    if (!await verifySiteOwnership(template.site_id, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const allowedFields: Record<string, any> = { updated_at: new Date().toISOString() }
    if (updates.name !== undefined) allowedFields.name = updates.name
    if (updates.content_blocks !== undefined) allowedFields.content_blocks = updates.content_blocks

    const { data, error } = await supabaseAdmin
      .from('newsletter_templates')
      .update(allowedFields)
      .eq('id', templateId)
      .select()
      .single()

    if (error) {
      console.error('updateTemplate error:', error.message)
      return { data: null, error: 'Failed to update template' }
    }

    return { data: data as NewsletterTemplate, error: null }
  } catch (err) {
    console.error('updateTemplate error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteTemplates(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }
    for (const id of ids) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' }
    }

    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: templates } = await supabaseAdmin
      .from('newsletter_templates')
      .select('id, site_id')
      .in('id', ids)

    if (!templates?.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(templates.map(t => t.site_id))]
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('id')
      .in('id', siteIds)
      .eq('user_id', user.id)

    if (!sites?.length || sites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await supabaseAdmin
      .from('newsletter_templates')
      .delete()
      .in('id', ids)

    if (error) {
      console.error('deleteTemplates error:', error.message)
      return { success: false, error: 'Failed to delete' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteTemplates error:', err)
    return { success: false, error: 'Server error' }
  }
}
