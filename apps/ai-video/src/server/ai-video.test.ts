import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setDbForTests, type AiVideoDb } from "@/server/db"
import {
  cleanAltText,
  cleanOriginalName,
  getMediaFileType,
  getOwnedMedia,
  listOwnedMedia,
  sanitizeMediaContent,
  storedFilename,
  validateMediaContent,
  validateMediaFile,
} from "@/server/media"
import {
  aiVideoMedia,
  aiVideoFeedback,
  aiVideoFeedbackComments,
  aiVideoFeedbackVotes,
  aiVideoNotifications,
  aiVideoSessions,
  aiVideoUsers,
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
import { parsePromptDraft } from "@/server/ai-video/prompt-writer"
import { seedanceProvider } from "@/server/ai-video/providers"
import {
  listWorkflowModules,
  ugcModuleKey,
} from "@/server/ai-video/workflows"
import * as schema from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
const hadOriginalAiVideoR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "AI_VIDEO_R2_PUBLIC_URL"
)
const originalAiVideoR2PublicUrl = process.env.AI_VIDEO_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.AI_VIDEO_R2_PUBLIC_URL =
    "https://ai-video-media.example.test"
  client = new PGlite()
  const migration = await readFile(
    new URL("../../drizzle/0000_baseline.sql", import.meta.url),
    "utf8"
  )
  const workspaceMigration = await readFile(
    new URL("../../drizzle/0003_workspaces.sql", import.meta.url),
    "utf8"
  )
  const generationsMigration = await readFile(
    new URL("../../drizzle/0004_generations.sql", import.meta.url),
    "utf8"
  )
  const loginAttemptsMigration = await readFile(
    new URL("../../drizzle/0005_login_attempts.sql", import.meta.url),
    "utf8"
  )
  await client.exec(migration)
  await client.exec(workspaceMigration)
  await client.exec(generationsMigration)
  await client.exec(loginAttemptsMigration)
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as AiVideoDb)
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
  delete process.env.AI_VIDEO_SEEDANCE_API_KEY
  delete process.env.AI_VIDEO_SEEDANCE_MODEL
  delete process.env.AI_VIDEO_SEEDANCE_BASE_URL
  if (hadOriginalAiVideoR2PublicUrl) {
    process.env.AI_VIDEO_R2_PUBLIC_URL = originalAiVideoR2PublicUrl
  } else {
    delete process.env.AI_VIDEO_R2_PUBLIC_URL
  }
})

describe("ai video workflow modules", () => {
  it("loads the UGC workflow module", () => {
    expect(listWorkflowModules()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: ugcModuleKey,
          label: "UGC Ad Video",
          allowedProviders: ["seedance"],
        }),
      ])
    )
  })

  it("parses prompt writer JSON output", () => {
    expect(
      parsePromptDraft(
        '{"hook":"Stop scrolling","script":"Try this today","prompt":"Create a vertical UGC ad"}'
      )
    ).toEqual({
      hook: "Stop scrolling",
      script: "Try this today",
      prompt: "Create a vertical UGC ad",
    })
  })
})

describe("ai video provider adapters", () => {
  it("creates and reads Seedance tasks", async () => {
    process.env.AI_VIDEO_SEEDANCE_API_KEY = "test-key"
    process.env.AI_VIDEO_SEEDANCE_MODEL = "seedance-test"
    process.env.AI_VIDEO_SEEDANCE_BASE_URL = "https://seedance.example.test"
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "queued" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "task-1",
            status: "succeeded",
            video_url: "https://videos.example.test/result.mp4",
          }),
          { status: 200 }
        )
      )

    await expect(
      seedanceProvider.createGeneration({
        prompt: "Create a UGC video",
        model: "seedance-test",
        referenceUrls: ["https://media.example.test/actor.png"],
        settings: {
          aspectRatio: "9:16",
          durationSeconds: 8,
          resolution: "720p",
          nativeAudio: true,
        },
      })
    ).resolves.toMatchObject({
      providerTaskId: "task-1",
      status: "queued",
    })

    await expect(seedanceProvider.getGenerationStatus("task-1")).resolves.toMatchObject({
      providerTaskId: "task-1",
      status: "succeeded",
      resultUrl: "https://videos.example.test/result.mp4",
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://seedance.example.test/contents/generations/tasks",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("rejects unsafe provider result downloads", async () => {
    await expect(
      seedanceProvider.downloadResult("https://127.0.0.1/result.mp4")
    ).rejects.toThrow("Invalid provider result URL.")
  })

  it("requires provider result downloads to be videos", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    )

    await expect(
      seedanceProvider.downloadResult("https://1.1.1.1/result.mp4")
    ).rejects.toThrow("Provider result is not a video.")
  })
})

describe("ai video auth helpers", () => {
  it("verifies argon2 passwords", async () => {
    const passwordHash = await hash("password123")

    await expect(verifyPassword(passwordHash, "password123")).resolves.toBe(true)
    await expect(verifyPassword(passwordHash, "wrong")).resolves.toBe(false)
  })

  it("looks up valid sessions and rejects expired or deleted sessions", async () => {
    const userId = uuid()
    const token = "session-token"
    const createdAt = now()

    await database.insert(aiVideoUsers).values({
      id: userId,
      email: "tyler@internal.dev",
      name: "Tyler",
      role: "admin",
      passwordHash: await hash("password123"),
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(aiVideoSessions).values({
      id: uuid(),
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiresAt(),
      createdAt,
    })

    await expect(findUserBySessionToken(token, database as unknown as AiVideoDb)).resolves.toMatchObject({
      id: userId,
      email: "tyler@internal.dev",
    })

    await database
      .update(aiVideoSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
    await expect(findUserBySessionToken(token, database as unknown as AiVideoDb)).resolves.toBeNull()

    await database.delete(aiVideoSessions)
    await expect(findUserBySessionToken(token, database as unknown as AiVideoDb)).resolves.toBeNull()
  })
})

describe("ai video workspaces", () => {
  it("creates a default workspace and switches the active workspace", async () => {
    const createdAt = now()
    const userId = uuid()

    await database.insert(aiVideoUsers).values({
      id: userId,
      email: "workspace-owner@internal.dev",
      name: "Workspace Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    expect(
      await listUserWorkspaces(userId, database as unknown as AiVideoDb)
    ).toEqual({ workspaces: [], currentWorkspaceId: null })

    const defaultWorkspace = await getOrCreateCurrentWorkspace(
      userId,
      database as unknown as AiVideoDb
    )
    expect(defaultWorkspace).toMatchObject({
      userId,
      name: "My brand",
    })
    const defaultSettings = parseWorkspaceSettings(defaultWorkspace.settings)
    expect(defaultSettings.icon).toBe("briefcaseBusiness")
    expect(defaultSettings.sections[0]?.entries[0]).toMatchObject({
      type: "item",
      label: "Modules",
      href: "/admin/modules",
      visible: true,
    })

    const secondWorkspace = await createUserWorkspace(
      userId,
      "Client leads",
      { icon: "globe" },
      database as unknown as AiVideoDb
    )
    expect(secondWorkspace).toMatchObject({
      userId,
      name: "Client leads",
    })
    const secondSettings = parseWorkspaceSettings(secondWorkspace.settings)
    expect(secondSettings.icon).toBe("globe")
    expect(secondSettings.sections[0]?.entries[0]).toMatchObject({
      type: "item",
      label: "Modules",
      href: "/admin/modules",
      visible: true,
    })

    const updatedWorkspace = await updateUserWorkspace(
      userId,
      secondWorkspace.id,
      { name: "Client leads updated", settings: { icon: "sparkles" } },
      database as unknown as AiVideoDb
    )
    expect(updatedWorkspace.name).toBe("Client leads updated")
    expect(parseWorkspaceSettings(updatedWorkspace.settings).icon).toBe(
      "sparkles"
    )

    const listed = await listUserWorkspaces(
      userId,
      database as unknown as AiVideoDb
    )
    expect(listed.currentWorkspaceId).toBe(secondWorkspace.id)
    expect(listed.workspaces.map((workspace) => workspace.id)).toEqual(
      expect.arrayContaining([defaultWorkspace.id, secondWorkspace.id])
    )

    await switchUserWorkspace(
      userId,
      defaultWorkspace.id,
      database as unknown as AiVideoDb
    )
    await expect(
      listUserWorkspaces(userId, database as unknown as AiVideoDb)
    ).resolves.toMatchObject({
      currentWorkspaceId: defaultWorkspace.id,
    })

    await expect(
      switchUserWorkspace(userId, uuid(), database as unknown as AiVideoDb)
    ).rejects.toThrow("Workspace not found")

    await deleteUserWorkspace(
      userId,
      secondWorkspace.id,
      database as unknown as AiVideoDb
    )
    const afterDelete = await listUserWorkspaces(
      userId,
      database as unknown as AiVideoDb
    )
    expect(afterDelete.workspaces.map((workspace) => workspace.id)).toEqual([
      defaultWorkspace.id,
    ])
    await expect(
      deleteUserWorkspace(
        userId,
        defaultWorkspace.id,
        database as unknown as AiVideoDb
      )
    ).rejects.toThrow("At least one workspace is required")
  })
})

describe("ai video feedback comments", () => {
  it("creates, updates, deletes, counts, and cascades comments", async () => {
    const createdAt = now()
    const userId = uuid()
    const feedbackId = uuid()
    const commentId = uuid()
    const cascadeCommentId = uuid()

    await database.insert(aiVideoUsers).values({
      id: userId,
      email: "commenter@internal.dev",
      name: "Commenter",
      role: "user",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(aiVideoFeedback).values({
      id: feedbackId,
      userId,
      type: "suggestion",
      message: "Add comments",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(aiVideoFeedbackComments).values({
      id: commentId,
      feedbackId,
      userId,
      message: "First comment",
      createdAt,
      updatedAt: createdAt,
    })

    const [commentCount] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(aiVideoFeedbackComments)
      .where(eq(aiVideoFeedbackComments.feedbackId, feedbackId))
    expect(commentCount?.count).toBe(1)

    const updatedAt = new Date(createdAt.getTime() + 1000)
    const [updated] = await database
      .update(aiVideoFeedbackComments)
      .set({ message: "Updated comment", updatedAt })
      .where(eq(aiVideoFeedbackComments.id, commentId))
      .returning()
    expect(updated.message).toBe("Updated comment")

    const [deleted] = await database
      .delete(aiVideoFeedbackComments)
      .where(eq(aiVideoFeedbackComments.id, commentId))
      .returning()
    expect(deleted.id).toBe(commentId)

    await database.insert(aiVideoFeedbackComments).values({
      id: cascadeCommentId,
      feedbackId,
      userId,
      message: "Cascade me",
      createdAt,
      updatedAt: createdAt,
    })
    await database
      .delete(aiVideoFeedback)
      .where(eq(aiVideoFeedback.id, feedbackId))
    const remaining = await database.select().from(aiVideoFeedbackComments)
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

describe("ai video feedback notifications", () => {
  it("tracks feedback activity, marks read, and cascades source rows", async () => {
    const createdAt = now()
    const ownerId = uuid()
    const actorId = uuid()
    const feedbackId = uuid()
    const voteId = uuid()
    const commentId = uuid()
    const voteNotificationId = uuid()
    const commentNotificationId = uuid()

    await database.insert(aiVideoUsers).values([
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
    await database.insert(aiVideoFeedback).values({
      id: feedbackId,
      userId: ownerId,
      type: "suggestion",
      message: "Notify me",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(aiVideoFeedbackVotes).values({
      id: voteId,
      feedbackId,
      userId: actorId,
      createdAt,
    })
    await database.insert(aiVideoFeedbackComments).values({
      id: commentId,
      feedbackId,
      userId: actorId,
      message: "I agree",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(aiVideoNotifications).values([
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
      .update(aiVideoNotifications)
      .set({ readAt })
      .where(eq(aiVideoNotifications.id, voteNotificationId))
      .returning()
    expect(readNotification.readAt).toEqual(readAt)

    await database
      .delete(aiVideoFeedbackVotes)
      .where(eq(aiVideoFeedbackVotes.id, voteId))
    let remaining = await database.select().from(aiVideoNotifications)
    expect(remaining.map((row) => row.id)).toEqual([commentNotificationId])

    await database
      .delete(aiVideoFeedbackComments)
      .where(eq(aiVideoFeedbackComments.id, commentId))
    remaining = await database.select().from(aiVideoNotifications)
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

    await database.insert(aiVideoUsers).values([
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
    await database.insert(aiVideoFeedback).values([
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
    await database.insert(aiVideoNotifications).values([
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
      database: database as unknown as AiVideoDb,
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
      database: database as unknown as AiVideoDb,
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

    await database.insert(aiVideoUsers).values([
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
    await database.insert(aiVideoFeedback).values({
      id: feedbackId,
      userId: ownerId,
      type: "suggestion",
      message: "Admin visible feedback",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(aiVideoNotifications).values({
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
        database: database as unknown as AiVideoDb,
      })
    ).rejects.toThrow("Not authorized")

    const adminPage = await getNotificationPage({
      currentUser: { id: adminId, role: "admin" },
      includeAll: true,
      database: database as unknown as AiVideoDb,
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
      .from(aiVideoNotifications)
      .where(eq(aiVideoNotifications.id, notificationId))
    expect(notification.readAt).toBeNull()
  })
})

describe("ai video media helpers", () => {
  it("validates media types, sizes, filenames, and alt text", () => {
    expect(getMediaFileType("image/png")).toBe("image")
    expect(getMediaFileType("image/svg+xml")).toBe("image")
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
    expect(storedFilename("Logo", "image/svg+xml")).toMatch(/_Logo\.svg$/)
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
  })

  it("sanitizes SVG uploads before storage", () => {
    const unsafeSvg = new TextEncoder().encode(`
      <?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject><iframe src="https://example.com"></iframe></foreignObject>
        <path d="M0 0h10v10H0z" fill="url(javascript:alert(1))" stroke="red" />
      </svg>
    `)

    expect(() => validateMediaFile("image/svg+xml", unsafeSvg.byteLength)).not.toThrow()
    expect(() => validateMediaContent("image/svg+xml", unsafeSvg)).not.toThrow()

    const sanitized = new TextDecoder().decode(
      sanitizeMediaContent("image/svg+xml", unsafeSvg)
    )
    expect(sanitized).toContain("<svg")
    expect(sanitized).toContain('stroke="red"')
    expect(sanitized).not.toContain("script")
    expect(sanitized).not.toContain("foreignObject")
    expect(sanitized).not.toContain("onload")
    expect(sanitized).not.toContain("javascript")
    expect(sanitized).not.toContain("url(")
  })

  it("lists only owned media and blocks cross-user access", async () => {
    const createdAt = now()
    const ownerId = uuid()
    const otherId = uuid()
    const ownerWorkspaceId = uuid()
    const otherWorkspaceId = uuid()
    const ownedMediaId = uuid()

    await database.insert(aiVideoUsers).values([
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
    await database.insert(schema.aiVideoWorkspaces).values([
      {
        id: ownerWorkspaceId,
        userId: ownerId,
        name: "Owner brand",
        settings: {},
        isDefault: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: otherWorkspaceId,
        userId: otherId,
        name: "Other brand",
        settings: {},
        isDefault: true,
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await database.insert(aiVideoMedia).values([
      {
        id: ownedMediaId,
        userId: ownerId,
        workspaceId: ownerWorkspaceId,
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
        workspaceId: otherWorkspaceId,
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
      listOwnedMedia({
        userId: ownerId,
        workspaceId: ownerWorkspaceId,
        page: 1,
        pageSize: 20,
      })
    ).resolves.toMatchObject({
      total: 1,
      media: [
        {
          id: ownedMediaId,
          original_name: "hero.png",
          url: `https://ai-video-media.example.test/${ownerId}/hero.png`,
        },
      ],
    })
    await expect(
      getOwnedMedia(otherId, otherWorkspaceId, ownedMediaId)
    ).rejects.toThrow("Media not found")
  })
})
