import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import {
  customShellStripeSettings,
  type CustomShellStripeSettings,
} from "@/server/schema"
import { now } from "@/server/auth/security"

// The one row's id — billing is app-wide, so there is never a second row.
const ROW_ID = "stripe"

/** The three secrets, per mode. Stored encrypted, shown only as a masked tail. */
export const STRIPE_SECRET_FIELDS = [
  "liveSecretKey",
  "liveWebhookSecret",
  "sandboxSecretKey",
  "sandboxWebhookSecret",
] as const
export type StripeSecretField = (typeof STRIPE_SECRET_FIELDS)[number]

/** The publishable keys. Public by design, stored and shown as typed. */
export const STRIPE_TEXT_FIELDS = [
  "livePublishableKey",
  "sandboxPublishableKey",
] as const
export type StripeTextField = (typeof STRIPE_TEXT_FIELDS)[number]

const SECRET_COLUMN: Record<
  StripeSecretField,
  "liveSecretKeyEncrypted"
  | "liveWebhookSecretEncrypted"
  | "sandboxSecretKeyEncrypted"
  | "sandboxWebhookSecretEncrypted"
> = {
  liveSecretKey: "liveSecretKeyEncrypted",
  liveWebhookSecret: "liveWebhookSecretEncrypted",
  sandboxSecretKey: "sandboxSecretKeyEncrypted",
  sandboxWebhookSecret: "sandboxWebhookSecretEncrypted",
}

// The env vars the live keys used to come from, kept as a fallback so an
// install that never opens the settings page keeps working unchanged.
const ENV_FALLBACK: Partial<Record<StripeSecretField, string>> = {
  liveSecretKey: "CUSTOM_SHELL_STRIPE_SECRET_KEY",
  liveWebhookSecret: "CUSTOM_SHELL_STRIPE_WEBHOOK_SECRET",
}

export async function getStripeSettings(
  database: CustomShellDb = db
): Promise<CustomShellStripeSettings | null> {
  const [row] = await database
    .select()
    .from(customShellStripeSettings)
    .where(eq(customShellStripeSettings.id, ROW_ID))
    .limit(1)
  return row ?? null
}

/** Writes only the columns given, creating the row on the first save. */
async function upsertStripeSettings(
  patch: Partial<Omit<CustomShellStripeSettings, "id" | "createdAt" | "updatedAt">>,
  database: CustomShellDb = db
) {
  const existing = await getStripeSettings(database)
  const timestamp = now()

  if (existing) {
    const [updated] = await database
      .update(customShellStripeSettings)
      .set({ ...patch, updatedAt: timestamp })
      .where(eq(customShellStripeSettings.id, ROW_ID))
      .returning()
    return updated
  }

  const [created] = await database
    .insert(customShellStripeSettings)
    .values({
      id: ROW_ID,
      useSandbox: false,
      ...patch,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return created
}

export async function setStripeUseSandbox(
  useSandbox: boolean,
  database: CustomShellDb = db
) {
  return upsertStripeSettings({ useSandbox }, database)
}

export async function setStripeSecret(
  field: StripeSecretField,
  value: string,
  database: CustomShellDb = db
) {
  const secret = value.trim()
  if (!secret) throw new Error("EMPTY_KEY")
  return upsertStripeSettings(
    { [SECRET_COLUMN[field]]: encryptSecret(secret) },
    database
  )
}

export async function clearStripeSecret(
  field: StripeSecretField,
  database: CustomShellDb = db
) {
  return upsertStripeSettings({ [SECRET_COLUMN[field]]: null }, database)
}

export async function setStripeText(
  field: StripeTextField,
  value: string,
  database: CustomShellDb = db
) {
  return upsertStripeSettings({ [field]: value.trim() || null }, database)
}

/** Only the last 4 characters, enough to recognise which key is set. */
function maskKey(key: string): string {
  return `••••${key.slice(-4)}`
}

export type StripeSecretStatus = {
  configured: boolean
  maskedKey: string | null
  /** Where the key in use comes from; null when there is none. */
  source: "settings" | "env" | null
  /** True when a key is stored but the server can no longer read it. */
  unreadable: boolean
}

/** What the settings page may see: never a secret itself, only masked tails. */
export type StripeSettingsStatus = {
  useSandbox: boolean
  livePublishableKey: string
  sandboxPublishableKey: string
  secrets: Record<StripeSecretField, StripeSecretStatus>
}

export async function getStripeSettingsStatus(
  database: CustomShellDb = db
): Promise<StripeSettingsStatus> {
  const row = await getStripeSettings(database)

  const secrets = {} as Record<StripeSecretField, StripeSecretStatus>
  for (const field of STRIPE_SECRET_FIELDS) {
    const stored = row?.[SECRET_COLUMN[field]] ?? null
    if (stored) {
      try {
        secrets[field] = {
          configured: true,
          maskedKey: maskKey(decryptSecret(stored)),
          source: "settings",
          unreadable: false,
        }
        continue
      } catch {
        secrets[field] = {
          configured: false,
          maskedKey: null,
          source: "settings",
          unreadable: true,
        }
        continue
      }
    }
    const envVar = ENV_FALLBACK[field]
    const envKey = envVar ? process.env[envVar] : undefined
    secrets[field] = envKey
      ? { configured: true, maskedKey: maskKey(envKey), source: "env", unreadable: false }
      : { configured: false, maskedKey: null, source: null, unreadable: false }
  }

  return {
    useSandbox: row?.useSandbox ?? false,
    livePublishableKey: row?.livePublishableKey ?? "",
    sandboxPublishableKey: row?.sandboxPublishableKey ?? "",
    secrets,
  }
}

export type ActiveStripeConfig = {
  mode: "live" | "sandbox"
  /** Null when the mode in use has no key — billing then refuses to run. */
  secretKey: string | null
  webhookSecret: string | null
  publishableKey: string | null
}

function readSecret(stored: string | null | undefined, envVar?: string) {
  if (stored) {
    try {
      return decryptSecret(stored)
    } catch {
      // A key that cannot be read is the same as no key: refuse rather than
      // charge through a half-configured account.
      return null
    }
  }
  return (envVar && process.env[envVar]) || null
}

/**
 * The credentials billing runs on right now: the sandbox set when the switch
 * says so, otherwise the live set, with the old env vars backing the live set.
 */
export async function getActiveStripeConfig(
  database: CustomShellDb = db
): Promise<ActiveStripeConfig> {
  const row = await getStripeSettings(database)

  if (row?.useSandbox) {
    return {
      mode: "sandbox",
      secretKey: readSecret(row.sandboxSecretKeyEncrypted),
      webhookSecret: readSecret(row.sandboxWebhookSecretEncrypted),
      publishableKey: row.sandboxPublishableKey,
    }
  }

  return {
    mode: "live",
    secretKey: readSecret(
      row?.liveSecretKeyEncrypted,
      "CUSTOM_SHELL_STRIPE_SECRET_KEY"
    ),
    webhookSecret: readSecret(
      row?.liveWebhookSecretEncrypted,
      "CUSTOM_SHELL_STRIPE_WEBHOOK_SECRET"
    ),
    publishableKey: row?.livePublishableKey ?? null,
  }
}
