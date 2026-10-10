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

import { type CustomShellDb } from "@/server/db"
import { forgetAppSettings, saveAppSetting } from "@/server/pomodoro/app-settings"
import {
  processNextMemberImport,
  requestMemberImports,
} from "@/server/pomodoro/member-imports"
import { savePixabayKey } from "@/server/pomodoro/pixabay-key"
import {
  pomodoroMediaUploads,
  pomodoroMemberImports,
  pomodoroSimulatedAccounts,
} from "@/server/pomodoro/schema"
import { giveMadeUpMembersFiles } from "@/server/pomodoro/simulated-shares"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * A member's Pixabay links (task 06, part 8) against a real database, with
 * Pixabay's answers stubbed at `fetch`, so no key is spent and no request
 * leaves the machine.
 */

let client: PGlite
let db: CustomShellDb
let member: string

const PHOTO = "https://pixabay.com/photos/forest-fog-trees-195893/"
const FILM = "https://pixabay.com/videos/rain-window-28470/"
const MUSIC = "https://pixabay.com/music/lofi-lofi-chill-vlog-beats-573883/"
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetAppSettings()
  vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "test-secret")
  await insertWorkspace(db)
  // An admin reads as paid, which is the Pro an import needs.
  member = (await insertUser(db, { role: "admin" })).id
  await savePixabayKey({ key: "12345678-0123456789abcdefabcdefab", actorUserId: member })
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await client.close()
})

function stubPixabay(answers: Record<string, { json?: unknown; bytes?: Uint8Array; status?: number }>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input)
    const match = Object.keys(answers).find((part) => url.includes(part))
    if (!match) throw new Error(`unexpected request ${url}`)
    const answer = answers[match]
    const body: BodyInit = answer.bytes
      ? new Uint8Array(answer.bytes)
      : JSON.stringify(answer.json ?? "")
    return new Response(body, { status: answer.status ?? 200 })
  })
}

describe("requestMemberImports", () => {
  it("queues pictures and films, and says why music is refused", async () => {
    const result = await requestMemberImports(member, [PHOTO, MUSIC, FILM, PHOTO])
    expect(result.added).toBe(2)
    expect(result.refused.map((refusal) => refusal.line)).toEqual([2, 4])
    expect(result.refused[0].reason).toContain("Download it on Pixabay")
    expect(result.refused[1].reason).toBe("is the same item as a line above")
  })

  it("holds a member to the daily limit from App settings", async () => {
    await saveAppSetting({ key: "uploads.pixabayDailyLimit", value: 1, actorUserId: member })
    forgetAppSettings()
    const first = await requestMemberImports(member, [PHOTO, FILM])
    expect(first.added).toBe(1)
    expect(first.refused).toEqual([{ line: 2, reason: "is over today's limit of 1" }])
    const second = await requestMemberImports(member, [FILM])
    expect(second.added).toBe(0)
  })

  it("refuses a free account", async () => {
    const free = (await insertUser(db)).id
    await expect(requestMemberImports(free, [PHOTO])).rejects.toThrow("PRO_REQUIRED")
  })
})

describe("processNextMemberImport", () => {
  it("makes the picture the member's own upload, credited to its author", async () => {
    await requestMemberImports(member, [PHOTO])
    stubPixabay({
      "api/?key": {
        json: {
          hits: [
            {
              user: "Hans",
              pageURL: PHOTO,
              tags: "forest, Fog",
              largeImageURL: "https://pixabay.com/get/abc_1280.jpg",
            },
          ],
        },
      },
      "get/abc_1280.jpg": { bytes: JPEG },
    })

    expect(await processNextMemberImport()).toBe(true)

    const [job] = await db.select().from(pomodoroMemberImports)
    expect(job.status).toBe("ready")
    const [upload] = await db
      .select()
      .from(pomodoroMediaUploads)
      .where(eq(pomodoroMediaUploads.mediaId, job.mediaId!))
    expect(upload.userId).toBe(member)
    expect(upload.purpose).toBe("background")
    expect(upload.status).toBe("ready")
    expect(upload.name).toBe("Forest fog trees")
    expect(upload.tags).toEqual(["forest", "fog"])
    expect(upload.sourceAuthor).toBe("Hans")
    expect(upload.sourcePageUrl).toBe(PHOTO)
  })

  it("says so on the row when Pixabay has no such item", async () => {
    await requestMemberImports(member, [PHOTO])
    stubPixabay({ "api/?key": { json: { hits: [] } } })
    await processNextMemberImport()
    const [job] = await db.select().from(pomodoroMemberImports)
    expect(job.status).toBe("failed")
    expect(job.failureReason).toBe("Pixabay has no item at that link.")
  })

  it("puts a throttled import back without using up a try", async () => {
    await requestMemberImports(member, [PHOTO])
    stubPixabay({ "api/?key": { status: 429 } })
    await processNextMemberImport()
    const [job] = await db.select().from(pomodoroMemberImports)
    expect(job.status).toBe("queued")
    expect(job.attempts).toBe(0)
  })

  it("does nothing when nothing waits", async () => {
    expect(await processNextMemberImport()).toBe(false)
  })
})

describe("giveMadeUpMembersFiles", () => {
  it("hands each link to a made-up member and shares the file at once", async () => {
    const madeUp = (await insertUser(db)).id
    await db
      .insert(pomodoroSimulatedAccounts)
      .values({ userId: madeUp, habits: {} as never, personality: "quiet" })

    const result = await giveMadeUpMembersFiles({ links: [PHOTO, MUSIC], actorUserId: member })
    expect(result.added).toBe(1)
    expect(result.refused.map((refusal) => refusal.line)).toEqual([2])

    stubPixabay({
      "api/?key": {
        json: {
          hits: [
            {
              user: "Hans",
              pageURL: PHOTO,
              tags: "forest, Fog",
              largeImageURL: "https://pixabay.com/get/abc_1280.jpg",
            },
          ],
        },
      },
      "get/abc_1280.jpg": { bytes: JPEG },
    })
    // A made-up account is not Pro and does not need to be.
    expect(await processNextMemberImport()).toBe(true)
    const [upload] = await db
      .select()
      .from(pomodoroMediaUploads)
      .where(eq(pomodoroMediaUploads.userId, madeUp))
    expect(upload).toMatchObject({ shared: true, shareWaitingSince: null, sourceAuthor: "Hans" })
    expect(upload.shareConfirmedAt).not.toBeNull()
  })
})
