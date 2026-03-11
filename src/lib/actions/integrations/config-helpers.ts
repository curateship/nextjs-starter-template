'use server'

import { getSiteIntegration } from './integration-actions'

/**
 * Get Stripe config for a site from site integrations.
 */
export async function getStripeConfig(siteId: string): Promise<{
  secretKey: string
  publishableKey: string
  webhookSecret?: string
} | null> {
  const integration = await getSiteIntegration(siteId, 'stripe')

  if (integration && integration.is_enabled) {
    const { secret_key, publishable_key, webhook_secret } = integration.config
    if (secret_key && publishable_key) {
      return {
        secretKey: secret_key,
        publishableKey: publishable_key,
        webhookSecret: webhook_secret,
      }
    }
  }

  return null
}

/**
 * Get just the Stripe publishable key for a site (safe to expose client-side).
 */
export async function getStripePublishableKey(siteId: string): Promise<string | null> {
  const config = await getStripeConfig(siteId)
  return config?.publishableKey ?? null
}

/**
 * Get an AI provider API key for a site from site integrations.
 */
export async function getAIProviderConfig(
  siteId: string,
  provider: string
): Promise<{ apiKey: string } | null> {
  const integration = await getSiteIntegration(siteId, provider)

  if (integration && integration.is_enabled) {
    const { api_key } = integration.config
    if (api_key) {
      return { apiKey: api_key }
    }
  }

  return null
}

/**
 * Get Flodesk config for a site from site integrations.
 */
export async function getFlodeskConfig(siteId: string): Promise<{
  apiKey: string
  segmentId?: string
} | null> {
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

  return null
}

/**
 * Get Resend config for a site from site integrations.
 */
export async function getResendConfig(siteId: string): Promise<{
  apiKey?: string
  fromEmail?: string
  fromName?: string
} | null> {
  const integration = await getSiteIntegration(siteId, 'resend')

  if (integration && integration.is_enabled) {
    const { api_key, from_email, from_name } = integration.config
    return {
      apiKey: api_key,
      fromEmail: from_email,
      fromName: from_name,
    }
  }

  return null
}
