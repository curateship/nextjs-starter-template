import { desc, eq, isNotNull } from "drizzle-orm"

import {
  parseDripConfig,
  validateDripConfig,
  type DripConfig,
} from "@/lib/broadcasts/drip"
import { db, type CustomShellDb } from "@/server/db"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { customShellEmailSettings } from "@/server/schema"
import { now } from "@/server/auth/security"

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
    dripDefaults: DripConfig
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

/**
 * The pace a newly created newsletter starts from.
 *
 * Validated here rather than trusted from the browser, because it is written
 * onto every newsletter made afterwards — a default that contradicts itself
 * would be copied onto each one and only noticed at send time.
 */
export async function saveDripDefaults(
  workspaceId: string,
  config: DripConfig,
  database: CustomShellDb = db
) {
  const invalid = validateDripConfig(config)
  if (invalid) throw new Error("DRIP_SETTINGS_INVALID")
  return upsertEmailSettings(workspaceId, { dripDefaults: config }, database)
}

/** What a new newsletter in this workspace is paced at. Off when never set. */
export async function getDripDefaults(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<DripConfig> {
  const row = await getEmailSettings(workspaceId, database)
  return parseDripConfig(row?.dripDefaults)
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

/**
 * Whether the app can send an email at all, and what makes that true.
 *
 * Deliberately not the same question as "has this workspace saved a key". The
 * app's own emails — verification links, password resets, sign-in links —
 * take the one key there is wherever it was typed (`getAppEmailApiKey`), or
 * the server's own environment variable. So a workspace with an empty Email
 * tab can still be sending perfectly well, and saying "not set" there without
 * this would be a lie.
 */
export type EmailDeliveryStatus = {
  /** Where the key comes from, or null when there is no key anywhere. */
  source: "settings" | "environment" | null
  /**
   * True where a missing key fails the send outright. Off a production server
   * the link is written to the log instead, so sign-up still works locally.
   */
  failsWithoutKey: boolean
}

export async function getEmailDeliveryStatus(
  database: CustomShellDb = db
): Promise<EmailDeliveryStatus> {
  const failsWithoutKey = isProduction()

  // The same two places, in the same order, that `sendAuthEmail` reads. A
  // status that checked anything else would eventually disagree with what
  // actually happens when somebody presses "send me a link".
  if (await getAppEmailApiKey(database)) {
    return { source: "settings", failsWithoutKey }
  }
  if (process.env.CUSTOM_SHELL_RESEND_API_KEY) {
    return { source: "environment", failsWithoutKey }
  }
  return { source: null, failsWithoutKey }
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
  /** The pace a newly created newsletter starts from. */
  dripDefaults: DripConfig
  /** Whether email works at all, which this workspace's key alone cannot say. */
  delivery: EmailDeliveryStatus
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
    dripDefaults: parseDripConfig(row?.dripDefaults),
    delivery: await getEmailDeliveryStatus(database),
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

/**
 * The Resend key the app's **own** emails use — verification links, password
 * resets, sign-in links, the security alerts.
 *
 * Those belong to the app rather than to a workspace: somebody clicking a
 * verification link has no workspace and barely has an account. But the box an
 * admin types the key into is the per-workspace Settings → Email tab, because
 * that is where the newsletter needs it.
 *
 * So this takes the one configured mail account there is — the most recently
 * saved row that carries a key. There is a single Resend account behind this
 * app, and the Settings tab is where it gets entered.
 *
 * Returns null when nothing is saved, which is the caller's cue to fall back to
 * the environment variable or to log instead of send.
 */
export async function getAppEmailApiKey(
  database: CustomShellDb = db
): Promise<string | null> {
  // The `is not null` belongs in the query, not after it. Taking the newest row
  // and then checking would hand back nothing whenever the most recently
  // touched workspace is one that only ever set a from-address.
  const rows = await database
    .select({ encrypted: customShellEmailSettings.resendApiKeyEncrypted })
    .from(customShellEmailSettings)
    .where(isNotNull(customShellEmailSettings.resendApiKeyEncrypted))
    .orderBy(desc(customShellEmailSettings.updatedAt))

  for (const row of rows) {
    if (!row.encrypted) continue
    try {
      return decryptSecret(row.encrypted)
    } catch {
      // A key nobody can read is the same as no key — try the next one rather
      // than falling silent because one workspace's secret went unreadable.
      continue
    }
  }

  return null
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
