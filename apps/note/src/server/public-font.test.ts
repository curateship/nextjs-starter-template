import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import {
  installPublicFont,
  publicFontResponse,
  removePublicFont,
} from "@/server/media/public-font"
import { R2StorageNotConfiguredError } from "@/server/media/storage"
import { customShellSettings, DEFAULT_SETTINGS_KEY } from "@/server/schema"
import { readShellGlobals } from "@/server/shell-settings"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"

const firstVersion = "123e4567-e89b-42d3-a456-426614174000"
const secondVersion = "123e4567-e89b-42d3-a456-426614174001"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDatabase = await createTestDatabase()
  client = testDatabase.client
  database = testDatabase.db
})

afterEach(async () => {
  await client.close()
})

function woff2Data() {
  const data = new Uint8Array(64)
  data.set([0x77, 0x4f, 0x46, 0x32])
  const header = new DataView(data.buffer)
  header.setUint32(8, data.byteLength)
  header.setUint16(12, 1)
  header.setUint32(16, 128)
  header.setUint32(20, 1)
  return data
}

describe("public font storage", () => {
  it("replaces the app font and removing it restores the built-in choice", async () => {
    const timestamp = now()
    await database.insert(customShellSettings).values({
      key: DEFAULT_SETTINGS_KEY,
      settings: { publicTheme: { font: "serif" } },
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const versions = [firstVersion, secondVersion]
    const storage = {
      createId: vi.fn(() => versions.shift()!),
      write: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    }
    const data = woff2Data()
    const testDb = database as unknown as CustomShellDb

    const first = await installPublicFont(
      {
        name: "Brand One.woff2",
        size: data.byteLength,
        type: "font/woff2",
        data,
      },
      testDb,
      storage
    )
    expect(first.publicTheme).toMatchObject({
      font: "serif",
      useCustomFont: true,
    })
    expect(storage.write).toHaveBeenCalledWith(
      `managed/public-fonts/${firstVersion}.woff2`,
      data
    )

    await installPublicFont(
      {
        name: "Brand Two.woff2",
        size: data.byteLength,
        type: "font/woff2",
        data,
      },
      testDb,
      storage
    )
    expect(storage.remove).toHaveBeenCalledWith(
      `managed/public-fonts/${firstVersion}.woff2`
    )

    const removed = await removePublicFont(testDb, storage)
    expect(removed).toEqual({
      publicFont: null,
      publicTheme: expect.objectContaining({
        font: "serif",
        useCustomFont: false,
      }),
    })
    expect(storage.remove).toHaveBeenCalledWith(
      `managed/public-fonts/${secondVersion}.woff2`
    )
    await expect(readShellGlobals(testDb)).resolves.toMatchObject({
      publicFont: null,
      publicTheme: { font: "serif", useCustomFont: false },
    })
  })

  it("serves only the current version with immutable font headers", async () => {
    const data = woff2Data()
    const source = {
      current: vi.fn(async () => ({
        name: "Brand.woff2",
        version: firstVersion,
      })),
      read: vi.fn(async () => ({
        Body: data,
        ContentLength: data.byteLength,
        ETag: '"font-version"',
      })),
    }

    const stale = await publicFontResponse(
      new Request(`https://example.test/public-font.woff2?v=${secondVersion}`),
      source
    )
    expect(stale.status).toBe(404)
    expect(stale.headers.get("Cache-Control")).toBe("no-store")
    expect(source.read).not.toHaveBeenCalled()

    const response = await publicFontResponse(
      new Request(`https://example.test/public-font.woff2?v=${firstVersion}`),
      source
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("font/woff2")
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    )
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "same-origin"
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(data)
  })

  it("reports unavailable storage without exposing its error", async () => {
    const response = await publicFontResponse(
      new Request(`https://example.test/public-font.woff2?v=${firstVersion}`),
      {
        current: async () => ({
          name: "Brand.woff2",
          version: firstVersion,
        }),
        read: async () => {
          throw new R2StorageNotConfiguredError("private setting name")
        },
      }
    )

    expect(response.status).toBe(503)
    expect(await response.text()).toBe("Font unavailable")
  })
})
