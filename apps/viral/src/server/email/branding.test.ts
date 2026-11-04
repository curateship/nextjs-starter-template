import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createBroadcastBlock } from "@/lib/broadcasts/blocks"
import type { CustomShellDb } from "@/server/db"
import { emailBrandName, protectSentEmailLogos } from "@/server/email/branding"
import { deleteMediaAsAdmin } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
const originalPublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://media.example.test"
  const created = await createTestDatabase()
  client = created.client
  database = created.db
})

afterEach(async () => {
  if (originalPublicUrl === undefined) {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  } else {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalPublicUrl
  }
  await client.close()
})

describe("email branding", () => {
  it("uses the workspace name for the image fallback", async () => {
    const workspace = await insertWorkspace(database, { name: "North Star" })
    await expect(emailBrandName(workspace.id, database)).resolves.toBe(
      "North Star"
    )
  })

  it("permanently protects a workspace logo after its first send", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const workspace = await insertWorkspace(database, {
      name: "North Star",
      userId: owner.id,
    })
    const timestamp = new Date("2026-08-14T12:00:00Z")
    const storagePath = `${owner.id}/logo.png`
    await database.insert(customShellMedia).values({
      id: "logo-media",
      workspaceId: workspace.id,
      userId: owner.id,
      filename: "logo.png",
      originalName: "logo.png",
      altText: null,
      fileSize: 100,
      mimeType: "image/png",
      fileType: "image",
      storagePath,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const header = createBroadcastBlock("header")
    if (header.kind !== "header") throw new Error("Expected a header block")
    header.content.logoUrl = `https://media.example.test/${storagePath}`

    expect(
      await protectSentEmailLogos(workspace.id, [header], database, timestamp)
    ).toBe(1)

    const deletion = await deleteMediaAsAdmin(["logo-media"], database)
    expect(deletion).toEqual({ deletedCount: 0, protectedCount: 1 })
    const [kept] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, "logo-media"))
    expect(kept.emailProtectedAt?.toISOString()).toBe(timestamp.toISOString())
  })

  it("stops before sending an internal logo whose file is already gone", async () => {
    const workspace = await insertWorkspace(database)
    const header = createBroadcastBlock("header")
    if (header.kind !== "header") throw new Error("Expected a header block")
    header.content.logoUrl =
      "https://media.example.test/somebody/missing-logo.png"

    await expect(
      protectSentEmailLogos(workspace.id, [header], database)
    ).rejects.toThrow("EMAIL_LOGO_MISSING")
  })
})
