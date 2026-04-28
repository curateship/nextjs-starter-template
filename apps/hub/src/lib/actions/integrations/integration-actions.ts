'use server'

import { eq, and, asc } from 'drizzle-orm'
import { encrypt, safeDecrypt } from '@/lib/utils/encryption'
import { db } from '@/lib/db'
import { siteIntegrations, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { SENSITIVE_FIELDS, type IntegrationType } from './types'

/**
 * Verify the authenticated user owns the given site.
 * Returns user ID on success, throws on failure.
 */
async function verifyOwnership(siteId: string): Promise<string> {
  const user = await getAuthenticatedUser()
  if (!user) throw new Error('Authentication required')

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
  isEnabled: boolean
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

/**
 * Decrypt sensitive fields in a config object after reading from DB.
 */
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

/**
 * Get a specific integration for a site (with decryption).
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
      config: decryptConfig(result.integrationType, result.config as Record<string, any>),
    } as SiteIntegration
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
    await verifyOwnership(siteId)

    const results = await db
      .select()
      .from(siteIntegrations)
      .where(eq(siteIntegrations.siteId, siteId))
      .orderBy(asc(siteIntegrations.integrationType))

    return results.map((row) => ({
      ...row,
      config: decryptConfig(row.integrationType, row.config as Record<string, any>),
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
  config: Record<string, any>,
  isEnabled: boolean = true
): Promise<SiteIntegration> {
  try {
    await verifyOwnership(siteId)
    const encryptedConfig = encryptConfig(integrationType, config)

    const [result] = await db
      .insert(siteIntegrations)
      .values({
        siteId,
        integrationType,
        config: encryptedConfig,
        isEnabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [siteIntegrations.siteId, siteIntegrations.integrationType],
        set: {
          config: encryptedConfig,
          isEnabled,
          updatedAt: new Date(),
        },
      })
      .returning()

    if (!result) {
      throw new Error('Failed to save integration')
    }

    return {
      ...result,
      config: decryptConfig(result.integrationType, result.config as Record<string, any>),
    } as SiteIntegration
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
    const integration = await db.query.siteIntegrations.findFirst({
      where: eq(siteIntegrations.id, integrationId),
      columns: { siteId: true },
    })

    if (!integration) throw new Error('Integration not found')
    await verifyOwnership(integration.siteId)

    await db
      .update(siteIntegrations)
      .set({
        isEnabled,
        updatedAt: new Date(),
      })
      .where(eq(siteIntegrations.id, integrationId))
  } catch (error) {
    console.error('Error in toggleIntegration:', error)
    throw error
  }
}
