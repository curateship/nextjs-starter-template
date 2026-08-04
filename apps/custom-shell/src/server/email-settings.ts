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

/** Writes only the columns given, creating the row on the first save. */
async function upsertEmailSettings(
  workspaceId: string,
  patch: Partial<{
    fromEmail: string | null
    fromName: string | null
    resendApiKeyEncrypted: string | null
    resendWebhookSecretEncrypted: string | null
  }>,
  database: CustomShellDb = db
) {
  const existing = await getEmailSettings(workspaceId, database)
  const timestamp = now()

  if (existing) {
    const [updated] = await database
      .update(customShellEmailSettings)
      .set({ ...patch, updatedAt: timestamp })
      .where(eq(customShellEmailSettings.workspaceId, workspaceId))
      .returning()
    return updated
  }

  const [created] = await database
    .insert(customShellEmailSettings)
    .values({
      workspaceId,
      fromEmail: null,
      fromName: null,
      resendApiKeyEncrypted: null,
      resendWebhookSecretEncrypted: null,
      ...patch,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return created
}

export async function saveEmailSender(
  workspaceId: string,
  input: { fromEmail: string; fromName: string },
  database: CustomShellDb = db
) {
  return upsertEmailSettings(
    workspaceId,
    {
      fromEmail: input.fromEmail.trim() || null,
      fromName: input.fromName.trim() || null,
    },
    database
  )
}

export async function setEmailApiKey(
  workspaceId: string,
  apiKey: string,
  database: CustomShellDb = db
) {
  const key = apiKey.trim()
  if (!key) throw new Error("EMPTY_KEY")
  return upsertEmailSettings(
    workspaceId,
    { resendApiKeyEncrypted: encryptSecret(key) },
    database
  )
}

export async function clearEmailApiKey(
  workspaceId: string,
  database: CustomShellDb = db
) {
  return upsertEmailSettings(
    workspaceId,
    { resendApiKeyEncrypted: null },
    database
  )
}

export async function setResendWebhookSecret(
  workspaceId: string,
  secret: string,
  database: CustomShellDb = db
) {
  const value = secret.trim()
  if (!value) throw new Error("EMPTY_KEY")
  return upsertEmailSettings(
    workspaceId,
    { resendWebhookSecretEncrypted: encryptSecret(value) },
    database
  )
}

export async function clearResendWebhookSecret(
  workspaceId: string,
  database: CustomShellDb = db
) {
  return upsertEmailSettings(
    workspaceId,
    { resendWebhookSecretEncrypted: null },
    database
  )
}

/**
 * Every workspace's webhook signing secret, decrypted, for the receiver to
 * try in turn: the webhook URL carries no workspace, so which workspace a
 * call belongs to is exactly the question of whose secret signed it.
 * Unreadable secrets are skipped — they can verify nothing.
 */
export async function listResendWebhookSecrets(
  database: CustomShellDb = db
): Promise<{ workspaceId: string; secret: string }[]> {
  const rows = await database
    .select({
      workspaceId: customShellEmailSettings.workspaceId,
      encrypted: customShellEmailSettings.resendWebhookSecretEncrypted,
    })
    .from(customShellEmailSettings)

  const secrets: { workspaceId: string; secret: string }[] = []
  for (const row of rows) {
    if (!row.encrypted) continue
    try {
      secrets.push({
        workspaceId: row.workspaceId,
        secret: decryptSecret(row.encrypted),
      })
    } catch {
      continue
    }
  }
  return secrets
}

/** Only the last 4 characters, enough to recognise which key is set. */
function maskKey(key: string): string {
  return `••••${key.slice(-4)}`
}

/** What the settings page may see: never a secret itself, only masked tails. */
export type EmailSettingsStatus = {
  fromEmail: string
  fromName: string
  keyConfigured: boolean
  maskedKey: string | null
  /** True when a key is stored but the server can no longer read it. */
  keyUnreadable: boolean
  webhookConfigured: boolean
  maskedWebhookSecret: string | null
  webhookUnreadable: boolean
}

export async function getEmailSettingsStatus(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<EmailSettingsStatus> {
  const row = await getEmailSettings(workspaceId, database)

  let keyConfigured = false
  let maskedKey: string | null = null
  let keyUnreadable = false
  if (row?.resendApiKeyEncrypted) {
    try {
      maskedKey = maskKey(decryptSecret(row.resendApiKeyEncrypted))
      keyConfigured = true
    } catch {
      keyUnreadable = true
    }
  }

  let webhookConfigured = false
  let maskedWebhookSecret: string | null = null
  let webhookUnreadable = false
  if (row?.resendWebhookSecretEncrypted) {
    try {
      maskedWebhookSecret = maskKey(
        decryptSecret(row.resendWebhookSecretEncrypted)
      )
      webhookConfigured = true
    } catch {
      webhookUnreadable = true
    }
  }

  return {
    fromEmail: row?.fromEmail ?? "",
    fromName: row?.fromName ?? "",
    keyConfigured,
    maskedKey,
    keyUnreadable,
    webhookConfigured,
    maskedWebhookSecret,
    webhookUnreadable,
  }
}

export type EmailKeyTestResult =
  | { result: "ok" }
  | { result: "rejected" }
  | { result: "unreachable" }
  | { result: "error"; status: number }

/**
 * Asks Resend whether a key is genuine, without sending anything: listing the
 * account's domains needs a valid key and changes nothing.
 *
 * Tests the pasted key when one rides in, otherwise the stored one — the same
 * split the AI key test makes, so a key can be checked before it is saved.
 */
export async function testEmailApiKey(
  workspaceId: string,
  apiKey?: string,
  database: CustomShellDb = db
): Promise<EmailKeyTestResult> {
  let key = apiKey?.trim() ?? ""
  if (!key) {
    const row = await getEmailSettings(workspaceId, database)
    if (row?.resendApiKeyEncrypted) {
      // A stored key that cannot be read throws SECRET_UNREADABLE here, which
      // tells the admin to paste it again rather than "the key is wrong".
      key = decryptSecret(row.resendApiKeyEncrypted)
    }
  }
  if (!key) throw new Error("NO_KEY")

  let response: Response
  try {
    response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    })
  } catch {
    return { result: "unreachable" }
  }

  if (response.ok) return { result: "ok" }
  // 400 included: this GET carries no body, so a 400 can only mean Resend
  // looked at the key itself and turned it away as malformed.
  if ([400, 401, 403].includes(response.status)) {
    return { result: "rejected" }
  }
  return { result: "error", status: response.status }
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
