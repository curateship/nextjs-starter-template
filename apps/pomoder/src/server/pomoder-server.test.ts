import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getEntitlements } from "@/server/entitlements"
import { applyPomoderAdminAction, loadPomoderAdminData } from "@/server/admin"
import {
  adminCreateActionSchema,
  type PomoderAdminAction,
  type PomoderAdminCreateRecord,
} from "@/server/admin-contract"
import { generationLimit } from "@/server/generation"
import {
  finalizeProcessedUpload,
  validateMediaUpload,
  validateUploadContentLength,
} from "@/server/pomoder-media"
import { buildFocusSummary, calculateFocusStreaks, completeProductivitySession, loadFocusSummary, rollOverTasks, startProductivitySession, toggleTaskStatus } from "@/server/productivity"
import { enforceRateLimit } from "@/server/rate-limit"
import { canJoinRoom } from "@/server/rooms"
import { consumeAuthToken } from "@/server/security"
import type { PomoderDb } from "@/server/db"
import {
  adminAuditLogs,
  authTokens,
  dailyFocusStats,
  focusSessions,
  generationUsage,
  mediaAssets,
  rateLimits,
  roomReports,
  rooms,
  sessions,
  storageDeletionJobs,
  subscriptions,
  tasks,
  userPreferences,
  users,
} from "@/server/schema"
import { processStorageDeletionJobs } from "@/server/storage-deletion"
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
  await client.exec(
    await readFile(
      new URL(
        "../../drizzle/0003_custom_shell_workspaces.sql",
        import.meta.url
      ),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0004_pomoder_product.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0005_admin_security.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0006_daily_goals_and_streaks.sql", import.meta.url),
      "utf8"
    )
  )
  database = drizzle(client, { schema })
})

afterEach(async () => client.close())

describe("Pomoder entitlements", () => {
  it("grants Pro only while an eligible subscription period is current", () => {
    const now = new Date("2026-07-14T12:00:00Z")
    expect(getEntitlements(null, now).plan).toBe("free")
    expect(
      getEntitlements(
        {
          status: "active",
          currentPeriodEnd: new Date("2026-08-14T12:00:00Z"),
        },
        now
      )
    ).toMatchObject({
      plan: "pro",
      canHostRooms: true,
      storageLimitBytes: 2_147_483_648,
      monthlyBackgrounds: 5,
      monthlySoundscapes: 20,
    })
    expect(
      getEntitlements(
        {
          status: "past_due",
          currentPeriodEnd: new Date("2026-07-15T12:00:00Z"),
        },
        now
      ).plan
    ).toBe("pro")
    expect(
      getEntitlements(
        {
          status: "canceled",
          currentPeriodEnd: new Date("2026-08-14T12:00:00Z"),
        },
        now
      ).plan
    ).toBe("free")
  })
})

describe("task rollover", () => {
  it("archives prior active tasks and clones them into today once", async () => {
    const [user] = await database
      .insert(users)
      .values({
        email: "focus@example.com",
        name: "Focus",
        passwordHash: "hash",
      })
      .returning()
    await database.insert(tasks).values({
      userId: user.id,
      title: "Carry me",
      plannedDate: "2026-07-13",
      pomodoroCount: 2,
    })

    await rollOverTasks(user.id, "2026-07-14", database as unknown as PomoderDb)
    await rollOverTasks(user.id, "2026-07-14", database as unknown as PomoderDb)

    const stored = await database.select().from(tasks)
    expect(stored).toHaveLength(2)
    expect(
      stored.find((task) => task.plannedDate === "2026-07-13")
    ).toMatchObject({ status: "carried" })
    expect(
      stored.find((task) => task.plannedDate === "2026-07-14")
    ).toMatchObject({ status: "active", title: "Carry me", pomodoroCount: 2 })
  })

  it("updates the daily completed-task total when a task is completed or reopened", async () => {
    const [user] = await database
      .insert(users)
      .values({
        email: "tasks@example.com",
        name: "Tasks",
        passwordHash: "hash",
      })
      .returning()
    const [task] = await database
      .insert(tasks)
      .values({ userId: user.id, title: "Count me", plannedDate: "2026-07-14" })
      .returning()

    await toggleTaskStatus(
      user.id,
      task.id,
      "2026-07-14",
      database as unknown as PomoderDb
    )
    expect(
      (await database.select().from(dailyFocusStats))[0]?.tasksCompleted
    ).toBe(1)

    await toggleTaskStatus(
      user.id,
      task.id,
      "2026-07-14",
      database as unknown as PomoderDb
    )
    expect(
      (await database.select().from(dailyFocusStats))[0]?.tasksCompleted
    ).toBe(0)
  })
})

describe("focus task attribution", () => {
  it("increments the linked task exactly once when a focus session completes", async () => {
    const [user] = await database.insert(users).values({ email: "attribution@example.com", name: "Attribution", passwordHash: "hash" }).returning()
    const [task] = await database.insert(tasks).values({ userId: user.id, title: "Write tests", plannedDate: "2026-07-15" }).returning()
    const session = await startProductivitySession(user.id, "2026-07-15", { taskId: task.id, mode: "focus", plannedSeconds: 1_500, idempotencyKey: "task-attribution-test" }, database as unknown as PomoderDb)
    const breakSession = await startProductivitySession(user.id, "2026-07-15", { taskId: task.id, mode: "short", plannedSeconds: 300, idempotencyKey: "break-attribution-test" }, database as unknown as PomoderDb)

    expect(session?.taskId).toBe(task.id)
    expect(breakSession?.taskId).toBeNull()
    const first = await completeProductivitySession(user.id, session!.id, 1_500, "2026-07-15", database as unknown as PomoderDb)
    const duplicate = await completeProductivitySession(user.id, session!.id, 1_500, "2026-07-15", database as unknown as PomoderDb)

    expect(first?.task).toMatchObject({ id: task.id, pomodoroCount: 1 })
    expect(duplicate).toBeNull()
    expect((await database.select().from(tasks))[0]?.pomodoroCount).toBe(1)
    expect((await database.select().from(dailyFocusStats))[0]).toMatchObject({ focusSessions: 1, focusSeconds: 1_500 })
  })
})

describe("daily goals and focus streaks", () => {
  it("calculates current and best streaks across gaps and ignores duplicates and future dates", () => {
    expect(calculateFocusStreaks([], "2026-07-15")).toEqual({ currentStreak: 0, bestStreak: 0 })
    expect(calculateFocusStreaks(["2026-07-15", "2026-07-14", "2026-07-14", "2026-07-10", "2026-07-09", "2026-07-08", "2026-07-16"], "2026-07-15")).toEqual({ currentStreak: 2, bestStreak: 3 })
    expect(calculateFocusStreaks(["2026-07-12", "2026-07-11"], "2026-07-15")).toEqual({ currentStreak: 0, bestStreak: 2 })
  })

  it("keeps a streak ending yesterday current through today", () => {
    expect(calculateFocusStreaks(["2026-07-12", "2026-07-13", "2026-07-14"], "2026-07-15")).toEqual({ currentStreak: 3, bestStreak: 3 })
  })

  it("treats timezone-local dates as consecutive across daylight-saving boundaries", () => {
    expect(calculateFocusStreaks(["2026-03-07", "2026-03-08", "2026-03-09"], "2026-03-09")).toEqual({ currentStreak: 3, bestStreak: 3 })
    expect(calculateFocusStreaks(["2026-10-31", "2026-11-01", "2026-11-02"], "2026-11-02")).toEqual({ currentStreak: 3, bestStreak: 3 })
  })

  it("applies a bounded default daily goal in the database", async () => {
    const [user] = await database.insert(users).values({ email: "goals@example.com", name: "Goals", passwordHash: "hash" }).returning()
    const [preferences] = await database.insert(userPreferences).values({ userId: user.id }).returning()
    expect(preferences.dailyGoalSessions).toBe(4)
    await expect(database.update(userPreferences).set({ dailyGoalSessions: 0 })).rejects.toThrow()
    await expect(database.update(userPreferences).set({ dailyGoalSessions: 21 })).rejects.toThrow()
  })

  it("builds goal progress and streak values for productivity responses", () => {
    expect(buildFocusSummary([
      { localDate: "2026-07-13", focusSessions: 2 },
      { localDate: "2026-07-14", focusSessions: 1 },
      { localDate: "2026-07-15", focusSessions: 4 },
    ], "2026-07-15", 4)).toEqual({
      currentStreak: 3,
      bestStreak: 3,
      todayCompletedSessions: 4,
      dailyGoalSessions: 4,
      goalProgress: 1,
      goalCompleted: true,
    })
  })

  it("loads focus summaries only from the requested user's daily stats", async () => {
    const [first, second] = await database.insert(users).values([
      { email: "first-goal@example.com", name: "First", passwordHash: "hash" },
      { email: "second-goal@example.com", name: "Second", passwordHash: "hash" },
    ]).returning()
    await database.insert(dailyFocusStats).values([
      { userId: first.id, localDate: "2026-07-14", focusSessions: 1 },
      { userId: first.id, localDate: "2026-07-15", focusSessions: 2 },
      { userId: second.id, localDate: "2026-07-15", focusSessions: 12 },
    ])

    expect(await loadFocusSummary(first.id, "2026-07-15", 4, database as unknown as PomoderDb)).toEqual({
      currentStreak: 2,
      bestStreak: 2,
      todayCompletedSessions: 2,
      dailyGoalSessions: 4,
      goalProgress: 0.5,
      goalCompleted: false,
    })
  })
})

describe("media and room policies", () => {
  it("validates media signatures instead of trusting the browser MIME type", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(
      validateMediaUpload({
        bytes: png,
        mimeType: "image/png",
        fileSize: png.byteLength,
      })
    ).toEqual({ kind: "image", extension: "png" })
    expect(() =>
      validateMediaUpload({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
        fileSize: 3,
      })
    ).toThrow("INVALID_FILE_CONTENT")
  })

  it("locks room joins during focus and applies fixed monthly generation caps", () => {
    expect(canJoinRoom("waiting")).toBe(true)
    expect(canJoinRoom("short")).toBe(true)
    expect(canJoinRoom("focus")).toBe(false)
    expect(generationLimit("background")).toBe(5)
    expect(generationLimit("soundscape")).toBe(20)
  })

  it("rejects missing, malformed, and oversized upload lengths before parsing", () => {
    expect(() => validateUploadContentLength(null)).toThrow(
      "CONTENT_LENGTH_REQUIRED"
    )
    expect(() => validateUploadContentLength("not-a-number")).toThrow(
      "INVALID_CONTENT_LENGTH"
    )
    expect(() => validateUploadContentLength("0")).toThrow(
      "INVALID_CONTENT_LENGTH"
    )
    expect(() =>
      validateUploadContentLength(String(102 * 1024 * 1024))
    ).toThrow("FILE_TOO_LARGE")
  })
})

describe("authentication hardening", () => {
  it("counts concurrent requests atomically and blocks attempts over the limit", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        enforceRateLimit(
          "login:test",
          { maxAttempts: 5, windowSeconds: 900 },
          database as unknown as PomoderDb
        )
      )
    )

    expect(results.filter((result) => result.status === "rejected")).toHaveLength(
      1
    )
    expect((await database.select().from(rateLimits))[0]).toMatchObject({
      attempts: 6,
    })
  })

  it("allows a one-time authentication token to be consumed only once", async () => {
    const [user] = await database
      .insert(users)
      .values({
        email: "token@example.com",
        name: "Token",
        passwordHash: "hash",
      })
      .returning()
    const tokenHash = "b".repeat(64)
    await database.insert(authTokens).values({
      userId: user.id,
      tokenHash,
      purpose: "reset_password",
      expiresAt: new Date(Date.now() + 60_000),
    })

    const results = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        database.transaction((transaction) =>
          consumeAuthToken(
            tokenHash,
            "reset_password",
            new Date(),
            transaction as never
          )
        )
      )
    )

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1
    )
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(
      1
    )
  })
})

describe("Pomoder admin deletion", () => {
  it("deletes one or many records", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "hash",
      })
      .returning()
    const inserted = await database
      .insert(tasks)
      .values([
        { userId: member.id, title: "First", plannedDate: "2026-07-14" },
        { userId: member.id, title: "Second", plannedDate: "2026-07-14" },
      ])
      .returning()

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "delete_records",
        resource: "tasks",
        ids: inserted.map((task) => task.id),
      },
      database as unknown as PomoderDb
    )

    expect(await database.select().from(tasks)).toHaveLength(0)
    expect(await database.select().from(adminAuditLogs)).toMatchObject([
      {
        actorUserId: actor.id,
        action: "delete",
        resource: "tasks",
        recordIds: inserted.map((task) => task.id),
      },
    ])
  })

  it("does not allow an administrator to delete their own account", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()

    await expect(
      applyPomoderAdminAction(
        actor.id,
        { type: "delete_records", resource: "users", ids: [actor.id] },
        database as unknown as PomoderDb
      )
    ).rejects.toThrow("CANNOT_DELETE_SELF")
    expect(await database.select().from(users)).toHaveLength(1)
  })

  it("durably queues owned objects when media or its owner is deleted", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "hash",
      })
      .returning()
    await database.insert(mediaAssets).values({
      ownerUserId: member.id,
      kind: "image",
      source: "upload",
      status: "ready",
      name: "Owned",
      storageKey: `users/${member.id}/owned.png`,
      thumbnailKey: `users/${member.id}/thumb.png`,
      mimeType: "image/png",
      fileSize: 100,
    })

    await applyPomoderAdminAction(
      actor.id,
      { type: "delete_records", resource: "users", ids: [member.id] },
      database as unknown as PomoderDb
    )

    expect(
      (await database.select().from(storageDeletionJobs))
        .map((job) => job.storageKey)
        .sort()
    ).toEqual(
      [`users/${member.id}/owned.png`, `users/${member.id}/thumb.png`].sort()
    )
    const removed: string[] = []
    await processStorageDeletionJobs(
      database as unknown as PomoderDb,
      async (storageKey) => {
        removed.push(storageKey)
      }
    )
    expect(removed.sort()).toEqual(
      [`users/${member.id}/owned.png`, `users/${member.id}/thumb.png`].sort()
    )
    expect(await database.select().from(storageDeletionJobs)).toHaveLength(0)
  })

  it("retains failed storage deletion jobs for retry", async () => {
    await database
      .insert(storageDeletionJobs)
      .values({ storageKey: "curated/retry.png" })
    await processStorageDeletionJobs(
      database as unknown as PomoderDb,
      async () => {
        throw new Error("STORAGE_UNAVAILABLE")
      }
    )
    expect(await database.select().from(storageDeletionJobs)).toMatchObject([
      {
        storageKey: "curated/retry.png",
        attempts: 1,
        lastError: "STORAGE_UNAVAILABLE",
      },
    ])
  })

  it("queues the original object after a processed upload replaces it", async () => {
    const [member] = await database
      .insert(users)
      .values({
        email: "media-owner@example.com",
        name: "Media owner",
        passwordHash: "hash",
      })
      .returning()
    const [asset] = await database
      .insert(mediaAssets)
      .values({
        ownerUserId: member.id,
        kind: "video",
        source: "upload",
        status: "processing",
        name: "Original",
        storageKey: `users/${member.id}/original.mp4`,
        mimeType: "video/mp4",
        fileSize: 100,
      })
      .returning()
    const processedKey = `users/${member.id}/${asset.id}/processed.mp4`

    await finalizeProcessedUpload(
      asset,
      processedKey,
      "video/mp4",
      80,
      database as unknown as PomoderDb
    )

    expect((await database.select().from(mediaAssets))[0]).toMatchObject({
      storageKey: processedKey,
      status: "ready",
    })
    expect(await database.select().from(storageDeletionJobs)).toMatchObject([
      { storageKey: `users/${member.id}/original.mp4` },
    ])
  })
})

describe("Pomoder admin record management", () => {
  it("rejects updates for records that do not exist", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()

    await expect(
      applyPomoderAdminAction(
        actor.id,
        {
          type: "update_record",
          id: crypto.randomUUID(),
          record: {
            resource: "tasks",
            userId: actor.id,
            title: "Missing task",
            plannedDate: "2026-07-14",
            status: "active",
            pomodoroCount: 0,
          },
        },
        database as unknown as PomoderDb
      )
    ).rejects.toThrow("RECORD_NOT_FOUND")
    expect(await database.select().from(adminAuditLogs)).toHaveLength(0)
  })

  it("creates and edits a task", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "hash",
      })
      .returning()

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "create_record",
        record: {
          resource: "tasks",
          userId: member.id,
          title: "Admin task",
          plannedDate: "2026-07-14",
          status: "active",
          pomodoroCount: 1,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )

    const [created] = await database.select().from(tasks)
    expect(created).toMatchObject({
      title: "Admin task",
      status: "active",
      pomodoroCount: 1,
    })

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: created.id,
        record: {
          resource: "tasks",
          userId: member.id,
          title: "Updated task",
          plannedDate: "2026-07-15",
          status: "completed",
          pomodoroCount: 3,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )

    expect((await database.select().from(tasks))[0]).toMatchObject({
      title: "Updated task",
      plannedDate: "2026-07-15",
      status: "completed",
      pomodoroCount: 3,
    })
  })

  it("creates and edits a user", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "create_record",
        record: {
          resource: "users",
          email: "created@example.com",
          name: "Created",
          role: "user",
          verified: true,
          password: "password123",
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )

    const created = (await database.select().from(users)).find(
      (user) => user.email === "created@example.com"
    )!
    expect(created).toMatchObject({ name: "Created", role: "user" })
    expect(created.emailVerifiedAt).toBeInstanceOf(Date)

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: created.id,
        record: {
          resource: "users",
          email: "edited@example.com",
          name: "Edited",
          role: "admin",
          verified: false,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )

    expect(
      (await database.select().from(users)).find(
        (user) => user.id === created.id
      )
    ).toMatchObject({
      email: "edited@example.com",
      name: "Edited",
      role: "admin",
      emailVerifiedAt: null,
    })
  })

  it("revokes existing sessions only when an administrator changes a password", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "old-hash",
      })
      .returning()
    await database.insert(sessions).values({
      userId: member.id,
      tokenHash: "a".repeat(64),
      expiresAt: new Date("2026-08-14T00:00:00Z"),
    })

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: member.id,
        record: {
          resource: "users",
          email: member.email,
          name: member.name,
          role: "user",
          verified: false,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect(await database.select().from(sessions)).toHaveLength(1)

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: member.id,
        record: {
          resource: "users",
          email: member.email,
          name: member.name,
          role: "user",
          verified: false,
          password: "new-password",
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect(await database.select().from(sessions)).toHaveLength(0)
    expect(
      (await database.select().from(adminAuditLogs)).filter(
        (log) => log.action === "update"
      )
    ).toHaveLength(2)
  })

  it("creates and edits rooms and focus sessions", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "create_record",
        record: {
          resource: "rooms",
          hostUserId: actor.id,
          slug: "admin-room",
          name: "Admin room",
          visibility: "public",
          phase: "waiting",
          focusMinutes: 25,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          autoStart: false,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    const [room] = await database.select().from(rooms)
    expect(room.name).toBe("Admin room")

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: room.id,
        record: {
          resource: "rooms",
          hostUserId: actor.id,
          slug: "edited-room",
          name: "Edited room",
          visibility: "unlisted",
          phase: "waiting",
          focusMinutes: 50,
          shortBreakMinutes: 10,
          longBreakMinutes: 20,
          autoStart: true,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(rooms))[0]).toMatchObject({
      name: "Edited room",
      visibility: "unlisted",
      focusMinutes: 50,
      autoStart: true,
    })

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "create_record",
        record: {
          resource: "sessions",
          userId: actor.id,
          taskId: null,
          roomId: room.id,
          mode: "focus",
          status: "running",
          plannedSeconds: 1500,
          accumulatedSeconds: 0,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    const [session] = await database.select().from(focusSessions)
    expect(session).toMatchObject({ mode: "focus", plannedSeconds: 1500 })

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: session.id,
        record: {
          resource: "sessions",
          userId: actor.id,
          taskId: null,
          roomId: room.id,
          mode: "short",
          status: "completed",
          plannedSeconds: 300,
          accumulatedSeconds: 300,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(focusSessions))[0]).toMatchObject({
      mode: "short",
      status: "completed",
      accumulatedSeconds: 300,
    })
  })

  it("creates and edits media, billing, AI usage, and reports", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [room] = await database
      .insert(rooms)
      .values({
        hostUserId: actor.id,
        slug: "report-room",
        name: "Report room",
      })
      .returning()
    const records: PomoderAdminCreateRecord[] = [
      {
        resource: "media",
        ownerUserId: actor.id,
        kind: "audio",
        source: "curated",
        status: "ready",
        name: "Rain",
        storageKey: `users/${actor.id}/rain.mp3`,
        mimeType: "audio/mpeg",
        fileSize: 100,
        premium: false,
      },
      {
        resource: "billing",
        userId: actor.id,
        stripeCustomerId: "cus_admin",
        stripeSubscriptionId: "sub_admin",
        status: "active",
        priceId: "price_pro",
        currentPeriodEnd: "2026-08-14T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      {
        resource: "ai",
        userId: actor.id,
        month: "2026-07-01",
        kind: "background",
        reserved: 1,
        completed: 2,
        refunded: 0,
      },
      {
        resource: "reports",
        roomId: room.id,
        reporterUserId: actor.id,
        reason: "Admin review",
      },
    ]
    for (const record of records) {
      await applyPomoderAdminAction(
        actor.id,
        { type: "create_record", record } satisfies PomoderAdminAction,
        database as unknown as PomoderDb
      )
    }

    expect(await database.select().from(mediaAssets)).toHaveLength(1)
    expect(await database.select().from(subscriptions)).toHaveLength(1)
    expect(await database.select().from(generationUsage)).toHaveLength(1)
    expect(await database.select().from(roomReports)).toHaveLength(1)

    const [media] = await database.select().from(mediaAssets)
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: media.id,
        record: {
          resource: "media",
          status: "ready",
          name: "Heavy rain",
          mimeType: "audio/mpeg",
          fileSize: 200,
          premium: true,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(mediaAssets))[0]).toMatchObject({
      name: "Heavy rain",
      fileSize: 200,
      premium: true,
    })

    const [subscription] = await database.select().from(subscriptions)
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: subscription.id,
        record: {
          resource: "billing",
          userId: actor.id,
          stripeCustomerId: "cus_admin",
          stripeSubscriptionId: "sub_admin",
          status: "canceled",
          priceId: "price_pro",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: true,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(subscriptions))[0]).toMatchObject({
      status: "canceled",
      cancelAtPeriodEnd: true,
    })

    const [usage] = await database.select().from(generationUsage)
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: usage.id,
        record: {
          resource: "ai",
          userId: actor.id,
          month: "2026-07-01",
          kind: "background",
          reserved: 0,
          completed: 4,
          refunded: 1,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(generationUsage))[0]).toMatchObject({
      completed: 4,
      refunded: 1,
    })

    const [report] = await database.select().from(roomReports)
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: report.id,
        record: {
          resource: "reports",
          roomId: room.id,
          reporterUserId: actor.id,
          reason: "Updated review",
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(roomReports))[0].reason).toBe(
      "Updated review"
    )
  })

  it("rejects invalid create input at the admin API boundary", () => {
    expect(
      adminCreateActionSchema.safeParse({
        type: "create_record",
        record: {
          resource: "users",
          email: "not-an-email",
          name: "",
          role: "owner",
          verified: true,
          password: "short",
        },
      }).success
    ).toBe(false)
    expect(
      adminCreateActionSchema.safeParse({
        type: "create_record",
        record: {
          resource: "tasks",
          userId: "user",
          title: "",
          plannedDate: "not-a-date",
          status: "active",
          pomodoroCount: -1,
        },
      }).success
    ).toBe(false)
    expect(
      adminCreateActionSchema.safeParse({
        type: "create_record",
        record: {
          resource: "media",
          ownerUserId: "user-id",
          kind: "image",
          source: "upload",
          status: "ready",
          name: "Cross owner",
          storageKey: "users/another-user/private.png",
          mimeType: "image/png",
          fileSize: 1,
          premium: false,
        },
      }).success
    ).toBe(false)
  })

  it("paginates management records without a hidden 100-row ceiling", async () => {
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "hash",
      })
      .returning()
    await database.insert(tasks).values(
      Array.from({ length: 31 }, (_, index) => ({
        userId: member.id,
        title: `Task ${index + 1}`,
        plannedDate: "2026-07-14",
      }))
    )

    const result = await loadPomoderAdminData(
      { section: "tasks", page: 2, pageSize: 10 },
      database as unknown as PomoderDb
    )
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 31,
      totalPages: 4,
    })
    expect(result.tasks).toHaveLength(10)
    expect(result.lookups.tasks).toHaveLength(31)
  })

  it("sorts the full result set before applying pagination", async () => {
    const [member] = await database
      .insert(users)
      .values({
        email: "sort@example.com",
        name: "Sort",
        passwordHash: "hash",
      })
      .returning()
    await database.insert(tasks).values(
      Array.from({ length: 25 }, (_, index) => ({
        userId: member.id,
        title: `Task ${String.fromCharCode(65 + index)}`,
        plannedDate: "2026-07-14",
      }))
    )

    const result = await loadPomoderAdminData(
      {
        section: "tasks",
        page: 2,
        pageSize: 10,
        sortColumn: 1,
        sortDirection: "desc",
      },
      database as unknown as PomoderDb
    )

    expect(result.tasks.map(({ task }) => task.title)).toEqual([
      "Task O",
      "Task N",
      "Task M",
      "Task L",
      "Task K",
      "Task J",
      "Task I",
      "Task H",
      "Task G",
      "Task F",
    ])
  })
})
