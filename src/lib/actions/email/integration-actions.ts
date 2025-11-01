'use server'

import { createClient } from '@supabase/supabase-js'

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

/**
 * Site integration data structure
 */
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
 * Get a specific integration for a site
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
        // No rows returned - integration not configured
        return null
      }
      console.error('Error fetching site integration:', error)
      throw new Error(`Failed to fetch integration: ${error.message}`)
    }

    return data
  } catch (error) {
    console.error('Error in getSiteIntegration:', error)
    return null
  }
}

/**
 * Get all integrations for a site
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

    return data || []
  } catch (error) {
    console.error('Error in getSiteIntegrations:', error)
    return []
  }
}

/**
 * Get all enabled integrations for a site
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

    return data || []
  } catch (error) {
    console.error('Error in getEnabledIntegrations:', error)
    return []
  }
}

/**
 * Create or update an integration for a site
 */
export async function createOrUpdateIntegration(
  siteId: string,
  integrationType: string,
  config: Record<string, any>,
  isEnabled: boolean = true
): Promise<SiteIntegration> {
  try {
    // Try to upsert (insert or update)
    const { data, error } = await supabaseAdmin
      .from('site_integrations')
      .upsert(
        {
          site_id: siteId,
          integration_type: integrationType,
          config,
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

    return data
  } catch (error) {
    console.error('Error in createOrUpdateIntegration:', error)
    throw error
  }
}

/**
 * Toggle integration enabled/disabled status
 */
export async function toggleIntegration(
  integrationId: string,
  isEnabled: boolean
): Promise<void> {
  try {
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
 * Delete an integration
 */
export async function deleteIntegration(integrationId: string): Promise<void> {
  try {
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

/**
 * Get Flodesk config for a site (helper function)
 * Falls back to environment variables if not configured per-site
 */
export async function getFlodeskConfig(siteId: string): Promise<{
  apiKey: string
  segmentId?: string
} | null> {
  // First try to get site-specific configuration
  const integration = await getSiteIntegration(siteId, 'flodesk')

  if (integration && integration.is_enabled) {
    const { api_key, segment_id } = integration.config

    if (api_key) {
      return {
        apiKey: api_key,
        segmentId: segment_id,
      }
    }
  }

  // Fall back to environment variables
  const envApiKey = process.env.FLODESK_API_KEY
  const envSegmentId = process.env.FLODESK_SEGMENT_ID

  if (envApiKey) {
    return {
      apiKey: envApiKey,
      segmentId: envSegmentId,
    }
  }

  // No Flodesk configuration found
  return null
}

/**
 * Get Resend config for a site (helper function)
 * Falls back to environment variables if not configured per-site
 */
export async function getResendConfig(siteId: string): Promise<{
  apiKey?: string
  fromEmail?: string
  fromName?: string
}> {
  const integration = await getSiteIntegration(siteId, 'resend')

  if (integration && integration.is_enabled) {
    const { api_key, from_email, from_name } = integration.config
    return {
      apiKey: api_key,
      fromEmail: from_email,
      fromName: from_name,
    }
  }

  // Fall back to environment variables
  return {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.DEFAULT_FROM_EMAIL,
    fromName: process.env.DEFAULT_FROM_NAME,
  }
}
