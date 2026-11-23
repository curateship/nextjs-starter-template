import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Files never really leave for the bucket in a test.
vi.mock("@/server/media/storage", () => ({
  deleteFromR2: vi.fn(async () => undefined),
  uploadToR2: vi.fn(async () => undefined),
  getPublicMediaUrl: vi.fn(async (path: string) => `https://files.test/${path}`),
  getFromR2: vi.fn(async () => ({
    Body: { transformToByteArray: async () => PNG_BYTES },
  })),
  R2StorageNotConfiguredError: class extends Error {},
}))

let workspaceId = ""
vi.mock("@/server/workspaces/for-request", () => ({
  workspaceIdForRequest: vi.fn(async () => workspaceId),
}))

vi.mock("@/server/pomodoro/entitlements", () => ({
  loadPomodoroEntitlements: vi.fn(async () => ({
    canUploadMedia: true,
    canUsePremiumMedia: true,
    canUseSharedMedia: true,
    storageLimitBytes: 2 * 1024 * 1024 * 1024,
  })),
}))

// The reports are limited by address; a test has no request.
vi.mock("@/server/auth/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }))
vi.mock("@/server/auth/origin", () => ({ requestIp: () => "127.0.0.1" }))

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
])

import { type CustomShellDb } from "@/server/db"
import { forgetAppSettings } from "@/server/pomodoro/app-settings"
import { blockAccount } from "@/server/pomodoro/blocks"
import {
  approveSharedFiles,
  copySharedFileToCatalogue,
  loadFeaturedSharedFile,
  setFeaturedSharedFile,
  unshareSharedFiles,
} from "@/server/pomodoro/admin-shared-media"
import {
  editPomodoroUpload,
  listPomodoroUploads,
  storePomodoroUpload,
} from "@/server/pomodoro/media-uploads"
import {
  assertRoomFileUsable,
  listSharedMedia,
  resolveRoomFiles,
  setSharedMediaSaved,
} from "@/server/pomodoro/shared-media"
import {
  reportCopyright,
  reportSharedFile,
} from "@/server/pomodoro/shared-media-reports"
import {
  pomodoroCatalogItems,
  pomodoroProfiles,
  pomodoroSettings,
  roomReports,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * The safe side of sharing (uploads-and-sharing tasks 04 and 05) against a
 * real database: the admin's take-down, approval, feature and copy into the
 * catalogue, reports, and which shared files a room may play.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  workspaceId = (await insertWorkspace(db)).id
  forgetAppSettings()
})

afterEach(async () => {
  await client.close()
})

async function rules(value: { dailyLimit: number; approveFirst: boolean }) {
  await db
    .insert(pomodoroSettings)
    .values({ key: "sharing.rules", value })
    .onConflictDoUpdate({ target: pomodoroSettings.key, set: { value } })
  forgetAppSettings()
}

async function member(handle: string | null = null, role: "member" | "admin" = "member") {
  const user = await insertUser(db, { role })
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    handle,
    profilePublic: handle !== null,
  })
  return user.id
}

function store(userId: string, name: string, purpose: "background" | "sound" = "background") {
  return storePomodoroUpload({
    userId,
    purpose,
    file: { name: purpose === "sound" ? `${name}.mp3` : `${name}.png` },
    bytes: PNG_BYTES,
    detected:
      purpose === "sound"
        ? { kind: "audio", mimeType: "audio/mpeg" }
        : { kind: "image", mimeType: "image/png" },
    labels: { name, tags: ["rain"], shared: true, confirmRights: true, trim: null },
    alreadyProcessed: true,
  })
}

async function noticesFor(userId: string) {
  return db
    .select({ message: customShellNotifications.message, detail: customShellNotifications.detail })
    .from(customShellNotifications)
    .where(eq(customShellNotifications.recipientUserId, userId))
}

describe("an admin and shared files", () => {
  it("unshares with a reason, tells the owner, and the owner cannot share again", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const admin = await member(null, "admin")
    const owner = await member("sarah")
    const rain = await store(owner, "Rain")

    const result = await unshareSharedFiles({
      mediaIds: [rain.mediaId],
      reason: "copyright",
      note: "a pop song",
      actorUserId: admin,
    })
    expect(result).toEqual({ done: [rain.mediaId], skipped: [] })
    expect(await noticesFor(owner)).toEqual([
      {
        message: "An admin stopped sharing Rain.",
        detail: "It copies someone else's work: a pop song",
      },
    ])
    const [mine] = await listPomodoroUploads(owner, "background")
    expect(mine.shareState).toBe("taken_down")
    await expect(
      editPomodoroUpload(owner, rain.mediaId, {
        name: "Rain",
        tags: [],
        shared: true,
        confirmRights: true,
      })
    ).rejects.toThrow("SHARE_TAKEN_DOWN")
    // A second take-down finds nothing shared.
    expect(
      await unshareSharedFiles({ mediaIds: [rain.mediaId], reason: "other", note: "", actorUserId: admin })
    ).toEqual({ done: [], skipped: [rain.mediaId] })
  })

  it("approves a first share, after which the member's shares go straight out", async () => {
    await rules({ dailyLimit: 10, approveFirst: true })
    const admin = await member(null, "admin")
    const owner = await member("sarah")
    const first = await store(owner, "Rain")
    expect(first.shareState).toBe("waiting")

    await approveSharedFiles({ mediaIds: [first.mediaId], actorUserId: admin })
    const second = await store(owner, "Snow")
    expect(second.shareState).toBe("on")
    const page = await listSharedMedia({ viewerUserId: null, purpose: "background" })
    expect(page.items.map((item) => item.name)).toEqual(["Snow", "Rain"])
    // An admin's own shares never wait.
    expect((await store(admin, "Fog")).shareState).toBe("on")
  })

  it("features one file at a time, and drops it once unshared", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const admin = await member(null, "admin")
    const owner = await member("sarah")
    const rain = await store(owner, "Rain")
    const snow = await store(owner, "Snow")

    await setFeaturedSharedFile({ mediaId: rain.mediaId, actorUserId: admin })
    await setFeaturedSharedFile({ mediaId: snow.mediaId, actorUserId: admin })
    expect((await loadFeaturedSharedFile())?.name).toBe("Snow")
    await editPomodoroUpload(owner, snow.mediaId, { name: "Snow", tags: [], shared: false })
    expect(await loadFeaturedSharedFile()).toBeNull()
  })

  it("copies a shared file into the catalogue as a Draft credited to its owner", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const admin = await member(null, "admin")
    const owner = await member("sarah")
    const rain = await store(owner, "Rain")
    const { id, kind } = await copySharedFileToCatalogue({ mediaId: rain.mediaId, actorUserId: admin })
    expect(kind).toBe("theme")
    const [item] = await db
      .select()
      .from(pomodoroCatalogItems)
      .where(eq(pomodoroCatalogItems.id, id))
    expect(item).toMatchObject({
      status: "draft",
      label: "Rain",
      artist: "@sarah",
      sourceUrl: `/u/sarah/files/${rain.mediaId}`,
      tags: ["rain"],
    })
  })
})

describe("reports", () => {
  it("files one report per member per file, and none for an unshared file", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const reader = await member()
    const rain = await store(owner, "Rain")

    await reportSharedFile({ mediaId: rain.mediaId, reason: "copyright", reporterUserId: reader })
    await reportSharedFile({ mediaId: rain.mediaId, reason: "broken", reporterUserId: reader })
    await reportSharedFile({ mediaId: rain.mediaId, reason: "broken", reporterUserId: owner })
    const rows = await db.select().from(roomReports)
    expect(rows.map((row) => [row.kind, row.reason, row.profileUserId])).toEqual([
      ["shared_file", "copyright", owner],
    ])
  })

  it("takes a copyright claim from outside, matched to the file it names", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const rain = await store(owner, "Rain")
    await reportCopyright({
      name: "Label Records",
      email: "legal@label.test",
      address: `https://pomoder.com/u/sarah/files/${rain.mediaId}?ref=x`,
      work: "Our single",
    })
    await reportCopyright({
      name: "Label Records",
      email: "legal@label.test",
      address: "https://example.test/nothing",
      work: "Something else",
    })
    const rows = await db.select().from(roomReports)
    expect(rows.map((row) => [row.kind, row.mediaId, row.contactEmail])).toEqual([
      ["copyright", rain.mediaId, "legal@label.test"],
      ["copyright", null, "legal@label.test"],
    ])
  })
})

describe("shared files in rooms", () => {
  it("takes the host's own shared file or one they saved, never another", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const host = await member("host")
    const owner = await member("sarah")
    const mine = await store(host, "Mine")
    const theirs = await store(owner, "Theirs")

    await assertRoomFileUsable(host, mine.mediaId, "background")
    await expect(assertRoomFileUsable(host, theirs.mediaId, "background")).rejects.toThrow(
      "ROOM_PAIR_REJECTED"
    )
    await setSharedMediaSaved(host, theirs.mediaId, true)
    await assertRoomFileUsable(host, theirs.mediaId, "background")
    await expect(assertRoomFileUsable(host, theirs.mediaId, "sound")).rejects.toThrow(
      "ROOM_PAIR_REJECTED"
    )
  })

  it("plays it with its credit, and stops for one viewer across a block", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const host = await member("host")
    const owner = await member("sarah")
    const viewer = await member()
    const blocked = await member()
    await blockAccount(owner, blocked)
    const theirs = await store(owner, "Theirs")
    await setSharedMediaSaved(host, theirs.mediaId, true)
    const pair = { sound: null, background: `media:${theirs.mediaId}` }

    expect((await resolveRoomFiles(viewer, host, pair)).background).toMatchObject({
      name: "Theirs",
      credit: { handle: "sarah" },
    })
    expect((await resolveRoomFiles(owner, host, pair)).background?.credit).toBeNull()
    expect((await resolveRoomFiles(blocked, host, pair)).background).toBeNull()

    // Unshared: gone for everybody on the next read.
    await editPomodoroUpload(owner, theirs.mediaId, { name: "Theirs", tags: [], shared: false })
    expect((await resolveRoomFiles(viewer, host, pair)).background).toBeNull()
  })
})
