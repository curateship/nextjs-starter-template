import { eq } from "drizzle-orm"

import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { db, type CustomShellDb } from "@/server/db"
import { now } from "@/server/auth/security"
import { customShellStorageSettings } from "@/server/schema"

// Where uploaded files are kept. The five values an S3-compatible bucket needs,
// typed into Settings → Storage and kept in one row, or left to the server's
// own CUSTOM_SHELL_R2_* environment variables when nothing is saved.
//
// Auth lives in the API layer (src/lib/api/storage.ts): every caller there is
// behind requireAdmin, and the writes behind requireAppOrigin, matching how the
// AI key store is guarded.

/** The one row's id. There is one bucket, so there is one row. */
const ROW_ID = "r2"

export type StorageField =
  | "accountId"
  | "accessKeyId"
  | "secretAccessKey"
  | "bucketName"
  | "publicUrl"

/** The environment variable that backs each field when nothing is saved. */
const ENV_VAR: Record<StorageField, string> = {
  accountId: "CUSTOM_SHELL_R2_ACCOUNT_ID",
  accessKeyId: "CUSTOM_SHELL_R2_ACCESS_KEY_ID",
  secretAccessKey: "CUSTOM_SHELL_R2_SECRET_ACCESS_KEY",
  bucketName: "CUSTOM_SHELL_R2_BUCKET_NAME",
  publicUrl: "CUSTOM_SHELL_R2_PUBLIC_URL",
}

/** What each field is called on screen, for the message a missing one throws. */
export const STORAGE_FIELD_LABEL: Record<StorageField, string> = {
  accountId: "account ID",
  accessKeyId: "access key ID",
  secretAccessKey: "secret access key",
  bucketName: "bucket name",
  publicUrl: "public URL",
}

const STORAGE_FIELDS: readonly StorageField[] = [
  "accountId",
  "accessKeyId",
  "secretAccessKey",
  "bucketName",
  "publicUrl",
]

/**
 * What the app is willing to build a web address out of.
 *
 * The account ID and the bucket name both become parts of the host the server
 * signs a request to and sends credentials to: the address is
 * `<bucket>.<account>.r2.cloudflarestorage.com`. Until now both came from the
 * server's own environment, which only the person running the server can set.
 * They now arrive from a browser, so an account ID ending in a slash would end
 * the host early and point the whole signed request at somebody else's machine
 * — proven, not theorised: `"evil.example.com/"` resolves to the host
 * `evil.example.com`.
 *
 * Letters and digits only closes that, and costs nothing: a real Cloudflare
 * account ID is 32 hexadecimal characters, and a bucket name is lower-case
 * letters, digits and hyphens.
 */
const SAFE_ACCOUNT_ID = /^[A-Za-z0-9]{1,64}$/
const SAFE_BUCKET_NAME = /^[A-Za-z0-9][A-Za-z0-9.\-_]{1,62}$/

/**
 * Refuses anything that is not a plain http or https address. The public
 * address is glued in front of a file name and handed to every visitor's
 * browser, so it must be an address and nothing else.
 */
function isWebAddress(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Checks the three values that leave this server, and throws the code the
 * settings screen words for the admin. Empty is allowed: an empty field means
 * "fall back to the server's own setting", not "use nothing".
 */
export function assertUsableStorageValues(values: {
  accountId: string
  bucketName: string
  publicUrl?: string
}) {
  const accountId = values.accountId.trim()
  if (accountId && !SAFE_ACCOUNT_ID.test(accountId)) {
    throw new Error("BAD_ACCOUNT_ID")
  }
  const bucketName = values.bucketName.trim()
  if (bucketName && !SAFE_BUCKET_NAME.test(bucketName)) {
    throw new Error("BAD_BUCKET_NAME")
  }
  const publicUrl = values.publicUrl?.trim()
  if (publicUrl && !isWebAddress(publicUrl)) {
    throw new Error("BAD_PUBLIC_URL")
  }
}

/** One field's value and where it came from. Null value means nowhere. */
export type StorageFieldSource = {
  value: string | null
  source: "settings" | "env" | null
  /** A value is saved but the server can no longer unscramble it. */
  unreadable: boolean
}

export type StorageConfig = Record<StorageField, StorageFieldSource>

/**
 * The saved row, remembered for a few seconds.
 *
 * Every upload, delete and public URL asks for these, so reading the row each
 * time would put a query in front of every media operation. Only the row is
 * remembered. The environment variables are read fresh every call, which costs
 * nothing and keeps a test that sets one honest. The memory is dropped the
 * moment an admin saves, so a change takes effect at once on the server that
 * took the save; another server behind the same database picks it up within the
 * window below.
 */
type SavedRow = typeof customShellStorageSettings.$inferSelect | null
let cached: { row: SavedRow; at: number } | null = null
const CACHE_MS = 15_000

/**
 * Bumped whenever the memory is dropped. A read that was already in flight when
 * a save landed must not write its now-stale row into the memory afterwards, so
 * it checks this number before it does.
 */
let generation = 0

export function clearStorageConfigCache() {
  cached = null
  generation += 1
}

function fromEnv(field: StorageField): StorageFieldSource {
  const value = process.env[ENV_VAR[field]]
  return value
    ? { value, source: "env", unreadable: false }
    : { value: null, source: null, unreadable: false }
}

async function readRow(database: CustomShellDb): Promise<SavedRow> {
  const [row] = await database
    .select()
    .from(customShellStorageSettings)
    .where(eq(customShellStorageSettings.id, ROW_ID))
    .limit(1)
  return row ?? null
}

function resolve(row: SavedRow): StorageConfig {
  const plain = (
    field: StorageField,
    saved: string | null | undefined
  ): StorageFieldSource =>
    saved
      ? { value: saved, source: "settings", unreadable: false }
      : fromEnv(field)

  let secret: StorageFieldSource
  if (row?.secretAccessKey) {
    try {
      secret = {
        value: decryptSecret(row.secretAccessKey),
        source: "settings",
        unreadable: false,
      }
    } catch {
      // A secret nobody can read is not a reason to reach for the environment
      // behind the admin's back: say it is unreadable so the fix is obvious.
      secret = { value: null, source: "settings", unreadable: true }
    }
  } else {
    secret = fromEnv("secretAccessKey")
  }

  return {
    accountId: plain("accountId", row?.accountId),
    accessKeyId: plain("accessKeyId", row?.accessKeyId),
    secretAccessKey: secret,
    bucketName: plain("bucketName", row?.bucketName),
    publicUrl: plain("publicUrl", row?.publicUrl),
  }
}

/**
 * The read in flight, if there is one.
 *
 * A page of 30 files asks for the public address 30 times at once. Without
 * this, a cold memory means 30 simultaneous queries for the same row, all
 * started before the first one can answer. They share one.
 */
let reading: Promise<SavedRow> | null = null

export async function getStorageConfig(
  database: CustomShellDb = db
): Promise<StorageConfig> {
  // A caller naming its own database gets that database, never a row
  // remembered from another one.
  if (database !== db) return resolve(await readRow(database))

  if (cached && Date.now() - cached.at < CACHE_MS) return resolve(cached.row)
  if (!reading) {
    const startedAt = generation
    reading = readRow(database)
      .then((row) => {
        if (generation === startedAt) cached = { row, at: Date.now() }
        return row
      })
      .finally(() => {
        reading = null
      })
  }
  return resolve(await reading)
}

/** What the browser may see: never the secret, only its last four characters. */
export type StorageSettingsStatus = {
  accountId: string
  accessKeyId: string
  bucketName: string
  publicUrl: string
  /** Which of the four plain fields the server's environment is supplying. */
  envFields: StorageField[]
  secretConfigured: boolean
  maskedSecret: string | null
  secretFromEnv: boolean
  secretUnreadable: boolean
  /** True when all five values are present, wherever each one came from. */
  ready: boolean
  /** True when at least one value is saved in Settings rather than the env. */
  anySaved: boolean
}

function maskSecret(secret: string) {
  return `••••${secret.slice(-4)}`
}

export async function getStorageSettingsStatus(
  database: CustomShellDb = db
): Promise<StorageSettingsStatus> {
  const config = resolve(await readRow(database))
  const plainFields: StorageField[] = [
    "accountId",
    "accessKeyId",
    "bucketName",
    "publicUrl",
  ]

  return {
    // A field the environment supplies is shown as typed, so an admin can see
    // what the app is actually using rather than an empty box that lies.
    accountId: config.accountId.value ?? "",
    accessKeyId: config.accessKeyId.value ?? "",
    bucketName: config.bucketName.value ?? "",
    publicUrl: config.publicUrl.value ?? "",
    envFields: plainFields.filter((field) => config[field].source === "env"),
    secretConfigured: Boolean(config.secretAccessKey.value),
    maskedSecret: config.secretAccessKey.value
      ? maskSecret(config.secretAccessKey.value)
      : null,
    secretFromEnv: config.secretAccessKey.source === "env",
    secretUnreadable: config.secretAccessKey.unreadable,
    ready: STORAGE_FIELDS.every((field) => Boolean(config[field].value)),
    anySaved: STORAGE_FIELDS.some((field) => config[field].source === "settings"),
  }
}

export type StorageSettingsInput = {
  accountId: string
  accessKeyId: string
  bucketName: string
  publicUrl: string
  /** Left out means "keep the secret already saved". */
  secretAccessKey?: string
}

/**
 * Writes the row, scrambling the secret on the way in. Throws
 * ENCRYPTION_NOT_CONFIGURED (from `encryptSecret`) rather than ever storing the
 * secret as plain text.
 */
export async function saveStorageSettings(
  input: StorageSettingsInput,
  database: CustomShellDb = db
): Promise<void> {
  assertUsableStorageValues(input)

  const trimmed = {
    accountId: input.accountId.trim() || null,
    accessKeyId: input.accessKeyId.trim() || null,
    bucketName: input.bucketName.trim() || null,
    // A trailing slash here and the glued-on key would make a double slash,
    // which R2 serves as a different, missing object.
    publicUrl: input.publicUrl.trim().replace(/\/+$/, "") || null,
  }
  const secret = input.secretAccessKey?.trim()
  const ts = now()

  const values = {
    id: ROW_ID,
    ...trimmed,
    ...(secret === undefined
      ? {}
      : { secretAccessKey: secret ? encryptSecret(secret) : null }),
  }

  await database
    .insert(customShellStorageSettings)
    .values({
      secretAccessKey: null,
      ...values,
      createdAt: ts,
      updatedAt: ts,
    })
    .onConflictDoUpdate({
      target: customShellStorageSettings.id,
      set: { ...values, updatedAt: ts },
    })

  clearStorageConfigCache()
}

/** Deletes the saved row; the server's environment variables take over, if any. */
export async function clearStorageSettings(
  database: CustomShellDb = db
): Promise<void> {
  await database
    .delete(customShellStorageSettings)
    .where(eq(customShellStorageSettings.id, ROW_ID))
  clearStorageConfigCache()
}
