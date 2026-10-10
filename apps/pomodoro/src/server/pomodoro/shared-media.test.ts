import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Files never really leave for the bucket in a test.
vi.mock("@/server/media/storage", () => ({
  deleteFromR2: vi.fn(async () => undefined),
  uploadToR2: vi.fn(async () => undefined),
  getPublicMediaUrl: vi.fn(async (path: string) => `https://files.test/${path}`),
  getFromR2: vi.fn(),
  R2StorageNotConfiguredError: class extends Error {},
}))

let workspaceId = ""
vi.mock("@/server/workspaces/for-request", () => ({
  workspaceIdForRequest: vi.fn(async () => workspaceId),
}))

// Every member here is Pro with 2 GB, and may play shared files unless a
// test says otherwise.
const sharedAllowed = { value: true }
vi.mock("@/server/pomodoro/entitlements", () => ({
  loadPomodoroEntitlements: vi.fn(async () => ({
    canUploadMedia: true,
    canUsePremiumMedia: true,
    canUseSharedMedia: sharedAllowed.value,
    storageLimitBytes: 2 * 1024 * 1024 * 1024,
  })),
}))

import { type CustomShellDb } from "@/server/db"
import { forgetAppSettings } from "@/server/pomodoro/app-settings"
import { blockAccount } from "@/server/pomodoro/blocks"
import {
  editPomodoroUpload,
  listPomodoroUploads,
  resolveUploadUrl,
  storePomodoroUpload,
} from "@/server/pomodoro/media-uploads"
import { moveUploadsToBin } from "@/server/pomodoro/upload-bin"
import {
  savePersonalBackground,
} from "@/server/pomodoro/personal-room"
import {
  listSharedMedia,
  loadSharedFilePage,
  setSharedMediaSaved,
} from "@/server/pomodoro/shared-media"
import {
  announceNewShares,
  sendWeeklyNotes,
} from "@/server/pomodoro/shared-media-notices"
import { customShellNotifications } from "@/server/schema"
import {
  pomodoroFollows,
  pomodoroMediaAdds,
  pomodoroPersonalRooms,
  pomodoroProfiles,
  pomodoroSettings,
} from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * Shared sounds and backgrounds (uploads-and-sharing task 03) against a real
 * database: the one rule for who sees a file, the lists, the heart, picking
 * someone else's file and the credit it carries.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  workspaceId = (await insertWorkspace(db)).id
  sharedAllowed.value = true
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

async function member(handle: string | null = null) {
  const user = await insertUser(db)
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    handle,
    profilePublic: handle !== null,
    showSharedMedia: handle !== null,
  })
  return user.id
}

function store(
  userId: string,
  name: string,
  { shared = true, tags = [] as string[], confirmRights = true } = {}
) {
  return storePomodoroUpload({
    userId,
    purpose: "background",
    file: { name: `${name}.png` },
    bytes: new Uint8Array([1, 2, 3]),
    detected: { kind: "image", mimeType: "image/png" },
    labels: { name, tags, shared, confirmRights, trim: null },
  })
}

async function everyone(viewerUserId: string | null, extra = {}) {
  const page = await listSharedMedia({
    viewerUserId,
    purpose: "background",
    ...extra,
  })
  return page.items.map((item) => item.name)
}

describe("sharing a file", () => {
  it("needs the right-to-share tick, and holds a first share for an admin", async () => {
    await rules({ dailyLimit: 10, approveFirst: true })
    const owner = await member("sarah")
    const stranger = await member()

    await expect(store(owner, "Rain", { confirmRights: false })).rejects.toThrow(
      "SHARE_NOT_CONFIRMED"
    )
    const waiting = await store(owner, "Rain")
    expect(waiting.shareState).toBe("waiting")
    expect(await everyone(stranger)).toEqual([])

    // An approved member's shares go straight out.
    await db
      .update(pomodoroProfiles)
      .set({ sharingApprovedAt: new Date() })
      .where(eq(pomodoroProfiles.userId, owner))
    const out = await store(owner, "Snow")
    expect(out.shareState).toBe("on")
    expect(await everyone(stranger)).toEqual(["Snow"])
  })

  it("stops at the daily limit, and unsharing never counts", async () => {
    await rules({ dailyLimit: 2, approveFirst: false })
    const owner = await member("sarah")
    const first = await store(owner, "One")
    await store(owner, "Two")
    await expect(store(owner, "Three")).rejects.toThrow("SHARE_DAILY_LIMIT:2")

    // Unsharing and sharing the same file again is still one share.
    await editPomodoroUpload(owner, first.mediaId, {
      name: "One",
      tags: [],
      shared: false,
    })
    await editPomodoroUpload(owner, first.mediaId, {
      name: "One",
      tags: [],
      shared: true,
      confirmRights: true,
    })
    const mine = await listPomodoroUploads(owner, "background")
    expect(mine.map((upload) => upload.shareState)).toEqual(["on", "on"])
  })
})

describe("who sees a shared file", () => {
  it("hides it across a block, once unshared and once in the bin", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const stranger = await member()
    const blocked = await member()
    await blockAccount(owner, blocked)
    const rain = await store(owner, "Rain", { tags: ["rain"] })
    await store(owner, "Private", { shared: false })
    const snow = await store(owner, "Snow", { tags: ["winter"] })

    expect(await everyone(stranger)).toEqual(["Snow", "Rain"])
    expect(await everyone(null)).toEqual(["Snow", "Rain"])
    expect(await everyone(blocked)).toEqual([])
    expect(await everyone(stranger, { search: "WINT" })).toEqual(["Snow"])
    expect(await everyone(stranger, { tag: "rain" })).toEqual(["Rain"])

    await editPomodoroUpload(owner, rain.mediaId, {
      name: "Rain",
      tags: ["rain"],
      shared: false,
    })
    await moveUploadsToBin(owner, [snow.mediaId])
    expect(await everyone(stranger)).toEqual([])
  })

  it("answers its own page only while everything about it is public", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const stranger = await member()
    const rain = await store(owner, "Rain")

    const page = await loadSharedFilePage("sarah", rain.mediaId, stranger)
    expect(page?.file.credit).toEqual({ handle: "sarah" })
    expect(await loadSharedFilePage("someone", rain.mediaId, stranger)).toBeNull()

    await blockAccount(stranger, owner)
    expect(await loadSharedFilePage("sarah", rain.mediaId, stranger)).toBeNull()

    await db
      .update(pomodoroProfiles)
      .set({ profilePublic: false })
      .where(eq(pomodoroProfiles.userId, owner))
    expect(await loadSharedFilePage("sarah", rain.mediaId, null)).toBeNull()
  })
})

describe("using someone else's file", () => {
  it("picks it with its credit, saves it, and falls back when unshared", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const stranger = await member()
    const rain = await store(owner, "Rain")
    const hidden = await store(owner, "Hidden", { shared: false })

    await expect(
      savePersonalBackground(stranger, `media:${hidden.mediaId}`)
    ).rejects.toThrow("UPLOAD_NOT_FOUND")
    await savePersonalBackground(stranger, `media:${rain.mediaId}`)
    expect(await resolveUploadUrl(stranger, rain.mediaId)).toMatchObject({
      name: "Rain",
      credit: { handle: "sarah" },
    })

    await setSharedMediaSaved(stranger, rain.mediaId, true)
    const saved = await listSharedMedia({
      viewerUserId: stranger,
      purpose: "background",
      scope: "saved",
    })
    expect(saved.items.map((item) => [item.name, item.saved])).toEqual([["Rain", true]])
    // Picking and saving it count once for the owner's weekly note.
    expect(await db.select().from(pomodoroMediaAdds)).toHaveLength(1)

    // With the owner's page off the credit names nobody.
    await db
      .update(pomodoroProfiles)
      .set({ profilePublic: false })
      .where(eq(pomodoroProfiles.userId, owner))
    expect((await resolveUploadUrl(stranger, rain.mediaId))?.credit).toEqual({
      handle: null,
    })

    await editPomodoroUpload(owner, rain.mediaId, {
      name: "Rain",
      tags: [],
      shared: false,
    })
    expect(await resolveUploadUrl(stranger, rain.mediaId)).toBeNull()
    const savedAfter = await listSharedMedia({
      viewerUserId: stranger,
      purpose: "background",
      scope: "saved",
    })
    expect(savedAfter.items).toEqual([])
  })

  it("refuses a plan without shared files", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const stranger = await member()
    const rain = await store(owner, "Rain")
    sharedAllowed.value = false
    await expect(
      savePersonalBackground(stranger, `media:${rain.mediaId}`)
    ).rejects.toThrow("SHARED_MEDIA_LOCKED")
  })

  it("shows a used-by count only from three rooms up", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const rain = await store(owner, "Rain")
    for (let index = 0; index < 3; index += 1) {
      const other = await member()
      await db
        .insert(pomodoroPersonalRooms)
        .values({ userId: other, background: `media:${rain.mediaId}` })
      const page = await listSharedMedia({
        viewerUserId: null,
        purpose: "background",
        sort: "most_used",
      })
      expect(page.items[0]?.usedBy).toBe(index + 1 >= 3 ? 3 : null)
    }
  })
})

describe("the bell", () => {
  async function followShares(follower: string, owner: string) {
    await db.insert(pomodoroFollows).values({ followerUserId: follower, followedUserId: owner })
  }

  async function sharingNotices(userId: string) {
    return db
      .select({
        message: customShellNotifications.message,
        readAt: customShellNotifications.readAt,
      })
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, userId))
  }

  it("tells followers once a day, folding later shares in while unread", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const follower = await member()
    await followShares(follower, owner)

    await store(owner, "Rain")
    expect(await announceNewShares()).toBe(1)
    expect((await sharingNotices(follower)).map((row) => row.message)).toEqual([
      "sarah shared a new background.",
    ])
    // Nothing new: nothing said.
    expect(await announceNewShares()).toBe(0)

    await store(owner, "Snow")
    await announceNewShares()
    expect((await sharingNotices(follower)).map((row) => row.message)).toEqual([
      "sarah shared 2 new files.",
    ])

    // Read today's notice, and a third share that day says nothing new.
    await db
      .update(customShellNotifications)
      .set({ readAt: new Date() })
      .where(eq(customShellNotifications.recipientUserId, follower))
    await store(owner, "Fog")
    await announceNewShares()
    expect(await sharingNotices(follower)).toHaveLength(1)
  })

  it("never tells followers again when one file's Share goes off and on", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const follower = await member()
    await followShares(follower, owner)
    const rain = await store(owner, "Rain")
    expect(await announceNewShares()).toBe(1)
    for (const shared of [false, true]) {
      await editPomodoroUpload(owner, rain.mediaId, {
        name: "Rain",
        tags: [],
        shared,
        confirmRights: shared,
      })
    }
    expect(await announceNewShares()).toBe(0)
    expect(await sharingNotices(follower)).toHaveLength(1)
  })

  it("waits for an admin's first check before telling anybody", async () => {
    await rules({ dailyLimit: 10, approveFirst: true })
    const owner = await member("sarah")
    const follower = await member()
    await followShares(follower, owner)
    await store(owner, "Rain")
    expect(await announceNewShares()).toBe(0)
    expect(await sharingNotices(follower)).toEqual([])
  })

  it("sends the Monday note once, naming the file most people added", async () => {
    await rules({ dailyLimit: 10, approveFirst: false })
    const owner = await member("sarah")
    const rain = await store(owner, "Rain")
    for (let index = 0; index < 3; index += 1) {
      const other = await member()
      await savePersonalBackground(other, `media:${rain.mediaId}`)
    }
    // Monday 12 Oct 2026, midday in the owner's UTC.
    const monday = new Date("2026-10-12T12:00:00Z")
    const tuesday = new Date("2026-10-13T12:00:00Z")
    expect(await sendWeeklyNotes(tuesday)).toBe(0)
    expect(await sendWeeklyNotes(monday)).toBe(1)
    expect(await sendWeeklyNotes(monday)).toBe(0)
    expect((await sharingNotices(owner)).map((row) => row.message)).toEqual([
      "Your Rain was added by 3 people this week.",
    ])
  })
})
