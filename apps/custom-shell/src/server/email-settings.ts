import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { decryptSecret, encryptSecret } from "@/server/encryption"
import { customShellEmailSettings } from "@/server/schema"
import { now } from "@/server/security"

/** True in production, where sending without a key must fail loudly. */
function isProduction() {
  return (
    process.env.CUSTOM_SHELL_API_ENV === "production" ||
    process.env.NODE_ENV === "production"
  )
}

export async function getEmailSettings(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select()
    .from(customShellEmailSettings)
    .where(eq(customShellEmailSettings.workspaceId, workspaceId))
    .limit(1)

  return row ?? null
}

export async function saveEmailSettings(
  workspaceId: string,
  input: {
    fromEmail: string
    fromName: string
    /** undefined or "" keeps the stored key; null clears it. */
    apiKey?: string | null
  },
  database: CustomShellDb = db
) {
  const existing = await getEmailSettings(workspaceId, database)

  let resendApiKeyEncrypted = existing?.resendApiKeyEncrypted ?? null
  if (input.apiKey === null) {
    resendApiKeyEncrypted = null
  } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    resendApiKeyEncrypted = encryptSecret(input.apiKey.trim())
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
      .update(customShellEmailSettings)
      .set(values)
      .where(eq(customShellEmailSettings.workspaceId, workspaceId))
      .returning()
    return updated
  }

  const [created] = await database
    .insert(customShellEmailSettings)
    .values({ workspaceId, ...values, createdAt: timestamp })
    .returning()
  return created
}

export type SendableEmailConfig = {
  /** Empty outside production means "log it instead of sending it". */
  apiKey: string
  from: string
  fromEmail: string
  fromName: string | null
}

/**
 * The from-address and key a send needs, or null when the workspace is not set
 * up to send at all.
 *
 * Production insists on a real key: a broadcast that cannot actually be
 * delivered must pause and say so, never quietly do nothing. Outside
 * production a missing key is fine and the provider writes each message to the
 * server log instead, so a send can be walked end to end locally.
 */
export async function getSendableEmailConfig(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<SendableEmailConfig | null> {
  const settings = await getEmailSettings(workspaceId, database)
  if (!settings?.fromEmail) return null

  let apiKey = ""
  if (settings.resendApiKeyEncrypted) {
    try {
      apiKey = decryptSecret(settings.resendApiKeyEncrypted)
    } catch {
      // A key we cannot read is the same as no key: refuse rather than send
      // from a half-configured workspace.
      return null
    }
  }
  if (!apiKey && isProduction()) return null

  const from = settings.fromName
    ? `${settings.fromName} <${settings.fromEmail}>`
    : settings.fromEmail

  return { apiKey, from, fromEmail: settings.fromEmail, fromName: settings.fromName }
}
