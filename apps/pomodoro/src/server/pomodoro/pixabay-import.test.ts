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
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"
import {
  claimNextCatalogFile,
  saveAdminCatalogItem,
  setAdminCatalogStatus,
} from "@/server/pomodoro/admin-catalog"
import { loadAppSettings, forgetAppSettings } from "@/server/pomodoro/app-settings"
import { forgetMediaCatalog } from "@/server/pomodoro/catalog"
import { downloadPixabayFile } from "@/server/pomodoro/pixabay"
import { importFromPixabay } from "@/server/pomodoro/pixabay-import"
import {
  PIXABAY_KEY_SETTING,
  pixabayKeyStatus,
  readPixabayKey,
  savePixabayKey,
} from "@/server/pomodoro/pixabay-key"
import { processPixabayImports } from "@/server/pomodoro/pixabay-worker"
import {
  pomodoroAuditLogs,
  pomodoroCatalogItems,
  pomodoroSettings,
} from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * "Import from Pixabay" against a real database, with Pixabay's answers
 * stubbed at `fetch`, so no key is needed and no request leaves the machine.
 */

let client: PGlite
let db: CustomShellDb
let admin: string

const KEY = "12345678-0123456789abcdefabcdefab"
const PHOTO = "https://pixabay.com/photos/forest-fog-trees-195893/"
const FILM = "https://pixabay.com/videos/rain-window-28470/"
const MUSIC = "https://pixabay.com/music/lofi-lofi-chill-vlog-beats-573883/"

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...[..."ftypmp42"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0])

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetMediaCatalog()
  forgetAppSettings()
  vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "test-secret")
  admin = (await insertUser(db, { role: "admin" })).id
  vi.mocked(uploadToR2).mockClear()
  vi.mocked(deleteFromR2).mockClear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await client.close()
})

type Answer = { status?: number; json?: unknown; text?: string; bytes?: Uint8Array }

/** Pixabay as a table of answers, keyed by the part of the address that differs. */
function stubPixabay(answers: Record<string, Answer>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input)
    const match = Object.keys(answers).find((part) => url.includes(part))
    if (!match) throw new Error(`unexpected request ${url}`)
    const answer = answers[match]
    const body: BodyInit = answer.bytes
      ? new Uint8Array(answer.bytes)
      : (answer.text ?? (answer.json === undefined ? "" : JSON.stringify(answer.json)))
    return new Response(body, { status: answer.status ?? 200 })
  })
}

const IMAGE_HIT = {
  hits: [
    {
      user: "Hans",
      pageURL: PHOTO,
      tags: "forest, Fog, trees, a tag far too long to ever be a tag here",
      largeImageURL: "https://pixabay.com/get/abc_1280.jpg",
    },
  ],
}
const VIDEO_HIT = {
  hits: [
    {
      user: "Coverr",
      pageURL: FILM,
      tags: "rain",
      videos: {
        large: { url: "https://cdn.pixabay.com/video/large.mp4", size: 200 * 1024 * 1024 },
        medium: { url: "https://cdn.pixabay.com/video/medium.mp4", size: 9_000_000 },
      },
    },
  ],
}

async function rows() {
  return db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.licenceNote, "Pixabay Content Licence"))
}

async function row(id: string) {
  const [found] = await db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.id, id))
  return found
}

describe("the key", () => {
  it("is stored scrambled, shown only by its tail, and never sent with the settings", async () => {
    const status = await savePixabayKey({ key: KEY, actorUserId: admin })
    expect(status).toEqual({ configured: true, maskedTail: "••••efab", unreadable: false })

    const [stored] = await db.select().from(pomodoroSettings).where(eq(pomodoroSettings.key, PIXABAY_KEY_SETTING))
    expect(JSON.stringify(stored.value)).not.toContain(KEY)
    expect(await readPixabayKey()).toBe(KEY)
    expect(JSON.stringify(await loadAppSettings())).not.toContain(PIXABAY_KEY_SETTING)

    const audit = await db.select().from(pomodoroAuditLogs).where(eq(pomodoroAuditLogs.resource, "settings"))
    expect(audit.map((entry) => entry.recordIds)).toEqual([[PIXABAY_KEY_SETTING]])

    expect(await savePixabayKey({ key: null, actorUserId: admin })).toEqual({
      configured: false,
      maskedTail: null,
      unreadable: false,
    })
  })

  it("says so when the saved key can no longer be unscrambled", async () => {
    await savePixabayKey({ key: KEY, actorUserId: admin })
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a different secret")
    expect(await pixabayKeyStatus()).toEqual({ configured: false, maskedTail: null, unreadable: true })
  })
})

describe("importing a list", () => {
  it("makes one Draft per good link on Themes and names every refused line", async () => {
    await savePixabayKey({ key: KEY, actorUserId: admin })
    const first = await importFromPixabay({
      kind: "theme",
      links: [{ line: 1, url: PHOTO }],
      actorUserId: admin,
    })
    expect(first).toEqual({ added: 1, refused: [] })

    const result = await importFromPixabay({
      kind: "theme",
      links: [
        { line: 1, url: FILM },
        { line: 2, url: "https://pixabay.com/de/photos/wald-nebel-195893/" },
        { line: 3, url: MUSIC },
        { line: 4, url: "https://unsplash.com/photos/a-1/" },
        { line: 6, url: `${FILM}?ref=x` },
      ],
      actorUserId: admin,
    })
    expect(result).toEqual({
      added: 1,
      refused: [
        { line: 2, reason: "is already in the catalogue as Forest fog trees" },
        { line: 3, reason: "is a music link, paste it on Sounds" },
        { line: 4, reason: "is not a pixabay.com link" },
        { line: 6, reason: "repeats line 1" },
      ],
    })

    const made = await rows()
    expect(made.map((item) => [item.label, item.descriptor, item.fileStatus, item.sourceKind, item.importUrl, item.sourcePath])).toEqual([
      ["Forest fog trees", "static", "queued", "image", PHOTO, null],
      ["Rain window", "video", "queued", "video", FILM, null],
    ])
    expect(made[1]).toMatchObject({ status: "draft", licence: "free", sourceUrl: FILM })
    // The catalogue worker never sees a row with no upload waiting.
    expect(await claimNextCatalogFile()).toBeNull()

    const audit = await db.select().from(pomodoroAuditLogs).where(eq(pomodoroAuditLogs.action, "catalog_import"))
    expect(audit.map((entry) => entry.recordIds)).toEqual([[made[0].id], [made[1].id]])
  })

  it("needs the key on Themes, and makes a sound that waits for its file without one", async () => {
    await expect(
      importFromPixabay({ kind: "theme", links: [{ line: 1, url: PHOTO }], actorUserId: admin })
    ).rejects.toThrow("PIXABAY_KEY_MISSING")

    const fetchSpy = stubPixabay({})
    const result = await importFromPixabay({
      kind: "sound",
      links: [
        { line: 1, url: MUSIC },
        { line: 2, url: PHOTO },
      ],
      actorUserId: admin,
    })
    expect(result).toEqual({ added: 1, refused: [{ line: 2, reason: "is a photo, paste it on Themes" }] })
    expect(fetchSpy).not.toHaveBeenCalled()

    const [sound] = await rows()
    expect(sound).toMatchObject({
      kind: "sound",
      label: "Lofi chill vlog beats",
      descriptor: "music",
      fileStatus: "ready",
      fileUrl: null,
      importUrl: null,
      artist: null,
      sourceUrl: MUSIC,
      licence: "free",
    })
    expect(sound.pictureUrl).toMatch(/^\/sounds\/sounds-[a-z]+\.png$/)
    // Live waits for the file.
    expect(await setAdminCatalogStatus({ ids: [sound.id], status: "live", actorUserId: admin })).toMatchObject({
      skipped: [sound.id],
    })
  })
})

describe("the worker", () => {
  async function importOne(url: string) {
    await savePixabayKey({ key: KEY, actorUserId: admin })
    await importFromPixabay({ kind: "theme", links: [{ line: 1, url }], actorUserId: admin })
    const [made] = await rows()
    return made.id
  }

  it("makes a photo the theme's still with Pixabay's credits in one pass", async () => {
    const id = await importOne(PHOTO)
    const fetchSpy = stubPixabay({ "/api/?": { json: IMAGE_HIT }, "/get/": { bytes: JPEG } })

    await processPixabayImports()

    const done = await row(id)
    expect(done).toMatchObject({
      fileStatus: "ready",
      importUrl: null,
      sourceKind: null,
      artist: "Hans",
      sourceUrl: PHOTO,
      licence: "free",
      licenceNote: "Pixabay Content Licence",
      tags: ["forest", "fog", "trees"],
    })
    expect(done.picturePath).toMatch(/^pomodoro-catalog\/sources\/[0-9a-f-]+\.jpg$/)
    expect(done.pictureUrl).toBe(`https://files.test/${done.picturePath}`)
    // The key goes to Pixabay's API and nowhere else.
    const [apiUrl] = fetchSpy.mock.calls[0]
    expect(String(apiUrl)).toContain(`key=${KEY}`)
    expect(String(fetchSpy.mock.calls[1][0])).not.toContain(KEY)
  })

  it("hands a film to the catalogue worker, taking the size under the cap, with its tries reset", async () => {
    const id = await importOne(FILM)
    const fetchSpy = stubPixabay({ "/api/videos/": { json: VIDEO_HIT }, "medium.mp4": { bytes: MP4 } })

    await processPixabayImports()

    expect(String(fetchSpy.mock.calls[1][0])).toContain("medium.mp4")
    const handed = await row(id)
    expect(handed).toMatchObject({
      fileStatus: "queued",
      importUrl: null,
      sourceKind: "video",
      attempts: 0,
      artist: "Coverr",
    })
    expect(handed.sourcePath).toMatch(/\.mp4$/)
    expect((await claimNextCatalogFile())?.id).toBe(id)
  })

  it("refuses an item Pixabay does not have, without trying again", async () => {
    const id = await importOne(PHOTO)
    stubPixabay({ "/api/?": { json: { total: 0, totalHits: 0, hits: [] } } })
    await processPixabayImports()
    expect(await row(id)).toMatchObject({
      fileStatus: "failed",
      fileError: "Pixabay has no item 195893",
      importUrl: null,
    })
  })

  it("puts a throttled row back without using an attempt", async () => {
    const id = await importOne(PHOTO)
    const fetchSpy = stubPixabay({ "/api/?": { status: 429, text: "Too many requests" } })
    await processPixabayImports()
    // One ask, then the pass stops rather than hammering Pixabay.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(await row(id)).toMatchObject({ fileStatus: "queued", attempts: 0, importUrl: PHOTO })
  })

  it("stops at a refused key and says where to fix it", async () => {
    const id = await importOne(PHOTO)
    stubPixabay({
      "/api/?": { status: 400, text: "[ERROR 400] Invalid or missing API key (https://pixabay.com/api/docs/)." },
    })
    await processPixabayImports()
    expect(await row(id)).toMatchObject({
      fileStatus: "failed",
      fileError: "The Pixabay API key was refused. Check it in Settings → Pixabay.",
    })
  })

  it("tries a broken download once a pass, three times, then gives up", async () => {
    const id = await importOne(PHOTO)
    stubPixabay({ "/api/?": { json: IMAGE_HIT }, "/get/": { status: 500 } })
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await processPixabayImports()
    // One try per pass: a blip does not spend all three at once.
    expect(await row(id)).toMatchObject({ fileStatus: "queued", attempts: 1 })
    await processPixabayImports()
    await processPixabayImports()
    expect(await row(id)).toMatchObject({
      fileStatus: "failed",
      fileError: "Pixabay's file could not be fetched",
      attempts: 3,
    })
  })

  it("drops the fetch when the admin uploaded a file of their own meanwhile", async () => {
    const id = await importOne(FILM)
    const source = "pomodoro-catalog/sources/0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10.mp4"
    const item = await row(id)
    await saveAdminCatalogItem({
      id,
      kind: "theme",
      input: {
        label: item.label,
        hint: "",
        descriptor: "video",
        locked: false,
        status: "draft",
        pictureUrl: null,
        tags: [],
        volume: 100,
        artist: null,
        sourceUrl: item.sourceUrl,
        licence: "free",
        licenceNote: null,
        source: { path: source, kind: "video" },
      },
      actorUserId: admin,
    })
    const fetchSpy = stubPixabay({})
    await processPixabayImports()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await row(id)).toMatchObject({ importUrl: null, sourcePath: source, fileStatus: "queued" })
  })
})

describe("downloadPixabayFile", () => {
  it("refuses an address off Pixabay, and a redirect that leaves it", async () => {
    await expect(downloadPixabayFile("https://example.com/a.jpg", 100)).rejects.toThrow(
      "PIXABAY_DOWNLOAD_FAILED"
    )
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://example.com/a.jpg" } })
    )
    await expect(downloadPixabayFile("https://cdn.pixabay.com/a.jpg", 100)).rejects.toThrow(
      "PIXABAY_DOWNLOAD_FAILED"
    )
  })

  it("stops reading a file past its limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array(200)))
    await expect(downloadPixabayFile("https://cdn.pixabay.com/a.jpg", 100)).rejects.toThrow(
      "FILE_TOO_LARGE"
    )
  })
})
