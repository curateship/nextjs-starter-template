import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteIntegrations } from '@/lib/db/schema'
import { safeDecrypt } from '@/lib/utils/encryption'
import type { AIProvider } from '@/lib/utils/ai-models'
import { SENSITIVE_FIELDS, type IntegrationType } from './types'

function decryptConfig(integrationType: string, config: Record<string, any>): Record<string, any> {
  const sensitiveKeys = SENSITIVE_FIELDS[integrationType as IntegrationType] || []
  if (sensitiveKeys.length === 0) {
    return config
  }
  if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY is required before reading integration secrets')
  }

  const decrypted = { ...config }
  for (const key of sensitiveKeys) {
    if (decrypted[key] && typeof decrypted[key] === 'string') {
      decrypted[key] = safeDecrypt(decrypted[key])
    }
  }
  return decrypted
}

async function getServerIntegration(siteId: string, integrationType: string) {
  const integration = await db.query.siteIntegrations.findFirst({
    where: and(
      eq(siteIntegrations.siteId, siteId),
      eq(siteIntegrations.integrationType, integrationType),
    ),
  })

  if (!integration) {
    return null
  }

  return {
    ...integration,
    config: decryptConfig(integration.integrationType, integration.config as Record<string, any>),
  }
}

/**
 * Get Stripe config for a site from site integrations.
 */
export async function getStripeConfig(siteId: string): Promise<{
  secretKey: string
  publishableKey: string
  webhookSecret?: string
  mode: 'live' | 'sandbox'
} | null> {
  const integration = await getServerIntegration(siteId, 'stripe')

  if (integration) {
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
    const integration = await getServerIntegration(siteId, providerType)
    if (integration) {
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
    const integration = await getServerIntegration(siteId, providerType)
    if (integration) {
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
  const integration = await getServerIntegration(siteId, 'perplexity')

  if (integration) {
    const { api_key } = integration.config
    if (api_key) {
      return { apiKey: api_key }
    }
  }

  return null
}
