'use server'

import { getSiteIntegration } from './integration-actions'
import type { AIProvider } from '@/lib/ai/models'

/**
 * Get Stripe config for a site from site integrations.
 */
export async function getStripeConfig(siteId: string): Promise<{
  secretKey: string
  publishableKey: string
  webhookSecret?: string
} | null> {
  const integration = await getSiteIntegration(siteId, 'stripe')

  if (integration && integration.isEnabled) {
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
 * Get Flodesk config for a site from site integrations.
 */
export async function getFlodeskConfig(siteId: string): Promise<{
  apiKey: string
  segmentId?: string
} | null> {
  const integration = await getSiteIntegration(siteId, 'flodesk')

  if (integration && integration.isEnabled) {
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
 * Get email provider config for a site from site integrations.
 * Checks enabled email-type integrations (resend, then future providers).
 */
export async function getEmailConfig(siteId: string): Promise<{
  apiKey: string
  fromEmail?: string
  fromName?: string
  providerType: string
  webhookSecret?: string
} | null> {
  // Check providers in priority order
  const providerTypes = ['resend'] as const

  for (const providerType of providerTypes) {
    const integration = await getSiteIntegration(siteId, providerType)
    if (integration && integration.isEnabled) {
      const { api_key, from_email, from_name, webhook_secret } = integration.config
      if (api_key) {
        return {
          apiKey: api_key,
          fromEmail: from_email,
          fromName: from_name,
          providerType,
          webhookSecret: webhook_secret,
        }
      }
    }
  }

  return null
}

/** @deprecated Use getEmailConfig instead */
export async function getResendConfig(siteId: string) {
  return getEmailConfig(siteId)
}

/**
 * Get AI provider config for a site. Checks anthropic → openai → google_ai in order,
 * or a specific provider when requested.
 */
export async function getAIConfig(siteId: string, preferredProvider?: AIProvider): Promise<{
  apiKey: string
  provider: AIProvider
} | null> {
  const providerTypes = preferredProvider
    ? [preferredProvider]
    : ['anthropic', 'openai', 'google_ai'] as const

  for (const providerType of providerTypes) {
    const integration = await getSiteIntegration(siteId, providerType)
    if (integration && integration.isEnabled) {
      const { api_key } = integration.config
      if (api_key) {
        return { apiKey: api_key, provider: providerType }
      }
    }
  }

  return null
}

/**
 * Get Perplexity (research) config for a site.
 */
export async function getResearchConfig(siteId: string): Promise<{
  apiKey: string
} | null> {
  const integration = await getSiteIntegration(siteId, 'perplexity')

  if (integration && integration.isEnabled) {
    const { api_key } = integration.config
    if (api_key) {
      return { apiKey: api_key }
    }
  }

  return null
}
