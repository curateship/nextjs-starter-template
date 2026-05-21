import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { and, eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setDbForTests, type CoreDb } from "@/server/db"
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
  media,
  feedback,
  feedbackComments,
  feedbackVotes,
  notifications,
  proxies,
  scraperProviderSettings,
  scraperRuns,
  sessions,
  users,
} from "@/server/schema"
import {
  createUserWorkspace,
  deleteUserWorkspace,
  getOrCreateCurrentWorkspace,
  listUserWorkspaces,
  parseWorkspaceSettings,
  switchUserWorkspace,
  updateUserWorkspace,
} from "@/server/workspaces"
import {
  decryptProxyPassword,
  encryptProxyPassword,
  parseProxyImportLines,
  serializeProxy,
} from "@/server/proxies"
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
  buildActorInput,
  mapApifyStatus,
  normalizeResult,
} from "@/scrapers/google-maps/adapter"
import { serializeSettings } from "@/scrapers/google-maps/schema"
import {
  decryptScraperSecret,
  encryptScraperSecret,
} from "@/scrapers/secrets"
import * as schema from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  const migration = await readFile(
    new URL("../../drizzle/0000_core_baseline.sql", import.meta.url),
    "utf8"
  )
  const scraperMigration = await readFile(
    new URL("../../drizzle/0004_core_scrapers.sql", import.meta.url),
    "utf8"
  )
  const workspaceMigration = await readFile(
    new URL("../../drizzle/0005_core_workspaces.sql", import.meta.url),
    "utf8"
  )
  await client.exec(migration)
  await client.exec(scraperMigration)
  await client.exec(workspaceMigration)
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CoreDb)
})

afterEach(async () => {
  await client.close()
})

describe("core auth helpers", () => {
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

    await expect(findUserBySessionToken(token, database as unknown as CoreDb)).resolves.toMatchObject({
      id: userId,
      email: "tyler@internal.dev",
    })

    await database
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
    await expect(findUserBySessionToken(token, database as unknown as CoreDb)).resolves.toBeNull()

    await database.delete(sessions)
    await expect(findUserBySessionToken(token, database as unknown as CoreDb)).resolves.toBeNull()
  })
})

describe("core workspaces", () => {
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
      await listUserWorkspaces(userId, database as unknown as CoreDb)
    ).toEqual({ workspaces: [], currentWorkspaceId: null })

    const defaultWorkspace = await getOrCreateCurrentWorkspace(
      userId,
      database as unknown as CoreDb
    )
    expect(defaultWorkspace).toMatchObject({
      userId,
      name: "My project",
    })
    expect(parseWorkspaceSettings(defaultWorkspace.settings).icon).toBe(
      "briefcaseBusiness"
    )

    const secondWorkspace = await createUserWorkspace(
      userId,
      "Client leads",
      { icon: "globe" },
      database as unknown as CoreDb
    )
    expect(secondWorkspace).toMatchObject({
      userId,
      name: "Client leads",
    })
    expect(parseWorkspaceSettings(secondWorkspace.settings).icon).toBe("globe")

    const updatedWorkspace = await updateUserWorkspace(
      userId,
      secondWorkspace.id,
      { name: "Client leads updated", settings: { icon: "sparkles" } },
      database as unknown as CoreDb
    )
    expect(updatedWorkspace.name).toBe("Client leads updated")
    expect(parseWorkspaceSettings(updatedWorkspace.settings).icon).toBe(
      "sparkles"
    )

    const listed = await listUserWorkspaces(
      userId,
      database as unknown as CoreDb
    )
    expect(listed.currentWorkspaceId).toBe(secondWorkspace.id)
    expect(listed.workspaces.map((workspace) => workspace.id)).toEqual(
      expect.arrayContaining([defaultWorkspace.id, secondWorkspace.id])
    )

    await switchUserWorkspace(
      userId,
      defaultWorkspace.id,
      database as unknown as CoreDb
    )
    await expect(
      listUserWorkspaces(userId, database as unknown as CoreDb)
    ).resolves.toMatchObject({
      currentWorkspaceId: defaultWorkspace.id,
    })

    await expect(
      switchUserWorkspace(userId, uuid(), database as unknown as CoreDb)
    ).rejects.toThrow("Workspace not found")

    await deleteUserWorkspace(
      userId,
      secondWorkspace.id,
      database as unknown as CoreDb
    )
    const afterDelete = await listUserWorkspaces(
      userId,
      database as unknown as CoreDb
    )
    expect(afterDelete.workspaces.map((workspace) => workspace.id)).toEqual([
      defaultWorkspace.id,
    ])
    await expect(
      deleteUserWorkspace(userId, defaultWorkspace.id, database as unknown as CoreDb)
    ).rejects.toThrow("At least one workspace is required")
  })
})

describe("core feedback comments", () => {
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

describe("core feedback notifications", () => {
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
      database: database as unknown as CoreDb,
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
      database: database as unknown as CoreDb,
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
        database: database as unknown as CoreDb,
      })
    ).rejects.toThrow("Not authorized")

    const adminPage = await getNotificationPage({
      currentUser: { id: adminId, role: "admin" },
      includeAll: true,
      database: database as unknown as CoreDb,
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

describe("core proxies", () => {
  it("parses host:port:user:pass import lines and reports invalid rows", () => {
    const parsed = parseProxyImportLines([
      "PROXY.EXAMPLE.COM:8080:user:pass",
      "bad-line",
      "proxy-2.example.com:65535:user-2:pass:with:colon",
      "127.0.0.1:8080:user:pass",
    ].join("\n"))

    expect(parsed.proxies).toEqual([
      {
        line: 1,
        host: "proxy.example.com",
        port: 8080,
        username: "user",
        password: "pass",
      },
      {
        line: 3,
        host: "proxy-2.example.com",
        port: 65535,
        username: "user-2",
        password: "pass:with:colon",
      },
    ])
    expect(parsed.errors).toEqual([
      {
        line: 2,
        value: "bad-line",
        error: "Use host:port:user:pass.",
      },
      {
        line: 4,
        value: "127.0.0.1:8080:user:pass",
        error: "Use host:port:user:pass.",
      },
    ])
  })

  it("encrypts proxy passwords and serializes rows without exposing them", async () => {
    const previousKey = process.env.CORE_PROXY_ENCRYPTION_KEY
    process.env.CORE_PROXY_ENCRYPTION_KEY = "test proxy encryption key with enough length"

    try {
      const createdAt = now()
      const passwordEncrypted = encryptProxyPassword("secret-pass")
      expect(passwordEncrypted).not.toContain("secret-pass")
      expect(decryptProxyPassword(passwordEncrypted)).toBe("secret-pass")

      const [row] = await database
        .insert(proxies)
        .values({
          id: uuid(),
          name: "US residential",
          protocol: "http",
          host: "proxy.example.com",
          port: 8080,
          username: "user",
          passwordEncrypted,
          connectionType: "residential",
          country: "United States",
          enabled: true,
          lastStatus: "untested",
          createdAt,
          updatedAt: createdAt,
        })
        .returning()

      expect(serializeProxy(row)).toMatchObject({
        name: "US residential",
        username: "user",
        has_password: true,
      })
      expect(JSON.stringify(serializeProxy(row))).not.toContain(passwordEncrypted)
    } finally {
      if (previousKey === undefined) {
        delete process.env.CORE_PROXY_ENCRYPTION_KEY
      } else {
        process.env.CORE_PROXY_ENCRYPTION_KEY = previousKey
      }
    }
  })

  it("rejects weak proxy encryption keys", () => {
    const previousKey = process.env.CORE_PROXY_ENCRYPTION_KEY
    process.env.CORE_PROXY_ENCRYPTION_KEY = "too-short"

    try {
      expect(() => encryptProxyPassword("secret-pass")).toThrow(
        "CORE_PROXY_ENCRYPTION_KEY must be at least 32 characters."
      )
    } finally {
      if (previousKey === undefined) {
        delete process.env.CORE_PROXY_ENCRYPTION_KEY
      } else {
        process.env.CORE_PROXY_ENCRYPTION_KEY = previousKey
      }
    }
  })
})

describe("core scrapers", () => {
  it("uses generic JSON columns for scraper data", async () => {
    const result = await client.query<{ table_name: string; column_name: string }>(`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public' and table_name like 'scraper_%'
    `)
    const columns = result.rows.map((row) => `${row.table_name}.${row.column_name}`)

    expect(columns).toEqual(expect.arrayContaining([
      "scraper_provider_settings.config",
      "scraper_runs.input",
      "scraper_runs.metadata",
      "scraper_executions.stats",
      "scraper_results.data",
    ]))
    expect(columns).not.toEqual(expect.arrayContaining([
      "scraper_runs.keyword",
      "scraper_runs.location",
      "scraper_results.rating",
      "scraper_results.phone",
    ]))
  })

  it("scopes scraper settings and runs by workspace", async () => {
    const createdAt = now()
    const userId = uuid()

    await database.insert(users).values({
      id: userId,
      email: "scraper-workspaces@internal.dev",
      name: "Scraper Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    const firstWorkspace = await createUserWorkspace(
      userId,
      "First project",
      {},
      database as unknown as CoreDb
    )
    const secondWorkspace = await createUserWorkspace(
      userId,
      "Second project",
      {},
      database as unknown as CoreDb
    )

    await database.insert(scraperProviderSettings).values([
      {
        workspaceId: firstWorkspace.id,
        providerKey: "apify",
        config: { actorId: "actor-one", defaultMaxResults: 25 },
        secretEncrypted: null,
        createdAt,
        updatedAt: createdAt,
      },
      {
        workspaceId: secondWorkspace.id,
        providerKey: "apify",
        config: { actorId: "actor-two", defaultMaxResults: 50 },
        secretEncrypted: null,
        createdAt,
        updatedAt: createdAt,
      },
    ])

    const settingsRows = await database
      .select()
      .from(scraperProviderSettings)
      .where(eq(scraperProviderSettings.providerKey, "apify"))
    expect(settingsRows).toHaveLength(2)

    await database.insert(scraperRuns).values([
      {
        id: uuid(),
        workspaceId: firstWorkspace.id,
        scraperKey: "google-maps",
        name: "First run",
        status: "active",
        input: {
          keyword: "Dentists",
          location: "Austin, TX",
          language: "en",
          maxResults: 25,
        },
        metadata: {},
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: uuid(),
        workspaceId: secondWorkspace.id,
        scraperKey: "google-maps",
        name: "Second run",
        status: "active",
        input: {
          keyword: "Restaurants",
          location: "Denver, CO",
          language: "en",
          maxResults: 25,
        },
        metadata: {},
        createdAt,
        updatedAt: createdAt,
      },
    ])

    const firstRuns = await database
      .select()
      .from(scraperRuns)
      .where(
        and(
          eq(scraperRuns.workspaceId, firstWorkspace.id),
          eq(scraperRuns.scraperKey, "google-maps")
        )
      )
    expect(firstRuns).toHaveLength(1)
    expect(firstRuns[0].name).toBe("First run")
  })

  it("encrypts scraper tokens and serializes only connection state", async () => {
    const previousKey = process.env.CORE_SCRAPER_ENCRYPTION_KEY
    process.env.CORE_SCRAPER_ENCRYPTION_KEY = "test scraper encryption key with enough length"

    try {
      const createdAt = now()
      const userId = uuid()

      await database.insert(users).values({
        id: userId,
        email: "scraper-token@internal.dev",
        name: "Scraper Token Owner",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      })
      const workspace = await createUserWorkspace(
        userId,
        "Token project",
        {},
        database as unknown as CoreDb
      )
      const encrypted = encryptScraperSecret("apify-secret")
      expect(decryptScraperSecret(encrypted)).toBe("apify-secret")

      const [row] = await database.insert(scraperProviderSettings).values({
        workspaceId: workspace.id,
        providerKey: "apify",
        config: { actorId: "compass/crawler-google-places", defaultMaxResults: 25 },
        secretEncrypted: encrypted,
        createdAt,
        updatedAt: createdAt,
      }).returning()

      const serialized = serializeSettings(row)
      expect(serialized).toMatchObject({ has_token: true, default_max_results: 25 })
      expect(JSON.stringify(serialized)).not.toContain("apify-secret")
      expect(JSON.stringify(serialized)).not.toContain(encrypted)
    } finally {
      if (previousKey === undefined) delete process.env.CORE_SCRAPER_ENCRYPTION_KEY
      else process.env.CORE_SCRAPER_ENCRYPTION_KEY = previousKey
    }
  })

  it("maps Apify input, statuses, and Google Maps result data", () => {
    expect(buildActorInput({
      keyword: "Dentists",
      location: "Austin, TX",
      language: "en",
      maxResults: 25,
    })).toEqual({
      searchStringsArray: ["Dentists"],
      locationQuery: "Austin, TX",
      maxCrawledPlacesPerSearch: 25,
      language: "en",
    })

    expect(mapApifyStatus("READY")).toBe("queued")
    expect(mapApifyStatus("RUNNING")).toBe("running")
    expect(mapApifyStatus("SUCCEEDED")).toBe("succeeded")
    expect(mapApifyStatus("TIMED-OUT")).toBe("failed")

    expect(normalizeResult({
      title: "Austin Dental",
      categories: ["Dentist", "Health"],
      totalScore: "4.8",
      reviewsCount: "42",
      website: "javascript:alert(1)",
      placeId: "place-123",
      location: { lat: 30.2, lng: -97.7 },
    })).toMatchObject({
      externalId: "place-123",
      title: "Austin Dental",
      data: {
        category: "Dentist, Health",
        rating: 4.8,
        reviewCount: 42,
        website: null,
        latitude: 30.2,
      },
    })
  })
})

describe("core media helpers", () => {
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
      media: [{ id: ownedMediaId, original_name: "hero.png" }],
    })
    await expect(getOwnedMedia(otherId, ownedMediaId)).rejects.toThrow(
      "Media not found"
    )
  })
})
