import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import {
  cleanAltText,
  cleanOriginalName,
  getMediaFileType,
  getOwnedMedia,
  listOwnedMedia,
  storedFilename,
  validateMediaFile,
} from "@/server/media"
import {
  customShellMedia,
  customShellFeedback,
  customShellFeedbackComments,
  customShellSessions,
  customShellUsers,
} from "@/server/schema"
import { canManageFeedbackComment } from "@/lib/feedback-api"
import {
  createSessionExpiresAt,
  findUserBySessionToken,
  hashSessionToken,
  now,
  uuid,
  verifyPassword,
} from "@/server/security"
import * as schema from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  const migration = await readFile(
    new URL("../../drizzle/0000_custom_shell_baseline.sql", import.meta.url),
    "utf8"
  )
  await client.exec(migration)
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CustomShellDb)
})

afterEach(async () => {
  await client.close()
})

describe("custom shell auth helpers", () => {
  it("verifies argon2 passwords", async () => {
    const passwordHash = await hash("password123")

    await expect(verifyPassword(passwordHash, "password123")).resolves.toBe(true)
    await expect(verifyPassword(passwordHash, "wrong")).resolves.toBe(false)
  })

  it("looks up valid sessions and rejects expired or deleted sessions", async () => {
    const userId = uuid()
    const token = "session-token"
    const createdAt = now()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "tyler@internal.dev",
      name: "Tyler",
      role: "admin",
      passwordHash: await hash("password123"),
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellSessions).values({
      id: uuid(),
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiresAt(),
      createdAt,
    })

    await expect(findUserBySessionToken(token, database as unknown as CustomShellDb)).resolves.toMatchObject({
      id: userId,
      email: "tyler@internal.dev",
    })

    await database
      .update(customShellSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
    await expect(findUserBySessionToken(token, database as unknown as CustomShellDb)).resolves.toBeNull()

    await database.delete(customShellSessions)
    await expect(findUserBySessionToken(token, database as unknown as CustomShellDb)).resolves.toBeNull()
  })
})

describe("custom shell feedback comments", () => {
  it("creates, updates, deletes, counts, and cascades comments", async () => {
    const createdAt = now()
    const userId = uuid()
    const feedbackId = uuid()
    const commentId = uuid()
    const cascadeCommentId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "commenter@internal.dev",
      name: "Commenter",
      role: "user",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellFeedback).values({
      id: feedbackId,
      userId,
      type: "suggestion",
      message: "Add comments",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellFeedbackComments).values({
      id: commentId,
      feedbackId,
      userId,
      message: "First comment",
      createdAt,
      updatedAt: createdAt,
    })

    const [commentCount] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(customShellFeedbackComments)
      .where(eq(customShellFeedbackComments.feedbackId, feedbackId))
    expect(commentCount?.count).toBe(1)

    const updatedAt = new Date(createdAt.getTime() + 1000)
    const [updated] = await database
      .update(customShellFeedbackComments)
      .set({ message: "Updated comment", updatedAt })
      .where(eq(customShellFeedbackComments.id, commentId))
      .returning()
    expect(updated.message).toBe("Updated comment")

    const [deleted] = await database
      .delete(customShellFeedbackComments)
      .where(eq(customShellFeedbackComments.id, commentId))
      .returning()
    expect(deleted.id).toBe(commentId)

    await database.insert(customShellFeedbackComments).values({
      id: cascadeCommentId,
      feedbackId,
      userId,
      message: "Cascade me",
      createdAt,
      updatedAt: createdAt,
    })
    await database
      .delete(customShellFeedback)
      .where(eq(customShellFeedback.id, feedbackId))
    const remaining = await database.select().from(customShellFeedbackComments)
    expect(remaining).toHaveLength(0)
  })

  it("allows comment owners and admins to manage comments", () => {
    const ownerId = uuid()
    const otherId = uuid()
    const comment = { userId: ownerId }

    expect(canManageFeedbackComment(comment, { id: ownerId, role: "user" })).toBe(
      true
    )
    expect(canManageFeedbackComment(comment, { id: otherId, role: "user" })).toBe(
      false
    )
    expect(canManageFeedbackComment(comment, { id: otherId, role: "admin" })).toBe(
      true
    )
  })
})

describe("custom shell media helpers", () => {
  it("validates media types, sizes, filenames, and alt text", () => {
    expect(getMediaFileType("image/png")).toBe("image")
    expect(getMediaFileType("video/mp4")).toBe("video")
    expect(() => validateMediaFile("application/javascript", 10)).toThrow(
      "Invalid file type"
    )
    expect(() => validateMediaFile("image/png", 11 * 1024 * 1024)).toThrow(
      "File size too large"
    )
    expect(cleanOriginalName("../Hero Image.png")).toBe("Hero Image.png")
    expect(storedFilename("Hero Image.png", "image/png")).toMatch(
      /_Hero-Image\.png$/
    )
    expect(cleanAltText("  Useful alt  ")).toBe("Useful alt")
    expect(cleanAltText("   ")).toBeNull()
  })

  it("lists only owned media and blocks cross-user access", async () => {
    const createdAt = now()
    const ownerId = uuid()
    const otherId = uuid()
    const ownedMediaId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: ownerId,
        email: "owner@internal.dev",
        name: "Owner",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: otherId,
        email: "other@internal.dev",
        name: "Other",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await database.insert(customShellMedia).values([
      {
        id: ownedMediaId,
        userId: ownerId,
        filename: "hero.png",
        originalName: "hero.png",
        altText: "Hero",
        fileSize: 123,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${ownerId}/hero.png`,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: uuid(),
        userId: otherId,
        filename: "other.png",
        originalName: "other.png",
        altText: null,
        fileSize: 123,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${otherId}/other.png`,
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await expect(
      listOwnedMedia({ userId: ownerId, page: 1, pageSize: 20 })
    ).resolves.toMatchObject({
      total: 1,
      media: [{ id: ownedMediaId, original_name: "hero.png" }],
    })
    await expect(getOwnedMedia(otherId, ownedMediaId)).rejects.toThrow(
      "Media not found"
    )
  })
})
