import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import type { CustomShellUser } from "@/server/schema"
import { createProject } from "@/server/social/projects"

import { acceptArrival, copyArrival, sweepArrivals, type ArrivalNote } from "./arrivals"
import { hello, sendStatus } from "./connect"
import { promoArchiveDrafts, promoArchiveItems, promoArchiveSlides, promoVideoLinks, type PromoVideoLinkRow } from "./schema"
import { copyIntoStore, PIECE_BYTES, type ArchiveStore } from "./store"
import { answerVideo, findVideoCaller, makeVideoKey, readVideoKey, VideoLinkRefusal } from "./video-link"

const VIDEO = "http://localhost:3016"

/** A bucket in memory, recording what was stored and what was removed. */
function memoryStore() {
  const files = new Map<string, Uint8Array>()
  const pieces = new Map<string, Uint8Array[]>()
  const removed: string[] = []
  const store: ArchiveStore = {
    put: async (path, bytes) => void files.set(path, bytes),
    startPieces: async (path) => {
      pieces.set(path, [])
      return `upload-${path}`
    },
    putPiece: async (path, _id, partNumber, bytes) => {
      pieces.get(path)![partNumber - 1] = bytes
      return `etag-${partNumber}`
    },
    finishPieces: async (path) => {
      const parts = pieces.get(path)!
      const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
      let at = 0
      for (const part of parts) {
        whole.set(part, at)
        at += part.byteLength
      }
      files.set(path, whole)
    },
    dropPieces: async (path) => void pieces.delete(path),
    remove: async (path) => {
      removed.push(path)
      files.delete(path)
    },
  }
  return { store, files, removed }
}

/** Answers each address with its bytes, and anything else with 404. */
function fakeFetch(bodies: Record<string, Uint8Array<ArrayBuffer> | number>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const body = bodies[url]
    if (body === undefined) return new Response("no", { status: 404 })
    if (typeof body === "number") return new Response("broken", { status: body })
    return new Response(body as Uint8Array<ArrayBuffer>)
  }) as unknown as typeof fetch
}

const bytes = (n: number, fill = 7): Uint8Array<ArrayBuffer> => new Uint8Array(n).fill(fill)

describe("the archive's arrivals from Video", () => {
  let client: PGlite
  let db: TestDatabase
  let user: CustomShellUser
  let link: PromoVideoLinkRow
  let projectId: string

  beforeEach(async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-key-for-the-archive"
    ;({ client, db } = await createTestDatabase())
    user = await insertUser(db, { role: "admin", name: "Tyler" })
    projectId = await createProject(user.id, "Launch week", db, ["instagram", "tiktok"])
    const key = await makeVideoKey(user.id, db)
    link = (await findVideoCaller(new Request("http://promo/x", { headers: { authorization: `Bearer ${key}` } }), db))!
    await hello(link, { videoUrl: `${VIDEO}/` }, db)
    ;[link] = await db.select().from(promoVideoLinks).where(eq(promoVideoLinks.userId, user.id))
  })

  afterEach(async () => {
    await client.close()
  })

  function note(overrides: Partial<ArrivalNote> = {}): ArrivalNote {
    return {
      sendId: "send-0000-1",
      projectId,
      kind: "video",
      title: "Launch video",
      description: "",
      caption: "Out now",
      aspect: "9:16",
      width: 1080,
      height: 1920,
      durationMs: 30_000,
      file: { url: `${VIDEO}/api/connect/promo/file/t?part=main`, mimeType: "video/mp4", size: 10 },
      cover: { url: `${VIDEO}/api/connect/promo/file/t?part=cover`, mimeType: "image/jpeg", size: 3 },
      slides: [],
      subtitles: "1\n00:00:00,000 --> 00:00:01,000\nHi\n",
      language: "",
      groupKey: "",
      videoExportId: "export-1",
      videoProjectId: "vp-1",
      videoProjectName: "Launch",
      videoEditUrl: `${VIDEO}/admin/video-editor/vp-1`,
      drafts: [],
      ...overrides,
    }
  }

  it("keeps the key only as a hash and its scrambled copy, and a new key ends the old one", async () => {
    const first = (await readVideoKey(user.id, db)).key!
    expect(first).toMatch(/^pv_/)
    const [row] = await db.select().from(promoVideoLinks)
    expect(row.keySecret).not.toContain(first)
    expect(row.videoUrl).toBe(VIDEO)
    const second = await makeVideoKey(user.id, db)
    const ask = (key: string) => findVideoCaller(new Request("http://promo/x", { headers: { authorization: `Bearer ${key}` } }), db)
    expect(await ask(first)).toBeNull()
    expect((await ask(second))?.userId).toBe(user.id)
  })

  it("refuses a wrong key with 401 and nothing more", async () => {
    const response = await answerVideo(
      new Request("http://promo/x", { headers: { authorization: "Bearer pv_wrongwrongwrongwrongwrongwrongwrongwrongwro" } }),
      null,
      async () => ({ secret: true }),
      db
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Promo does not know this key." })
  })

  it("makes one item for a send and copies its files into Promo's own storage", async () => {
    const answer = await acceptArrival(link, note(), db)
    expect(answer.status).toBe("copying")
    // The same send twice is the same item.
    expect((await acceptArrival(link, note(), db)).itemId).toBe(answer.itemId)

    const { store, files } = memoryStore()
    const tell = vi.fn(async () => ({}))
    const fetchImpl = fakeFetch({
      [`${VIDEO}/api/connect/promo/file/t?part=main`]: bytes(10),
      [`${VIDEO}/api/connect/promo/file/t?part=cover`]: bytes(3, 1),
    })
    expect(await copyArrival(answer.itemId, { db, store, fetchImpl, tell })).toBe("ready")

    const [item] = await db.select().from(promoArchiveItems)
    expect(item.status).toBe("ready")
    expect(item.storagePath).toBe(`promo/archive/${user.id}/${item.id}/main.mp4`)
    expect(item.coverPath).toBe(`promo/archive/${user.id}/${item.id}/cover.jpg`)
    expect(item.fileSize).toBe(13)
    expect(item.pending).toBeNull()
    expect(item.subtitles).toContain("Hi")
    expect(files.get(item.storagePath)?.byteLength).toBe(10)
    expect(tell).toHaveBeenCalledWith(user.id, expect.objectContaining({ type: "arrived", sendId: "send-0000-1", itemId: item.id }))
    expect(await sendStatus(link, "send-0000-1", db)).toMatchObject({ status: "ready", itemId: item.id })
    // A second run finds nothing to claim.
    expect(await copyArrival(answer.itemId, { db, store, fetchImpl, tell })).toBe("skipped")
  })

  it("refuses files from any address but the Video that pressed Test", async () => {
    const elsewhere = note({ file: { url: "http://169.254.169.254/latest", mimeType: "video/mp4", size: 1 } })
    await expect(acceptArrival(link, elsewhere, db)).rejects.toBeInstanceOf(VideoLinkRefusal)
    expect(await db.select().from(promoArchiveItems)).toHaveLength(0)
  })

  it("refuses another person's project", async () => {
    const other = await insertUser(db)
    const theirs = await createProject(other.id, "Not yours", db)
    await expect(acceptArrival(link, note({ projectId: theirs }), db)).rejects.toThrow("not there any more")
  })

  it("keeps nothing of a failed copy and tells Video why", async () => {
    const answer = await acceptArrival(link, note(), db)
    const { store, files, removed } = memoryStore()
    const tell = vi.fn(async () => ({}))
    // The video comes, the cover breaks.
    const fetchImpl = fakeFetch({
      [`${VIDEO}/api/connect/promo/file/t?part=main`]: bytes(10),
      [`${VIDEO}/api/connect/promo/file/t?part=cover`]: 502,
    })
    expect(await copyArrival(answer.itemId, { db, store, fetchImpl, tell })).toBe("failed")
    expect(await db.select().from(promoArchiveItems)).toHaveLength(0)
    expect(files.size).toBe(0)
    expect(removed).toEqual([`promo/archive/${user.id}/${answer.itemId}/main.mp4`])
    expect(tell).toHaveBeenCalledWith(user.id, expect.objectContaining({ type: "failed", sendId: "send-0000-1" }))
    expect(await sendStatus(link, "send-0000-1", db)).toEqual({ status: "gone" })
  })

  it("fails a file that arrives a different size than Video said", async () => {
    const answer = await acceptArrival(link, note({ cover: undefined }), db)
    const { store } = memoryStore()
    const fetchImpl = fakeFetch({ [`${VIDEO}/api/connect/promo/file/t?part=main`]: bytes(9) })
    expect(await copyArrival(answer.itemId, { db, store, fetchImpl, tell: async () => ({}) })).toBe("failed")
  })

  it("keeps a carousel's slides in order and leaves the drafts ticked in Video", async () => {
    const slide = (n: number) => ({ url: `${VIDEO}/f?slide=${n}`, mimeType: "image/png", size: 2, kind: "photo" as const })
    const answer = await acceptArrival(
      link,
      note({ kind: "carousel", file: undefined, cover: undefined, slides: [slide(0), slide(1), slide(2)], drafts: ["instagram", "tiktok"] }),
      db
    )
    const { store } = memoryStore()
    const fetchImpl = fakeFetch({ [`${VIDEO}/f?slide=0`]: bytes(2), [`${VIDEO}/f?slide=1`]: bytes(2), [`${VIDEO}/f?slide=2`]: bytes(2) })
    expect(await copyArrival(answer.itemId, { db, store, fetchImpl, tell: async () => ({}) })).toBe("ready")
    const slides = await db.select().from(promoArchiveSlides).orderBy(promoArchiveSlides.position)
    expect(slides.map((row) => row.storagePath.split("/").pop())).toEqual(["slide-01.png", "slide-02.png", "slide-03.png"])
    const drafts = await db.select().from(promoArchiveDrafts)
    expect(drafts.map((row) => row.network).sort()).toEqual(["instagram", "tiktok"])
  })

  it("puts a newer version on the old item, keeping its drafts, and deletes the old files", async () => {
    const { store, files, removed } = memoryStore()
    const first = await acceptArrival(link, note({ drafts: ["instagram"] }), db)
    await copyArrival(first.itemId, {
      db,
      store,
      fetchImpl: fakeFetch({ [`${VIDEO}/api/connect/promo/file/t?part=main`]: bytes(10), [`${VIDEO}/api/connect/promo/file/t?part=cover`]: bytes(3) }),
      tell: async () => ({}),
    })
    const newer = await acceptArrival(
      link,
      note({
        sendId: "send-0000-2",
        replaceItemId: first.itemId,
        title: "Launch video, cut 2",
        file: { url: `${VIDEO}/v2`, mimeType: "video/mp4", size: 4 },
        cover: undefined,
      }),
      db
    )
    expect(await copyArrival(newer.itemId, { db, store, fetchImpl: fakeFetch({ [`${VIDEO}/v2`]: bytes(4) }), tell: async () => ({}) })).toBe("ready")

    const items = await db.select().from(promoArchiveItems)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: first.itemId, title: "Launch video, cut 2", sendId: "send-0000-2", coverPath: "" })
    expect(files.get(items[0].storagePath)?.byteLength).toBe(4)
    expect(removed).toContain(`promo/archive/${user.id}/${first.itemId}/main.mp4`)
    expect(await db.select().from(promoArchiveDrafts)).toHaveLength(1)
    expect(await sendStatus(link, "send-0000-2", db)).toMatchObject({ status: "ready", itemId: first.itemId })
  })

  it("fails a copy that ran past its time", async () => {
    const answer = await acceptArrival(link, note(), db)
    await db.update(promoArchiveItems).set({ claimedAt: new Date("2020-01-01") }).where(eq(promoArchiveItems.id, answer.itemId))
    const tell = vi.fn(async () => ({}))
    await sweepArrivals({ db, store: memoryStore().store, tell })
    expect(await db.select().from(promoArchiveItems)).toHaveLength(0)
    expect(tell).toHaveBeenCalledWith(user.id, expect.objectContaining({ type: "failed" }))
  })
})

describe("copying a big file in pieces", () => {
  it("sends every piece but the last at one size and joins them in order", async () => {
    const { store, files } = memoryStore()
    const size = PIECE_BYTES * 2 + 5
    const body = new Uint8Array(size)
    for (let i = 0; i < size; i += 4096) body[i] = i % 251
    const sizes: number[] = []
    const watched: ArchiveStore = {
      ...store,
      putPiece: async (path, id, n, piece) => {
        sizes.push(piece.byteLength)
        return store.putPiece(path, id, n, piece)
      },
    }
    const stored = await copyIntoStore({ url: "http://v/f", mimeType: "video/mp4", expectedBytes: size }, "p", {
      store: watched,
      fetchImpl: fakeFetch({ "http://v/f": body }),
      maxBytes: size,
      timeoutMs: 10_000,
    })
    expect(stored).toBe(size)
    expect(sizes).toEqual([PIECE_BYTES, PIECE_BYTES, 5])
    // Compared as bytes: a deep equal walks 32 million numbers one by one.
    expect(Buffer.compare(Buffer.from(files.get("p")!), Buffer.from(body))).toBe(0)
  })

  it("stops a file bigger than allowed", async () => {
    const { store } = memoryStore()
    await expect(
      copyIntoStore({ url: "http://v/f", mimeType: "video/mp4", expectedBytes: 0 }, "p", {
        store,
        fetchImpl: fakeFetch({ "http://v/f": bytes(20) }),
        maxBytes: 10,
        timeoutMs: 10_000,
      })
    ).rejects.toThrow("bigger than Promo keeps")
  })
})
