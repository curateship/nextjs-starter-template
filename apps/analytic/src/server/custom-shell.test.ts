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
  prepareMediaContent,
  storedFilename,
  validateMediaContent,
  validateMediaFile,
} from "@/server/media"
import {
  customShellMedia,
  customShellFeedback,
  customShellFeedbackComments,
  customShellFeedbackVotes,
  customShellNotifications,
  customShellSessions,
  customShellUsers,
} from "@/server/schema"
import {
  canManageFeedbackComment,
  shouldNotifyFeedbackAuthor,
} from "@/lib/api/feedback"
import {
  canViewAllNotifications,
  getNotificationPage,
} from "@/server/notifications"
import {
  createSessionExpiresAt,
  findUserBySessionToken,
  hashSessionToken,
  now,
  uuid,
  verifyPassword,
} from "@/server/security"
import {
  createUserWorkspace,
  deleteUserWorkspace,
  getOrCreateCurrentWorkspace,
  listUserWorkspaces,
  parseWorkspaceSettings,
  switchUserWorkspace,
  updateUserWorkspace,
} from "@/server/workspaces"
import * as schema from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
const hadOriginalCustomShellR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "CUSTOM_SHELL_R2_PUBLIC_URL"
)
const originalCustomShellR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL =
    "https://custom-shell-media.example.test"
  client = new PGlite()
  const migration = await readFile(
    new URL("../../drizzle/0000_custom_shell_baseline.sql", import.meta.url),
    "utf8"
  )
  const workspaceMigration = await readFile(
    new URL("../../drizzle/0003_custom_shell_workspaces.sql", import.meta.url),
    "utf8"
  )
  await client.exec(migration)
  await client.exec(workspaceMigration)
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CustomShellDb)
})

afterEach(async () => {
  await client.close()
  if (hadOriginalCustomShellR2PublicUrl) {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalCustomShellR2PublicUrl
  } else {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  }
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

describe("custom shell workspaces", () => {
  it("creates a default workspace and switches the active workspace", async () => {
    const createdAt = now()
    const userId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "workspace-owner@internal.dev",
      name: "Workspace Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    expect(
      await listUserWorkspaces(userId, database as unknown as CustomShellDb)
    ).toEqual({ workspaces: [], currentWorkspaceId: null })

    const defaultWorkspace = await getOrCreateCurrentWorkspace(
      userId,
      database as unknown as CustomShellDb
    )
    expect(defaultWorkspace).toMatchObject({
      userId,
      name: "My project",
    })
    const defaultSettings = parseWorkspaceSettings(defaultWorkspace.settings)
    expect(defaultSettings.icon).toBe("briefcaseBusiness")
    // Analytics section is prepended ahead of Platform Settings.
    expect(defaultSettings.sections[0]?.entries).toMatchObject([
      { type: "item", label: "Overview", href: "/", visible: true },
      { type: "item", label: "Sites", href: "/sites", visible: true },
    ])
    expect(defaultSettings.sections[1]?.entries).toMatchObject([
      {
        type: "item",
        label: "Feedback",
        href: "/admin/feedback",
        visible: true,
        children: [
          {
            label: "Comments",
            href: "/admin/feedback/comments",
          },
        ],
      },
      {
        type: "item",
        label: "Media",
        href: "/admin/media",
        visible: true,
      },
      {
        type: "item",
        label: "Notifications",
        href: "/admin/notifications",
        visible: true,
      },
      {
        type: "item",
        label: "Settings",
        href: "/admin/settings",
        visible: true,
      },
    ])

    const secondWorkspace = await createUserWorkspace(
      userId,
      "Client leads",
      { icon: "globe" },
      database as unknown as CustomShellDb
    )
    expect(secondWorkspace).toMatchObject({
      userId,
      name: "Client leads",
    })
    const secondSettings = parseWorkspaceSettings(secondWorkspace.settings)
    expect(secondSettings.icon).toBe("globe")
    expect(secondSettings.sections[1]?.entries).toMatchObject([
      {
        type: "item",
        label: "Feedback",
        href: "/admin/feedback",
        visible: true,
        children: [
          {
            label: "Comments",
            href: "/admin/feedback/comments",
          },
        ],
      },
      {
        type: "item",
        label: "Media",
        href: "/admin/media",
        visible: true,
      },
      {
        type: "item",
        label: "Notifications",
        href: "/admin/notifications",
        visible: true,
      },
      {
        type: "item",
        label: "Settings",
        href: "/admin/settings",
        visible: true,
      },
    ])

    const updatedWorkspace = await updateUserWorkspace(
      userId,
      secondWorkspace.id,
      { name: "Client leads updated", settings: { icon: "sparkles" } },
      database as unknown as CustomShellDb
    )
    expect(updatedWorkspace.name).toBe("Client leads updated")
    expect(parseWorkspaceSettings(updatedWorkspace.settings).icon).toBe(
      "sparkles"
    )

    const listed = await listUserWorkspaces(
      userId,
      database as unknown as CustomShellDb
    )
    expect(listed.currentWorkspaceId).toBe(secondWorkspace.id)
    expect(listed.workspaces.map((workspace) => workspace.id)).toEqual(
      expect.arrayContaining([defaultWorkspace.id, secondWorkspace.id])
    )

    await switchUserWorkspace(
      userId,
      defaultWorkspace.id,
      database as unknown as CustomShellDb
    )
    await expect(
      listUserWorkspaces(userId, database as unknown as CustomShellDb)
    ).resolves.toMatchObject({
      currentWorkspaceId: defaultWorkspace.id,
    })

    await expect(
      switchUserWorkspace(userId, uuid(), database as unknown as CustomShellDb)
    ).rejects.toThrow("Workspace not found")

    await deleteUserWorkspace(
      userId,
      secondWorkspace.id,
      database as unknown as CustomShellDb
    )
    const afterDelete = await listUserWorkspaces(
      userId,
      database as unknown as CustomShellDb
    )
    expect(afterDelete.workspaces.map((workspace) => workspace.id)).toEqual([
      defaultWorkspace.id,
    ])
    await expect(
      deleteUserWorkspace(
        userId,
        defaultWorkspace.id,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("At least one workspace is required")
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

describe("custom shell feedback notifications", () => {
  it("tracks feedback activity, marks read, and cascades source rows", async () => {
    const createdAt = now()
    const ownerId = uuid()
    const actorId = uuid()
    const feedbackId = uuid()
    const voteId = uuid()
    const commentId = uuid()
    const voteNotificationId = uuid()
    const commentNotificationId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: ownerId,
        email: "feedback-owner@internal.dev",
        name: "Owner",
        role: "user",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: actorId,
        email: "feedback-actor@internal.dev",
        name: "Actor",
        role: "user",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    await database.insert(customShellFeedback).values({
      id: feedbackId,
      userId: ownerId,
      type: "suggestion",
      message: "Notify me",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellFeedbackVotes).values({
      id: voteId,
      feedbackId,
      userId: actorId,
      createdAt,
    })
    await database.insert(customShellFeedbackComments).values({
      id: commentId,
      feedbackId,
      userId: actorId,
      message: "I agree",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellNotifications).values([
      {
        id: voteNotificationId,
        recipientUserId: ownerId,
        actorUserId: actorId,
        feedbackId,
        type: "feedback_vote",
        feedbackVoteId: voteId,
        createdAt,
      },
      {
        id: commentNotificationId,
        recipientUserId: ownerId,
        actorUserId: actorId,
        feedbackId,
        type: "feedback_comment",
        feedbackCommentId: commentId,
        createdAt,
      },
    ])

    const readAt = new Date(createdAt.getTime() + 1000)
    const [readNotification] = await database
      .update(customShellNotifications)
      .set({ readAt })
      .where(eq(customShellNotifications.id, voteNotificationId))
      .returning()
    expect(readNotification.readAt).toEqual(readAt)

    await database
      .delete(customShellFeedbackVotes)
      .where(eq(customShellFeedbackVotes.id, voteId))
    let remaining = await database.select().from(customShellNotifications)
    expect(remaining.map((row) => row.id)).toEqual([commentNotificationId])

    await database
      .delete(customShellFeedbackComments)
      .where(eq(customShellFeedbackComments.id, commentId))
    remaining = await database.select().from(customShellNotifications)
    expect(remaining).toHaveLength(0)
  })

  it("skips notifications for the feedback author acting on their own item", () => {
    const ownerId = uuid()
    const actorId = uuid()
    const feedback = { userId: ownerId }

    expect(shouldNotifyFeedbackAuthor(feedback, { id: actorId })).toBe(true)
    expect(shouldNotifyFeedbackAuthor(feedback, { id: ownerId })).toBe(false)
  })

  it("paginates only the current user's notifications", async () => {
    const createdAt = now()
    const actorId = uuid()
    const ownerId = uuid()
    const otherOwnerId = uuid()
    const ownerFeedbackId = uuid()
    const otherFeedbackId = uuid()
    const newestOwnerNotificationId = uuid()
    const olderOwnerNotificationId = uuid()
    const otherNotificationId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: actorId,
        email: "pager-actor@internal.dev",
        name: "Actor",
        role: "user",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: ownerId,
        email: "pager-owner@internal.dev",
        name: "Owner",
        role: "user",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: otherOwnerId,
        email: "pager-other@internal.dev",
        name: "Other",
        role: "user",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    await database.insert(customShellFeedback).values([
      {
        id: ownerFeedbackId,
        userId: ownerId,
        type: "suggestion",
        message: "Owner feedback",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: otherFeedbackId,
        userId: otherOwnerId,
        type: "suggestion",
        message: "Other feedback",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    await database.insert(customShellNotifications).values([
      {
        id: newestOwnerNotificationId,
        recipientUserId: ownerId,
        actorUserId: actorId,
        feedbackId: ownerFeedbackId,
        type: "feedback_vote",
        createdAt: new Date(createdAt.getTime() + 3000),
      },
      {
        id: otherNotificationId,
        recipientUserId: otherOwnerId,
        actorUserId: actorId,
        feedbackId: otherFeedbackId,
        type: "feedback_vote",
        createdAt: new Date(createdAt.getTime() + 2000),
      },
      {
        id: olderOwnerNotificationId,
        recipientUserId: ownerId,
        actorUserId: actorId,
        feedbackId: ownerFeedbackId,
        type: "feedback_comment",
        createdAt: new Date(createdAt.getTime() + 1000),
      },
    ])

    const firstPage = await getNotificationPage({
      currentUser: { id: ownerId, role: "user" },
      limit: 1,
      database: database as unknown as CustomShellDb,
    })
    expect(firstPage.notifications.map((item) => item.id)).toEqual([
      newestOwnerNotificationId,
    ])
    expect(firstPage.unread_count).toBe(2)
    expect(firstPage.next_cursor).toBeTruthy()

    const secondPage = await getNotificationPage({
      currentUser: { id: ownerId, role: "user" },
      cursor: firstPage.next_cursor ?? undefined,
      limit: 1,
      database: database as unknown as CustomShellDb,
    })
    expect(secondPage.notifications.map((item) => item.id)).toEqual([
      olderOwnerNotificationId,
    ])
  })

  it("allows only admins to list all notifications", async () => {
    const createdAt = now()
    const adminId = uuid()
    const ownerId = uuid()
    const actorId = uuid()
    const feedbackId = uuid()
    const notificationId = uuid()

    expect(canViewAllNotifications({ role: "admin" })).toBe(true)
    expect(canViewAllNotifications({ role: "user" })).toBe(false)

    await database.insert(customShellUsers).values([
      {
        id: adminId,
        email: "notification-admin@internal.dev",
        name: "Admin",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: ownerId,
        email: "notification-owner@internal.dev",
        name: "Owner",
        role: "user",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: actorId,
        email: "notification-actor@internal.dev",
        name: "Actor",
        role: "user",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    await database.insert(customShellFeedback).values({
      id: feedbackId,
      userId: ownerId,
      type: "suggestion",
      message: "Admin visible feedback",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellNotifications).values({
      id: notificationId,
      recipientUserId: ownerId,
      actorUserId: actorId,
      feedbackId,
      type: "feedback_comment",
      createdAt,
    })

    await expect(
      getNotificationPage({
        currentUser: { id: ownerId, role: "user" },
        includeAll: true,
        database: database as unknown as CustomShellDb,
      })
    ).rejects.toThrow("Not authorized")

    const adminPage = await getNotificationPage({
      currentUser: { id: adminId, role: "admin" },
      includeAll: true,
      database: database as unknown as CustomShellDb,
    })
    expect(adminPage.notifications).toMatchObject([
      {
        id: notificationId,
        actor_name: "Actor",
        recipient_name: "Owner",
      },
    ])

    const [notification] = await database
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.id, notificationId))
    expect(notification.readAt).toBeNull()
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
    expect(() =>
      validateMediaContent(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    ).not.toThrow()
    expect(() =>
      validateMediaContent("image/png", new Uint8Array([0xff, 0xd8, 0xff]))
    ).toThrow("File content does not match")
    const unsafeSvg = new TextEncoder().encode(
      '<svg viewBox="0 0 1 1"><script>alert(1)</script><path d="M0 0h1v1z" onclick="alert(1)" /></svg>'
    )
    expect(() => validateMediaContent("image/svg+xml", unsafeSvg)).not.toThrow()
    expect(
      new TextDecoder().decode(prepareMediaContent("image/svg+xml", unsafeSvg))
    ).toBe('<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"></path></svg>')
    expect(() =>
      prepareMediaContent(
        "image/svg+xml",
        new TextEncoder().encode('<svg><path fill="url(https://example.test/x)" /></svg>')
      )
    ).toThrow("File content does not match")
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
      media: [
        {
          id: ownedMediaId,
          original_name: "hero.png",
          url: `https://custom-shell-media.example.test/${ownerId}/hero.png`,
        },
      ],
    })
    await expect(getOwnedMedia(otherId, ownedMediaId)).rejects.toThrow(
      "Media not found"
    )
  })

  it("filters owned media by SVG mime type", async () => {
    const createdAt = now()
    const userId = uuid()
    const svgMediaId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "svg-owner@internal.dev",
      name: "SVG Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    await database.insert(customShellMedia).values([
      {
        id: uuid(),
        userId,
        filename: "hero.png",
        originalName: "hero.png",
        altText: null,
        fileSize: 123,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${userId}/hero.png`,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: svgMediaId,
        userId,
        filename: "icon.svg",
        originalName: "icon.svg",
        altText: "Icon",
        fileSize: 456,
        mimeType: "image/svg+xml",
        fileType: "image",
        storagePath: `${userId}/icon.svg`,
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await expect(
      listOwnedMedia({
        userId,
        page: 1,
        pageSize: 20,
        mimeType: "image/svg+xml",
      })
    ).resolves.toMatchObject({
      total: 1,
      media: [
        {
          id: svgMediaId,
          original_name: "icon.svg",
          mime_type: "image/svg+xml",
          url: `https://custom-shell-media.example.test/${userId}/icon.svg`,
        },
      ],
    })
  })
})
