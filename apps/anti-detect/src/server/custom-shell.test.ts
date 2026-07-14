import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setDbForTests, type Db } from "@/server/db"
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
  media,
  feedback,
  feedbackComments,
  feedbackVotes,
  notifications,
  sessions,
  users,
} from "@/server/schema"
import {
  canManageFeedbackComment,
  shouldNotifyFeedbackAuthor,
} from "@/lib/api/feedback"
import {
  canViewAllNotifications,
  createAlert,
  getNotificationPage,
} from "@/server/notifications"
import { proxyBecameDead } from "@/server/proxies"
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
const hadOriginalR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "ANTIDETECT_R2_PUBLIC_URL"
)
const originalR2PublicUrl = process.env.ANTIDETECT_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.ANTIDETECT_R2_PUBLIC_URL =
    "https://custom-shell-media.example.test"
  client = new PGlite()
  const migration = await readFile(
    new URL("../../drizzle/0000_baseline.sql", import.meta.url),
    "utf8"
  )
  const workspaceMigration = await readFile(
    new URL("../../drizzle/0003_workspaces.sql", import.meta.url),
    "utf8"
  )
  const operationalAlerts = await readFile(
    new URL("../../drizzle/0011_operational_alerts.sql", import.meta.url),
    "utf8"
  )
  await client.exec(migration)
  await client.exec(workspaceMigration)
  await client.exec(operationalAlerts)
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as Db)
})

afterEach(async () => {
  await client.close()
  if (hadOriginalR2PublicUrl) {
    process.env.ANTIDETECT_R2_PUBLIC_URL = originalR2PublicUrl
  } else {
    delete process.env.ANTIDETECT_R2_PUBLIC_URL
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

    await database.insert(users).values({
      id: userId,
      email: "tyler@internal.dev",
      name: "Tyler",
      role: "admin",
      passwordHash: await hash("password123"),
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(sessions).values({
      id: uuid(),
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiresAt(),
      createdAt,
    })

    await expect(findUserBySessionToken(token, database as unknown as Db)).resolves.toMatchObject({
      id: userId,
      email: "tyler@internal.dev",
    })

    await database
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
    await expect(findUserBySessionToken(token, database as unknown as Db)).resolves.toBeNull()

    await database.delete(sessions)
    await expect(findUserBySessionToken(token, database as unknown as Db)).resolves.toBeNull()
  })
})

describe("custom shell workspaces", () => {
  it("creates a default workspace and switches the active workspace", async () => {
    const createdAt = now()
    const userId = uuid()

    await database.insert(users).values({
      id: userId,
      email: "workspace-owner@internal.dev",
      name: "Workspace Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    expect(
      await listUserWorkspaces(userId, database as unknown as Db)
    ).toEqual({ workspaces: [], currentWorkspaceId: null })

    const defaultWorkspace = await getOrCreateCurrentWorkspace(
      userId,
      database as unknown as Db
    )
    expect(defaultWorkspace).toMatchObject({
      userId,
      name: "My project",
    })
    const defaultSettings = parseWorkspaceSettings(defaultWorkspace.settings)
    expect(defaultSettings.icon).toBe("briefcaseBusiness")
    expect(defaultSettings.sections[0]?.entries).toMatchObject([
      { type: "item", label: "Profiles", href: "/profiles", visible: true },
      { type: "item", label: "Proxies", href: "/proxies", visible: true },
    ])
    expect(defaultSettings.sections[1]?.entries).toMatchObject([
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
      database as unknown as Db
    )
    expect(secondWorkspace).toMatchObject({
      userId,
      name: "Client leads",
    })
    const secondSettings = parseWorkspaceSettings(secondWorkspace.settings)
    expect(secondSettings.icon).toBe("globe")
    expect(secondSettings.sections[0]?.entries).toMatchObject([
      { type: "item", label: "Profiles", href: "/profiles", visible: true },
      { type: "item", label: "Proxies", href: "/proxies", visible: true },
    ])
    expect(secondSettings.sections[1]?.entries).toMatchObject([
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
      database as unknown as Db
    )
    expect(updatedWorkspace.name).toBe("Client leads updated")
    expect(parseWorkspaceSettings(updatedWorkspace.settings).icon).toBe(
      "sparkles"
    )

    const listed = await listUserWorkspaces(
      userId,
      database as unknown as Db
    )
    expect(listed.currentWorkspaceId).toBe(secondWorkspace.id)
    expect(listed.workspaces.map((workspace) => workspace.id)).toEqual(
      expect.arrayContaining([defaultWorkspace.id, secondWorkspace.id])
    )

    await switchUserWorkspace(
      userId,
      defaultWorkspace.id,
      database as unknown as Db
    )
    await expect(
      listUserWorkspaces(userId, database as unknown as Db)
    ).resolves.toMatchObject({
      currentWorkspaceId: defaultWorkspace.id,
    })

    await expect(
      switchUserWorkspace(userId, uuid(), database as unknown as Db)
    ).rejects.toThrow("Workspace not found")

    await deleteUserWorkspace(
      userId,
      secondWorkspace.id,
      database as unknown as Db
    )
    const afterDelete = await listUserWorkspaces(
      userId,
      database as unknown as Db
    )
    expect(afterDelete.workspaces.map((workspace) => workspace.id)).toEqual([
      defaultWorkspace.id,
    ])
    await expect(
      deleteUserWorkspace(
        userId,
        defaultWorkspace.id,
        database as unknown as Db
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

    await database.insert(users).values({
      id: userId,
      email: "commenter@internal.dev",
      name: "Commenter",
      role: "user",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(feedback).values({
      id: feedbackId,
      userId,
      type: "suggestion",
      message: "Add comments",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(feedbackComments).values({
      id: commentId,
      feedbackId,
      userId,
      message: "First comment",
      createdAt,
      updatedAt: createdAt,
    })

    const [commentCount] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(feedbackComments)
      .where(eq(feedbackComments.feedbackId, feedbackId))
    expect(commentCount?.count).toBe(1)

    const updatedAt = new Date(createdAt.getTime() + 1000)
    const [updated] = await database
      .update(feedbackComments)
      .set({ message: "Updated comment", updatedAt })
      .where(eq(feedbackComments.id, commentId))
      .returning()
    expect(updated.message).toBe("Updated comment")

    const [deleted] = await database
      .delete(feedbackComments)
      .where(eq(feedbackComments.id, commentId))
      .returning()
    expect(deleted.id).toBe(commentId)

    await database.insert(feedbackComments).values({
      id: cascadeCommentId,
      feedbackId,
      userId,
      message: "Cascade me",
      createdAt,
      updatedAt: createdAt,
    })
    await database
      .delete(feedback)
      .where(eq(feedback.id, feedbackId))
    const remaining = await database.select().from(feedbackComments)
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

    await database.insert(users).values([
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
    await database.insert(feedback).values({
      id: feedbackId,
      userId: ownerId,
      type: "suggestion",
      message: "Notify me",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(feedbackVotes).values({
      id: voteId,
      feedbackId,
      userId: actorId,
      createdAt,
    })
    await database.insert(feedbackComments).values({
      id: commentId,
      feedbackId,
      userId: actorId,
      message: "I agree",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(notifications).values([
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
      .update(notifications)
      .set({ readAt })
      .where(eq(notifications.id, voteNotificationId))
      .returning()
    expect(readNotification.readAt).toEqual(readAt)

    await database
      .delete(feedbackVotes)
      .where(eq(feedbackVotes.id, voteId))
    let remaining = await database.select().from(notifications)
    expect(remaining.map((row) => row.id)).toEqual([commentNotificationId])

    await database
      .delete(feedbackComments)
      .where(eq(feedbackComments.id, commentId))
    remaining = await database.select().from(notifications)
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

    await database.insert(users).values([
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
    await database.insert(feedback).values([
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
    await database.insert(notifications).values([
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
      database: database as unknown as Db,
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
      database: database as unknown as Db,
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

    await database.insert(users).values([
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
    await database.insert(feedback).values({
      id: feedbackId,
      userId: ownerId,
      type: "suggestion",
      message: "Admin visible feedback",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(notifications).values({
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
        database: database as unknown as Db,
      })
    ).rejects.toThrow("Not authorized")

    const adminPage = await getNotificationPage({
      currentUser: { id: adminId, role: "admin" },
      includeAll: true,
      database: database as unknown as Db,
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
      .from(notifications)
      .where(eq(notifications.id, notificationId))
    expect(notification.readAt).toBeNull()
  })
})

describe("operational alerts", () => {
  it("records an actor-less, feedback-less alert and serializes it", async () => {
    const createdAt = now()
    const recipientId = uuid()
    await database.insert(users).values({
      id: recipientId,
      email: "alert-recipient@internal.dev",
      name: "Operator",
      role: "user",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    await createAlert({
      recipientUserId: recipientId,
      type: "proxy_dead",
      severity: "warning",
      title: "Proxy “US-Residential” is not responding",
      body: "Connection timed out",
      entityType: "proxy",
      entityId: "proxy-123",
      metadata: { latencyMs: 4000 },
      database: database as unknown as Db,
    })

    const [row] = await database.select().from(notifications)
    expect(row).toMatchObject({
      recipientUserId: recipientId,
      actorUserId: null,
      feedbackId: null,
      type: "proxy_dead",
      severity: "warning",
      entityType: "proxy",
      entityId: "proxy-123",
    })

    const page = await getNotificationPage({
      currentUser: { id: recipientId, role: "user" },
      database: database as unknown as Db,
    })
    expect(page.unread_count).toBe(1)
    expect(page.notifications[0]).toMatchObject({
      type: "proxy_dead",
      severity: "warning",
      title: "Proxy “US-Residential” is not responding",
      body: "Connection timed out",
      entity_type: "proxy",
      entity_id: "proxy-123",
      actor_name: null,
      feedback_id: null,
      feedback_message: null,
    })
    expect(page.notifications[0]?.metadata).toEqual({ latencyMs: 4000 })
  })

  it("only flags a proxy as newly dead on the ok/untested -> dead transition", () => {
    const dead = { ok: false, error: "timeout", testedAt: "t" }
    const alive = { ok: true, testedAt: "t" }
    // untested -> dead: alert
    expect(proxyBecameDead(null, dead)).toBe(true)
    // ok -> dead: alert
    expect(proxyBecameDead(alive, dead)).toBe(true)
    // dead -> dead: no repeat alert
    expect(proxyBecameDead(dead, dead)).toBe(false)
    // anything -> ok: no alert
    expect(proxyBecameDead(dead, alive)).toBe(false)
  })

  it("swallows a failed alert insert instead of throwing", async () => {
    const throwingDb = {
      insert: () => {
        throw new Error("db unavailable")
      },
    } as unknown as Db

    await expect(
      createAlert({
        recipientUserId: uuid(),
        type: "session_crashed",
        severity: "critical",
        title: "boom",
        database: throwingDb,
      })
    ).resolves.toBeUndefined()
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

    await database.insert(users).values([
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

    await database.insert(media).values([
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

    await database.insert(users).values({
      id: userId,
      email: "svg-owner@internal.dev",
      name: "SVG Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    await database.insert(media).values([
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
