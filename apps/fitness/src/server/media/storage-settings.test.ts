import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  clearStorageConfigCache,
  clearStorageSettings,
  getStorageConfig,
  getStorageSettingsStatus,
  saveStorageSettings,
} from "@/server/media/storage-settings"
import { getPublicMediaUrl, R2StorageNotConfiguredError } from "@/server/media/storage"
import { setDbForTests } from "@/server/db"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"

let client: PGlite
let database: TestDatabase

const ENV_KEYS = [
  "CUSTOM_SHELL_R2_ACCOUNT_ID",
  "CUSTOM_SHELL_R2_ACCESS_KEY_ID",
  "CUSTOM_SHELL_R2_SECRET_ACCESS_KEY",
  "CUSTOM_SHELL_R2_BUCKET_NAME",
  "CUSTOM_SHELL_R2_PUBLIC_URL",
  "CUSTOM_SHELL_SECRET_ENCRYPTION_KEY",
] as const
const savedEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]))

beforeEach(async () => {
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-encryption-secret"
  const created = await createTestDatabase()
  client = created.client
  database = created.db
})

afterEach(async () => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  clearStorageConfigCache()
  await client.close()
})

const settings = {
  accountId: "account1",
  accessKeyId: "access-1",
  bucketName: "bucket-1",
  publicUrl: "https://media.example.test",
  secretAccessKey: "secret-1",
}

describe("storage settings", () => {
  it("reads back what was saved, and never stores the secret as typed", async () => {
    await saveStorageSettings(settings, database)

    const config = await getStorageConfig(database)
    expect(config.accountId).toEqual({
      value: "account1",
      source: "settings",
      unreadable: false,
    })
    expect(config.secretAccessKey.value).toBe("secret-1")

    const rows = await client.query<{ secret_access_key: string }>(
      'select "secret_access_key" from "storage_settings"'
    )
    expect(rows.rows[0].secret_access_key).not.toContain("secret-1")
  })

  it("falls back to the server's own setting for an empty field", async () => {
    process.env.CUSTOM_SHELL_R2_BUCKET_NAME = "bucket-from-env"
    await saveStorageSettings({ ...settings, bucketName: "" }, database)

    const config = await getStorageConfig(database)
    expect(config.bucketName).toEqual({
      value: "bucket-from-env",
      source: "env",
      unreadable: false,
    })
    expect(config.accountId.source).toBe("settings")
  })

  it("prefers a saved value over the server's own setting", async () => {
    process.env.CUSTOM_SHELL_R2_ACCOUNT_ID = "account-from-env"
    await saveStorageSettings(settings, database)

    const config = await getStorageConfig(database)
    expect(config.accountId.value).toBe("account1")
  })

  it("keeps the saved secret when a save leaves the field out", async () => {
    await saveStorageSettings(settings, database)
    await saveStorageSettings(
      { ...settings, bucketName: "bucket-2", secretAccessKey: undefined },
      database
    )

    const config = await getStorageConfig(database)
    expect(config.bucketName.value).toBe("bucket-2")
    expect(config.secretAccessKey.value).toBe("secret-1")
  })

  it("strips a trailing slash off the public address", async () => {
    await saveStorageSettings(
      { ...settings, publicUrl: "https://media.example.test/" },
      database
    )

    await expect(getPublicMediaUrl("owner/file.png")).resolves.toBe(
      "https://media.example.test/owner/file.png"
    )
  })

  it("refuses a public address when nothing is set anywhere", async () => {
    await expect(getPublicMediaUrl("owner/file.png")).rejects.toBeInstanceOf(
      R2StorageNotConfiguredError
    )
  })

  it("shows the secret masked, never whole", async () => {
    await saveStorageSettings(settings, database)

    const status = await getStorageSettingsStatus(database)
    expect(status.maskedSecret).toBe("••••et-1")
    expect(status.secretConfigured).toBe(true)
    expect(status.ready).toBe(true)
    expect(status.anySaved).toBe(true)
  })

  it("refuses an account ID that would send the request somewhere else", async () => {
    // "evil.example.test/" ends the host early: the address built from it
    // resolves to evil.example.test, and the signed request goes there.
    await expect(
      saveStorageSettings(
        { ...settings, accountId: "evil.example.test/" },
        database
      )
    ).rejects.toThrow("BAD_ACCOUNT_ID")

    const rows = await client.query('select * from "storage_settings"')
    expect(rows.rows).toHaveLength(0)
  })

  it("refuses a bucket name and a public address that are not one", async () => {
    await expect(
      saveStorageSettings({ ...settings, bucketName: "a bucket/../x" }, database)
    ).rejects.toThrow("BAD_BUCKET_NAME")
    await expect(
      saveStorageSettings(
        { ...settings, publicUrl: "javascript:alert(1)" },
        database
      )
    ).rejects.toThrow("BAD_PUBLIC_URL")
  })

  it("reads the row once when many files ask for their address at once", async () => {
    await saveStorageSettings(settings, database)

    let reads = 0
    const counted = new Proxy(database, {
      get(target, prop, receiver) {
        if (prop === "select") reads += 1
        return Reflect.get(target, prop, receiver)
      },
    }) as TestDatabase
    // The default database is what a real caller uses, and it is the only path
    // that shares one read, so the count has to be taken there.
    setDbForTests(counted)
    clearStorageConfigCache()

    const addresses = await Promise.all(
      Array.from({ length: 20 }, () =>
        getStorageConfig().then((config) => config.publicUrl.value)
      )
    )
    expect(new Set(addresses)).toEqual(new Set(["https://media.example.test"]))
    expect(reads).toBe(1)
  })

  it("hands the bucket back to the server's own settings when cleared", async () => {
    await saveStorageSettings(settings, database)
    await clearStorageSettings(database)

    const status = await getStorageSettingsStatus(database)
    expect(status.anySaved).toBe(false)
    expect(status.ready).toBe(false)
    expect(status.secretConfigured).toBe(false)
  })
})
