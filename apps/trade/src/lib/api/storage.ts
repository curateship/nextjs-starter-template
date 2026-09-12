import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "./error-message"
import { adminGet, adminPost } from "@/server/guards"
import { testR2Bucket } from "@/server/media/storage"
import {
  assertUsableStorageValues,
  clearStorageSettings,
  getStorageConfig,
  getStorageSettingsStatus,
  saveStorageSettings,
  type StorageField,
  type StorageSettingsStatus,
} from "@/server/media/storage-settings"

export type { StorageField, StorageSettingsStatus }

export const getStorageErrorMessage = createErrorMessage(
  {
    FORBIDDEN: "Only an admin can change where files are stored.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server can't store the secret yet: its CUSTOM_SHELL_SECRET_ENCRYPTION_KEY setting is missing. Nothing was saved — secrets are never stored unscrambled.",
    SECRET_UNREADABLE:
      "The saved secret access key can't be read back because the server's scrambling secret changed. Paste it again to fix it.",
    NO_SECRET: "Paste the secret access key before testing.",
    INCOMPLETE: "Fill in the account ID, access key ID and bucket name first.",
    BAD_ACCOUNT_ID:
      "That account ID has characters in it that a Cloudflare account ID never has. It is 32 letters and digits, copied from the R2 page of your Cloudflare dashboard.",
    BAD_BUCKET_NAME:
      "That bucket name has characters in it that a bucket name never has. Bucket names are letters, digits, dots and hyphens.",
    BAD_PUBLIC_URL:
      "The public address has to start with https:// (or http://). It is the address a browser fetches a file from.",
  },
  "We could not load or save the storage settings. Please try again."
)

const loadStorageSettingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<StorageSettingsStatus> => {
    return getStorageSettingsStatus()
  })

export function loadStorageSettings() {
  return loadStorageSettingsFn()
}

const settingsSchema = z.object({
  accountId: z.string().max(200),
  accessKeyId: z.string().max(200),
  bucketName: z.string().max(200),
  publicUrl: z.string().max(500),
  // Left out means "keep the secret already saved". An empty string is not the
  // same thing: that is an admin clearing it on purpose.
  secretAccessKey: z.string().max(500).optional(),
})

// The whole card saves at once, and hands back the fresh status so the masked
// tail on screen can never disagree with what is stored.
const saveStorageSettingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(settingsSchema)
  .handler(async ({ data }): Promise<StorageSettingsStatus> => {
    await saveStorageSettings(data)
    return getStorageSettingsStatus()
  })

export function saveStorage(input: z.infer<typeof settingsSchema>) {
  return saveStorageSettingsFn({ data: input })
}

const clearStorageSettingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async (): Promise<StorageSettingsStatus> => {
    await clearStorageSettings()
    return getStorageSettingsStatus()
  })

export function clearStorage() {
  return clearStorageSettingsFn()
}

export type StorageTestResult =
  | { result: "ok" }
  | { result: "rejected"; reason: string }
  | { result: "unreachable" }

// POST although it changes nothing: the pasted secret rides in the body, and a
// secret must never sit in a GET url that request logs would keep.
const testStorageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      accountId: z.string().max(200),
      accessKeyId: z.string().max(200),
      bucketName: z.string().max(200),
      secretAccessKey: z.string().max(500).optional(),
    })
  )
  .handler(async ({ data }): Promise<StorageTestResult> => {
    // A secret typed but not yet saved is tested as typed; an untouched field
    // falls back to the stored one, so a bucket can be checked either way.
    const secret =
      data.secretAccessKey?.trim() ||
      (await getStorageConfig()).secretAccessKey.value
    if (!secret) throw new Error("NO_SECRET")

    const accountId = data.accountId.trim()
    const accessKeyId = data.accessKeyId.trim()
    const bucketName = data.bucketName.trim()
    if (!accountId || !accessKeyId || !bucketName) throw new Error("INCOMPLETE")
    // The same check the save makes. Test runs on values that were never saved,
    // so without this it is the one way an unchecked account ID reaches the
    // network.
    assertUsableStorageValues({ accountId, bucketName })

    try {
      await testR2Bucket({
        accountId,
        accessKeyId,
        secretAccessKey: secret,
        bucketName,
      })
      return { result: "ok" }
    } catch (error) {
      const raw =
        error instanceof Error
          ? error.message.replace(/\s+/g, " ").trim()
          : ""
      // A wrong account ID does not reach Cloudflare at all: the address it
      // builds does not exist, and the failure comes back as a DNS or TLS
      // error full of OpenSSL line numbers. Reading that out would tell an
      // admin nothing, so those become one sentence naming the likely cause.
      if (/EPROTO|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|handshake|getaddrinfo|socket hang up|certificate/i.test(raw)) {
        return { result: "unreachable" }
      }
      // Otherwise Cloudflare's own wording is the most useful thing there is:
      // "no such bucket" and "signature does not match" are different problems
      // with different fixes, and one invented sentence for both hides that.
      return {
        result: "rejected",
        reason: raw.slice(0, 300) || "Cloudflare turned the request away.",
      }
    }
  })

export function testStorage(input: {
  accountId: string
  accessKeyId: string
  bucketName: string
  secretAccessKey?: string
}) {
  return testStorageFn({
    data: {
      ...input,
      secretAccessKey: input.secretAccessKey?.trim()
        ? input.secretAccessKey
        : undefined,
    },
  })
}
