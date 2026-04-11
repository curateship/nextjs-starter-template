'use server'

import { getSiteIntegration } from './integration-actions'
import type { AIProvider } from '@/lib/utils/ai-models'

/**
 * Get Stripe config for a site from site integrations.
 */
export async function getStripeConfig(siteId: string): Promise<{
  secretKey: string
  publishableKey: string
  webhookSecret?: string
  mode: 'live' | 'sandbox'
} | null> {
  const integration = await getSiteIntegration(siteId, 'stripe')

  if (integration && integration.isEnabled) {
    const mode = integration.config.mode === 'sandbox' ? 'sandbox' : 'live'
    const secretKey = mode === 'sandbox' ? integration.config.sandbox_secret_key : integration.config.secret_key
    const publishableKey = mode === 'sandbox' ? integration.config.sandbox_publishable_key : integration.config.publishable_key
    const webhookSecret = mode === 'sandbox' ? integration.config.sandbox_webhook_secret : integration.config.webhook_secret

    if (secretKey && publishableKey) {
      return {
        secretKey,
        publishableKey,
        webhookSecret,
        mode,
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
