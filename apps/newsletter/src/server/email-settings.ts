import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { encrypt, safeDecrypt } from "@/server/encryption"
import { newsletterEmailSettings } from "@/server/schema"
import { now } from "@/server/security"

export async function getEmailSettings(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select()
    .from(newsletterEmailSettings)
    .where(eq(newsletterEmailSettings.workspaceId, workspaceId))
    .limit(1)

  return row ?? null
}

export async function saveEmailSettings(
  workspaceId: string,
  input: {
    fromEmail: string
    fromName: string
    // undefined or "" keeps the stored key; null clears it.
    apiKey?: string | null
  },
  database: CustomShellDb = db
) {
  const existing = await getEmailSettings(workspaceId, database)

  let resendApiKeyEncrypted = existing?.resendApiKeyEncrypted ?? null
  if (input.apiKey === null) {
    resendApiKeyEncrypted = null
  } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    resendApiKeyEncrypted = encrypt(input.apiKey.trim())
  }

  const timestamp = now()
  const values = {
    fromEmail: input.fromEmail.trim() || null,
    fromName: input.fromName.trim() || null,
    resendApiKeyEncrypted,
    updatedAt: timestamp,
  }

  if (existing) {
    const [updated] = await database
      .update(newsletterEmailSettings)
      .set(values)
      .where(eq(newsletterEmailSettings.workspaceId, workspaceId))
      .returning()
    return updated
  }

  const [created] = await database
    .insert(newsletterEmailSettings)
    .values({
      workspaceId,
      ...values,
      createdAt: timestamp,
    })
    .returning()
  return created
}

/**
 * Returns a ready-to-send config or null when the workspace's email settings
 * are incomplete.
 */
export async function getSendableEmailConfig(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<{ apiKey: string; from: string } | null> {
  const settings = await getEmailSettings(workspaceId, database)
  if (!settings?.resendApiKeyEncrypted || !settings.fromEmail) return null

  const apiKey = safeDecrypt(settings.resendApiKeyEncrypted)
  if (!apiKey) return null

  const from = settings.fromName
    ? `${settings.fromName} <${settings.fromEmail}>`
    : settings.fromEmail

  return { apiKey, from }
}
