import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const storage = vi.hoisted(() => ({
  objects: [] as Array<{ key: string; size: number }>,
}))

vi.mock("@/server/media/storage", () => ({
  deleteFromR2: vi.fn(async () => undefined),
  getPublicMediaUrl: (path: string) => `https://media.example.test/${path}`,
  listR2Objects: vi.fn(async () => ({
    objects: storage.objects,
    truncated: false,
  })),
  R2StorageNotConfiguredError: class extends Error {},
}))

import { loadOrphanDashboard } from "@/server/media/library"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import { uuid } from "@/server/auth/security"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDatabase = await createTestDatabase()
  client = testDatabase.client
  database = testDatabase.db
})

afterEach(async () => {
  storage.objects = []
  await client.close()
})

describe("media orphan scans", () => {
  it("leaves generated favicon files to the settings cleanup lifecycle", async () => {
    const owner = await insertUser(database)
    const generated = `${owner.id}/favicons/${uuid()}/light-16.png`
    const abandoned = `${owner.id}/abandoned.png`
    storage.objects = [
      { key: generated, size: 100 },
      { key: abandoned, size: 200 },
    ]

    const result = await loadOrphanDashboard(database)

    expect(result.orphans.map((orphan) => orphan.storagePath)).toEqual([
      abandoned,
    ])
  })
})
