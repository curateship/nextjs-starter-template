'use server'

import { eq, and, asc } from 'drizzle-orm'
import { encrypt } from '@/lib/utils/encryption'
import { db } from '@/lib/db'
import { siteIntegrations, sites } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/db/helpers'
import { SENSITIVE_FIELDS, type IntegrationType } from './types'

/**
 * Verify the authenticated user owns the given site.
 * Returns user ID on success, throws on failure.
 */
async function verifyOwnership(siteId: string): Promise<string> {
  const user = await requireAdmin()

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true },
  })

  if (!site) throw new Error('Site not found or access denied')
  return user.id
}

export interface SiteIntegration {
  id: string
  siteId: string
  integrationType: string
  config: Record<string, any>
  configuredSensitiveFields: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Encrypt sensitive fields in a config object before writing to DB.
 */
function encryptConfig(integrationType: string, config: Record<string, any>): Record<string, any> {
  const sensitiveKeys = SENSITIVE_FIELDS[integrationType as IntegrationType] || []
  if (sensitiveKeys.length === 0) {
    return config
  }
  if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY is required before saving integration secrets')
  }

  const encrypted = { ...config }
  for (const key of sensitiveKeys) {
    if (encrypted[key] && typeof encrypted[key] === 'string') {
      encrypted[key] = encrypt(encrypted[key])
    }
  }
  return encrypted
}

function removeBlankSensitiveFields(integrationType: string, config: Record<string, any>): Record<string, any> {
  const sensitiveKeys = SENSITIVE_FIELDS[integrationType as IntegrationType] || []
  const cleaned = { ...config }
  for (const key of sensitiveKeys) {
    if (typeof cleaned[key] === 'string' && cleaned[key].trim() === '') {
      delete cleaned[key]
    }
  }
  return cleaned
}

function maskSensitiveConfig(integrationType: string, config: Record<string, any>): Record<string, any> {
  const sensitiveKeys = SENSITIVE_FIELDS[integrationType as IntegrationType] || []
  const masked = { ...config }
  for (const key of sensitiveKeys) {
    delete masked[key]
  }
  return masked
}

function getConfiguredSensitiveFields(integrationType: string, config: Record<string, any>): string[] {
  const sensitiveKeys = SENSITIVE_FIELDS[integrationType as IntegrationType] || []
  return sensitiveKeys.filter((key) => {
    const value = config[key]
    return typeof value === 'string' ? value.trim() !== '' : value != null
  })
}

/**
 * Get a specific integration for a site. Sensitive config values are omitted.
 */
export async function getSiteIntegration(
  siteId: string,
  integrationType: string
): Promise<SiteIntegration | null> {
  try {
    await verifyOwnership(siteId)

    const result = await db.query.siteIntegrations.findFirst({
      where: and(
        eq(siteIntegrations.siteId, siteId),
        eq(siteIntegrations.integrationType, integrationType)
      ),
    })

    if (!result) {
      return null
    }

    return {
      ...result,
      configuredSensitiveFields: getConfiguredSensitiveFields(
        result.integrationType,
        result.config as Record<string, any>
      ),
      config: maskSensitiveConfig(result.integrationType, result.config as Record<string, any>),
    } as SiteIntegration
  } catch (error) {
    console.error('Error in getSiteIntegration:', error)
    return null
  }
}

/**
 * Get all integrations for a site. Sensitive config values are omitted.
 */
export async function getSiteIntegrations(
  siteId: string
): Promise<SiteIntegration[]> {
  try {
    await verifyOwnership(siteId)

    const results = await db
      .select()
      .from(siteIntegrations)
      .where(eq(siteIntegrations.siteId, siteId))
      .orderBy(asc(siteIntegrations.integrationType))

    return results.map((row) => ({
      ...row,
      configuredSensitiveFields: getConfiguredSensitiveFields(
        row.integrationType,
        row.config as Record<string, any>
      ),
      config: maskSensitiveConfig(row.integrationType, row.config as Record<string, any>),
    })) as unknown as SiteIntegration[]
  } catch (error) {
    console.error('Error in getSiteIntegrations:', error)
    return []
  }
}

/**
 * Create or update an integration for a site (with encryption).
 */
export async function createOrUpdateIntegration(
  siteId: string,
  integrationType: string,
  config: Record<string, any>
): Promise<SiteIntegration> {
  try {
    await verifyOwnership(siteId)
    const submittedConfig = removeBlankSensitiveFields(integrationType, config)
    const encryptedConfig = encryptConfig(integrationType, submittedConfig)
    const existing = await db.query.siteIntegrations.findFirst({
      where: and(
        eq(siteIntegrations.siteId, siteId),
        eq(siteIntegrations.integrationType, integrationType)
      ),
      columns: { config: true },
    })
    const configToSave = {
      ...((existing?.config as Record<string, any> | undefined) ?? {}),
      ...encryptedConfig,
    }

    const [result] = await db
      .insert(siteIntegrations)
      .values({
        siteId,
        integrationType,
        config: configToSave,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [siteIntegrations.siteId, siteIntegrations.integrationType],
        set: {
          config: configToSave,
          updatedAt: new Date(),
        },
      })
      .returning()

    if (!result) {
      throw new Error('Failed to save integration')
    }

    return {
      ...result,
      configuredSensitiveFields: getConfiguredSensitiveFields(
        result.integrationType,
        result.config as Record<string, any>
      ),
      config: maskSensitiveConfig(result.integrationType, result.config as Record<string, any>),
    } as SiteIntegration
  } catch (error) {
    console.error('Error in createOrUpdateIntegration:', error)
    throw error
  }
}
