'use server'

import { getSiteIntegration } from './integration-actions'

/**
 * Get Stripe config for a site. Falls back to environment variables.
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

  // Fall back to environment variables
  const envSecretKey = process.env.STRIPE_SECRET_KEY
  const envPublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (envSecretKey && envPublishableKey) {
    return {
      secretKey: envSecretKey,
      publishableKey: envPublishableKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
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
 * Get DataForSEO config for a site. Falls back to environment variables.
 */
export async function getDataForSEOConfig(siteId: string): Promise<{
  login: string
  password: string
} | null> {
  const integration = await getSiteIntegration(siteId, 'dataforseo')

  if (integration && integration.is_enabled) {
    const { login, password } = integration.config
    if (login && password) {
      return { login, password }
    }
  }

  // Fall back to environment variables
  const envLogin = process.env.DATAFORSEO_LOGIN
  const envPassword = process.env.DATAFORSEO_PASSWORD
  if (envLogin && envPassword) {
    return { login: envLogin, password: envPassword }
  }

  return null
}

/**
 * Env var name mapping for AI providers.
 */
const AI_PROVIDER_ENV_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  google_ai: 'GOOGLE_API_KEY',
}

/**
 * Get an AI provider API key for a site. Falls back to environment variables.
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

  // Fall back to environment variables
  const envVar = AI_PROVIDER_ENV_MAP[provider]
  const envKey = envVar ? process.env[envVar] : undefined
  if (envKey) {
    return { apiKey: envKey }
  }

  return null
}

/**
 * Get Flodesk config for a site. Falls back to environment variables.
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

  // Fall back to environment variables
  const envApiKey = process.env.FLODESK_API_KEY
  const envSegmentId = process.env.FLODESK_SEGMENT_ID
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      segmentId: envSegmentId,
    }
  }

  return null
}

/**
 * Get Resend config for a site. Falls back to environment variables.
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
