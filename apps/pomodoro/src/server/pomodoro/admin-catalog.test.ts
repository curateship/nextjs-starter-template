import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
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
import { deleteFromR2 } from "@/server/media/storage"
import {
  CATALOG_MAX_ATTEMPTS,
  claimNextCatalogFile,
  createCatalogDrafts,
  deleteAdminCatalogItems,
  failCatalogFile,
  findThemeNeedingMiddleStill,
  finishCatalogFile,
  listAdminCatalog,
  MIDDLE_STILL_PREFIX,
  setThemeMiddleStill,
  reorderAdminCatalog,
  saveAdminCatalogItem,
  setAdminCatalogLocked,
  setAdminCatalogStatus,
  type CatalogItemInput,
} from "@/server/pomodoro/admin-catalog"
import { forgetMediaCatalog, loadMediaCatalog } from "@/server/pomodoro/catalog"
import { savePersonalSound } from "@/server/pomodoro/personal-room"
import {
  pomodoroAuditLogs,
  pomodoroCatalogItems,
  pomodoroPersonalRooms,
} from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The catalogue against a real database: the sixteen built-in items the
 * migration copied in, what members see, and every change an admin makes.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetMediaCatalog()
})

afterEach(async () => {
  await client.close()
})

const SOURCE = "pomodoro-catalog/sources/0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10.mp3"

function soundInput(overrides: Partial<CatalogItemInput> = {}): CatalogItemInput {
  return {
    label: "Rain on a tin roof",
    hint: "Patter and drips",
    descriptor: "ambient",
    locked: false,
    status: "draft",
    tags: [" Rain ", "night", "rain"],
    volume: 80,
    artist: null,
    sourceUrl: null,
    licence: "bought",
    licenceNote: null,
    source: { path: SOURCE, kind: "audio" },
    ...overrides,
  }
}

async function itemByKey(kind: "theme" | "sound", key: string) {
  const [row] = await db
    .select()
    .from(pomodoroCatalogItems)
    .where(and(eq(pomodoroCatalogItems.kind, kind), eq(pomodoroCatalogItems.key, key)))
  return row
}

describe("the built-in items", () => {
  it("are all in the catalogue with their old keys, files and prices", async () => {
    const catalog = await loadMediaCatalog(db)
    expect(catalog.themes.map((theme) => theme.key)).toEqual([
      "lofi", "ambient", "plain", "stars", "rain", "forest", "ocean", "fireplace",
    ])
    expect(catalog.sounds.map((sound) => sound.key)).toEqual([
      "lofi", "rain", "cafe", "brown", "forest", "ocean", "fire", "piano",
    ])
    expect(catalog.themes[0]).toMatchObject({
      stillUrl: "/backgrounds/thumbs-lofi_girl.png",
      videoUrl: "/backgrounds/uploads-265816_small.mp4",
      locked: false,
    })
    expect(catalog.sounds.find((sound) => sound.key === "piano")).toMatchObject({
      fileUrl: "/sounds/audio-piano.mp3",
      locked: true,
      volume: 100,
    })
  })
})

describe("saving an item", () => {
  it("makes a key from the name, queues the file and keeps a Draft from members", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "sound",
      input: soundInput(),
      actorUserId: admin,
    })
    expect(saved).toMatchObject({
      key: "rain-on-a-tin-roof",
      tags: ["rain", "night"],
      status: "draft",
      fileStatus: "queued",
      publishedAt: null,
    })
    const catalog = await loadMediaCatalog(db)
    expect(catalog.sounds.some((sound) => sound.key === "rain-on-a-tin-roof")).toBe(false)
    const [log] = await db.select().from(pomodoroAuditLogs)
    expect(log).toMatchObject({ action: "catalog_create", resource: "catalog" })
  })

  it("never reuses a key, so a second item of the same name gets its own", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const first = await saveAdminCatalogItem({ id: null, kind: "sound", input: soundInput(), actorUserId: admin })
    const second = await saveAdminCatalogItem({ id: null, kind: "sound", input: soundInput(), actorUserId: admin })
    expect([first.key, second.key]).toEqual(["rain-on-a-tin-roof", "rain-on-a-tin-roof-2"])
  })

  it("makes a sound Live with no picture at all, because its card draws a waveform", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "sound",
      input: soundInput({ status: "live" }),
      actorUserId: admin,
    })
    expect(saved.status).toBe("live")
    expect(saved.pictureUrl).toBeNull()
  })

  it("still refuses to make a theme Live with no picture", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    await expect(
      saveAdminCatalogItem({
        id: null,
        kind: "theme",
        input: soundInput({ status: "live", descriptor: "static", source: null }),
        actorUserId: admin,
      })
    ).rejects.toThrow("CATALOG_NEEDS_PICTURE")
  })

  it("takes a theme's still from its film, never from the window", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const film = "pomodoro-catalog/sources/1c7d4e2f-9b5e-4d66-8f1f-3a7b2c8d0e21.mp4"
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "theme",
      input: soundInput({
        label: "Snowy cafe",
        descriptor: "video",
        volume: 100,
        source: { path: film, kind: "video" },
      }),
      actorUserId: admin,
    })
    // The film brings its own still once it is prepared.
    expect(saved.pictureUrl).toBeNull()

    const firstStill = { url: "https://files.test/middle-1.jpg", path: "pomodoro-catalog/themes/middle-1.jpg" }
    await finishCatalogFile({
      id: saved.id,
      sourcePath: film,
      fileUrl: "https://files.test/film-1.mp4",
      filePath: "pomodoro-catalog/themes/film-1.mp4",
      poster: firstStill,
      durationSeconds: null,
    })
    expect(await itemByKey("theme", saved.key)).toMatchObject({
      pictureUrl: firstStill.url,
      picturePath: firstStill.path,
    })

    // A second film replaces the still too, and the first still leaves the bucket.
    const secondFilm = "pomodoro-catalog/sources/2d8e5f3a-0c6f-4e77-9a2a-4b8c3d9e1f32.mp4"
    await saveAdminCatalogItem({
      id: saved.id,
      kind: "theme",
      input: soundInput({
        label: "Snowy cafe",
        descriptor: "video",
        volume: 100,
        source: { path: secondFilm, kind: "video" },
      }),
      actorUserId: admin,
    })
    // Saving with the window's empty picture field kept the still.
    expect((await itemByKey("theme", saved.key))?.pictureUrl).toBe(firstStill.url)
    vi.mocked(deleteFromR2).mockClear()
    await finishCatalogFile({
      id: saved.id,
      sourcePath: secondFilm,
      fileUrl: "https://files.test/film-2.mp4",
      filePath: "pomodoro-catalog/themes/film-2.mp4",
      poster: { url: "https://files.test/middle-2.jpg", path: "pomodoro-catalog/themes/middle-2.jpg" },
      durationSeconds: null,
    })
    expect((await itemByKey("theme", saved.key))?.pictureUrl).toBe("https://files.test/middle-2.jpg")
    const removed = vi.mocked(deleteFromR2).mock.calls.map(([path]) => path)
    expect(removed).toContain(firstStill.path)
    expect(removed).not.toContain("pomodoro-catalog/themes/middle-2.jpg")
  })

  it("catches up a theme whose still is an old first frame, and only that one", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    // Built-in themes keep their files under public/, so none needs catching up.
    expect(await findThemeNeedingMiddleStill([])).toBeNull()

    const film = "pomodoro-catalog/sources/3e9f6a4b-1d7a-4f88-8b3b-5c9d4e0f2a43.mp4"
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "theme",
      input: soundInput({ label: "Old film", descriptor: "video", volume: 100, source: { path: film, kind: "video" } }),
      actorUserId: admin,
    })
    // Finished the way it was before 9 Oct 2026, with a first-frame still.
    const oldStill = "pomodoro-catalog/themes/first-frame.jpg"
    await finishCatalogFile({
      id: saved.id,
      sourcePath: film,
      fileUrl: "https://files.test/old.mp4",
      filePath: "pomodoro-catalog/themes/old.mp4",
      poster: { url: `https://files.test/${oldStill}`, path: oldStill },
      durationSeconds: null,
    })
    const waiting = await findThemeNeedingMiddleStill([])
    expect(waiting).toEqual({ id: saved.id, filePath: "pomodoro-catalog/themes/old.mp4", picturePath: oldStill })
    expect(await findThemeNeedingMiddleStill([saved.id])).toBeNull()

    vi.mocked(deleteFromR2).mockClear()
    const middle = { url: "https://files.test/middle.jpg", path: `${MIDDLE_STILL_PREFIX}a.jpg` }
    expect(await setThemeMiddleStill({ ...waiting!, still: middle })).toBe(true)
    expect((await itemByKey("theme", saved.key))?.pictureUrl).toBe(middle.url)
    expect(vi.mocked(deleteFromR2).mock.calls.map(([path]) => path)).toEqual([oldStill])
    expect(await findThemeNeedingMiddleStill([])).toBeNull()

    // A second worker that read the same old still loses quietly and tidies up.
    vi.mocked(deleteFromR2).mockClear()
    const late = { url: "https://files.test/late.jpg", path: `${MIDDLE_STILL_PREFIX}b.jpg` }
    expect(await setThemeMiddleStill({ ...waiting!, still: late })).toBe(false)
    expect((await itemByKey("theme", saved.key))?.pictureUrl).toBe(middle.url)
    expect(vi.mocked(deleteFromR2).mock.calls.map(([path]) => path)).toEqual([late.path])
  })

  it("shows a Live sound to members once its file is finished, with the NEW date set", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "sound",
      input: soundInput({ status: "live" }),
      actorUserId: admin,
    })
    expect(saved.publishedAt).not.toBeNull()
    expect((await loadMediaCatalog(db)).sounds.some((sound) => sound.key === saved.key)).toBe(false)

    await finishCatalogFile({
      id: saved.id,
      sourcePath: SOURCE,
      fileUrl: "https://files.test/done.mp3",
      filePath: "pomodoro-catalog/sounds/done.mp3",
      poster: null,
      durationSeconds: 185,
    })
    forgetMediaCatalog()
    const sound = (await loadMediaCatalog(db)).sounds.find((item) => item.key === saved.key)
    expect(sound).toMatchObject({ fileUrl: "https://files.test/done.mp3", volume: 80 })
  })

  it("keeps the old file playing when a replacement is refused", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const rain = await itemByKey("sound", "rain")
    await saveAdminCatalogItem({
      id: rain!.id,
      kind: "sound",
      input: soundInput({ label: "Rain", status: "live" }),
      actorUserId: admin,
    })
    await failCatalogFile({ id: rain!.id, sourcePath: SOURCE, reason: "This sound is 0:48. Sounds need to run 2 to 5 minutes.", retry: false })
    forgetMediaCatalog()
    const after = await itemByKey("sound", "rain")
    expect(after).toMatchObject({ fileStatus: "failed", fileUrl: "/sounds/audio-rain.mp3" })
    expect(after!.fileError).toContain("0:48")
    expect((await loadMediaCatalog(db)).sounds.some((sound) => sound.key === "rain")).toBe(true)
  })
})

describe("what members can pick", () => {
  it("refuses a Draft sound and falls back once a picked one goes Draft", async () => {
    const member = (await insertUser(db)).id
    const admin = (await insertUser(db, { role: "admin" })).id
    await savePersonalSound(member, "curated:rain")
    const rain = await itemByKey("sound", "rain")

    await setAdminCatalogStatus({ ids: [rain!.id], status: "draft", actorUserId: admin })

    await expect(savePersonalSound(member, "curated:rain")).rejects.toThrow("UNKNOWN_SOUND")
    // The saved choice is left as it was, so it comes back if the sound does.
    const [room] = await db
      .select()
      .from(pomodoroPersonalRooms)
      .where(eq(pomodoroPersonalRooms.userId, member))
    expect(room.sound).toBe("curated:rain")
    expect((await loadMediaCatalog(db)).sounds.some((sound) => sound.key === "rain")).toBe(false)
  })
})

describe("changes over ticked rows", () => {
  it("counts what changed, what was already that way and what could not go Live", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const drafts = await createCatalogDrafts({
      kind: "sound",
      files: [{ name: "night_rain.mp3", path: SOURCE, kind: "audio", url: null }],
      actorUserId: admin,
    })
    const lofi = await itemByKey("sound", "lofi")

    const result = await setAdminCatalogStatus({
      ids: [lofi!.id, drafts[0]],
      status: "live",
      actorUserId: admin,
    })
    // The draft has no file and no picture yet, so it cannot go Live.
    expect(result).toEqual({ changed: [], same: [lofi!.id], skipped: [drafts[0]] })

    const priced = await setAdminCatalogLocked({ ids: [lofi!.id], locked: true, actorUserId: admin })
    expect(priced.changed).toEqual([lofi!.id])
    forgetMediaCatalog()
    expect((await loadMediaCatalog(db)).sounds.find((sound) => sound.key === "lofi")?.locked).toBe(true)
  })

  it("never gives a new sound a picture, saved or dropped", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({
      id: null,
      kind: "sound",
      input: soundInput({ label: "No picture" }),
      actorUserId: admin,
    })
    expect(saved.pictureUrl).toBeNull()
    const [id] = await createCatalogDrafts({
      kind: "sound",
      files: [{ name: "dropped.mp3", path: SOURCE, kind: "audio", url: null }],
      actorUserId: admin,
    })
    const [dropped] = await db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.id, id))
    expect(dropped.pictureUrl).toBeNull()
  })

  it("names a dropped file after itself and makes it a Draft", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const [id] = await createCatalogDrafts({
      kind: "sound",
      files: [{ name: "night_rain-long.mp3", path: SOURCE, kind: "audio", url: null }],
      actorUserId: admin,
    })
    const [row] = await db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.id, id))
    expect(row).toMatchObject({ label: "Night rain long", status: "draft", fileStatus: "queued" })
  })

  it("puts one kind in the dragged order", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const { rows } = await listAdminCatalog({
      kind: "theme",
      search: "",
      status: "all",
      access: "all",
      tag: null,
      sort: "position",
      direction: "asc",
      page: 1,
      pageSize: 25,
    })
    const reversed = rows.map((row) => row.id).reverse()
    await reorderAdminCatalog({ kind: "theme", ids: reversed, actorUserId: admin })
    forgetMediaCatalog()
    expect((await loadMediaCatalog(db)).themes[0].key).toBe("fireplace")
  })

  it("deletes items, removes their uploaded files and never touches the built-in ones", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const saved = await saveAdminCatalogItem({ id: null, kind: "sound", input: soundInput(), actorUserId: admin })
    const plain = await itemByKey("theme", "plain")
    vi.mocked(deleteFromR2).mockClear()

    const result = await deleteAdminCatalogItems({ ids: [saved.id, plain!.id], actorUserId: admin })

    expect(result.deleted.sort()).toEqual([saved.id, plain!.id].sort())
    expect(vi.mocked(deleteFromR2).mock.calls.map(([path]) => path)).toEqual([SOURCE])
  })

  it("counts who has each item, in personal rooms", async () => {
    const member = (await insertUser(db)).id
    await savePersonalSound(member, "curated:cafe")
    const { rows } = await listAdminCatalog({
      kind: "sound",
      search: "café",
      status: "all",
      access: "all",
      tag: null,
      sort: "position",
      direction: "asc",
      page: 1,
      pageSize: 25,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: "cafe", personalCount: 1, roomCount: 0 })
  })
})

describe("the worker", () => {
  it("fails a job whose worker died on its last attempt, rather than taking it again", async () => {
    const [item] = await db.select().from(pomodoroCatalogItems).limit(1)
    await db
      .update(pomodoroCatalogItems)
      .set({
        sourcePath: "pomodoro-catalog/sources/dead.mp4",
        sourceKind: "video",
        fileStatus: "processing",
        attempts: CATALOG_MAX_ATTEMPTS,
        claimedAt: new Date(Date.now() - 60 * 60_000),
      })
      .where(eq(pomodoroCatalogItems.id, item.id))

    expect(await claimNextCatalogFile()).toBeNull()
    const [after] = await db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.id, item.id))
    expect(after.fileStatus).toBe("failed")
    expect(after.fileError).toMatch(/stopped processing three times/)
  })
})
