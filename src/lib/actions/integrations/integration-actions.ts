'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { encrypt, safeDecrypt } from '@/lib/utils/encryption'
import { SENSITIVE_FIELDS, type IntegrationType } from './types'

// Create admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* ignore in server components */ }
        },
      },
    }
  )
}

/**
 * Verify the authenticated user owns the given site.
 * Returns user ID on success, throws on failure.
 */
async function verifyOwnership(siteId: string): Promise<string> {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Authentication required')

  const { data: site, error } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('user_id', user.id)
    .single()

  if (error || !site) throw new Error('Site not found or access denied')
  return user.id
}

export interface SiteIntegration {
  id: string
  site_id: string
  integration_type: string
  config: Record<string, any>
  is_enabled: boolean
  created_at: string
  updated_at: string
}

/**
 * Encrypt sensitive fields in a config object before writing to DB.
 */
function encryptConfig(integrationType: string, config: Record<string, any>): Record<string, any> {
  const sensitiveKeys = SENSITIVE_FIELDS[integrationType as IntegrationType] || []
  if (sensitiveKeys.length === 0 || !process.env.INTEGRATION_ENCRYPTION_KEY) {
    return config
  }

  const encrypted = { ...config }
  for (const key of sensitiveKeys) {
    if (encrypted[key] && typeof encrypted[key] === 'string') {
      encrypted[key] = encrypt(encrypted[key])
    }
  }
  return encrypted
}

/**
 * Decrypt sensitive fields in a config object after reading from DB.
 */
function decryptConfig(integrationType: string, config: Record<string, any>): Record<string, any> {
  const sensitiveKeys = SENSITIVE_FIELDS[integrationType as IntegrationType] || []
  if (sensitiveKeys.length === 0 || !process.env.INTEGRATION_ENCRYPTION_KEY) {
    return config
  }

  const decrypted = { ...config }
  for (const key of sensitiveKeys) {
    if (decrypted[key] && typeof decrypted[key] === 'string') {
      decrypted[key] = safeDecrypt(decrypted[key])
    }
  }
  return decrypted
}

/**
 * Get a specific integration for a site (with decryption).
 */
export async function getSiteIntegration(
  siteId: string,
  integrationType: string
): Promise<SiteIntegration | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_integrations')
      .select('*')
      .eq('site_id', siteId)
      .eq('integration_type', integrationType)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Error fetching site integration:', error)
      throw new Error(`Failed to fetch integration: ${error.message}`)
    }

    return {
      ...data,
      config: decryptConfig(data.integration_type, data.config),
    }
  } catch (error) {
    console.error('Error in getSiteIntegration:', error)
    return null
  }
}

/**
 * Get all integrations for a site (with decryption).
 */
export async function getSiteIntegrations(
  siteId: string
): Promise<SiteIntegration[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_integrations')
      .select('*')
      .eq('site_id', siteId)
      .order('integration_type', { ascending: true })

    if (error) {
      console.error('Error fetching site integrations:', error)
      throw new Error(`Failed to fetch integrations: ${error.message}`)
    }

    return (data || []).map((row) => ({
      ...row,
      config: decryptConfig(row.integration_type, row.config),
    }))
  } catch (error) {
    console.error('Error in getSiteIntegrations:', error)
    return []
  }
}

/**
 * Get all enabled integrations for a site (with decryption).
 */
export async function getEnabledIntegrations(
  siteId: string
): Promise<SiteIntegration[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_integrations')
      .select('*')
      .eq('site_id', siteId)
      .eq('is_enabled', true)
      .order('integration_type', { ascending: true })

    if (error) {
      console.error('Error fetching enabled integrations:', error)
      throw new Error(`Failed to fetch enabled integrations: ${error.message}`)
    }

    return (data || []).map((row) => ({
      ...row,
      config: decryptConfig(row.integration_type, row.config),
    }))
  } catch (error) {
    console.error('Error in getEnabledIntegrations:', error)
    return []
  }
}

/**
 * Create or update an integration for a site (with encryption).
 */
export async function createOrUpdateIntegration(
  siteId: string,
  integrationType: string,
  config: Record<string, any>,
  isEnabled: boolean = true
): Promise<SiteIntegration> {
  try {
    await verifyOwnership(siteId)
    const encryptedConfig = encryptConfig(integrationType, config)

    const { data, error } = await supabaseAdmin
      .from('site_integrations')
      .upsert(
        {
          site_id: siteId,
          integration_type: integrationType,
          config: encryptedConfig,
          is_enabled: isEnabled,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'site_id,integration_type',
        }
      )
      .select()
      .single()

    if (error) {
      console.error('Error creating/updating integration:', error)
      throw new Error(`Failed to save integration: ${error.message}`)
    }

    return {
      ...data,
      config: decryptConfig(data.integration_type, data.config),
    }
  } catch (error) {
    console.error('Error in createOrUpdateIntegration:', error)
    throw error
  }
}

/**
 * Toggle integration enabled/disabled status.
 */
export async function toggleIntegration(
  integrationId: string,
  isEnabled: boolean
): Promise<void> {
  try {
    // Look up integration to get site_id, then verify ownership
    const { data: integration } = await supabaseAdmin
      .from('site_integrations')
      .select('site_id')
      .eq('id', integrationId)
      .single()

    if (!integration) throw new Error('Integration not found')
    await verifyOwnership(integration.site_id)

    const { error } = await supabaseAdmin
      .from('site_integrations')
      .update({
        is_enabled: isEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId)

    if (error) {
      console.error('Error toggling integration:', error)
      throw new Error(`Failed to toggle integration: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in toggleIntegration:', error)
    throw error
  }
}

/**
 * Delete an integration.
 */
export async function deleteIntegration(integrationId: string): Promise<void> {
  try {
    // Look up integration to get site_id, then verify ownership
    const { data: integration } = await supabaseAdmin
      .from('site_integrations')
      .select('site_id')
      .eq('id', integrationId)
      .single()

    if (!integration) throw new Error('Integration not found')
    await verifyOwnership(integration.site_id)

    const { error } = await supabaseAdmin
      .from('site_integrations')
      .delete()
      .eq('id', integrationId)

    if (error) {
      console.error('Error deleting integration:', error)
      throw new Error(`Failed to delete integration: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in deleteIntegration:', error)
    throw error
  }
}
