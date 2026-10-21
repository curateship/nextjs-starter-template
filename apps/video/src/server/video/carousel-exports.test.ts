import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ONLY_FAILED_RETRY_MESSAGE, RENDER_NOT_FOUND_MESSAGE } from "@/lib/video/render"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  ensureCarouselExportPdf,
  keepCarouselExport,
  readCarouselExportSlide,
} from "@/server/video/carousel-exports"
import {
  createOwnedCarousel,
  deleteOwnedCarousels,
  getOwnedCarouselDetail,
  writeCarousel,
} from "@/server/video/carousels"
import {
  clearOutOldExports,
  previewExportClearOut,
} from "@/server/video/export-clear-out"
import {
  createOwnedExportShare,
  findSharedExport,
  readSharedExportView,
} from "@/server/video/export-shares"
import {
  deleteOwnedExports,
  listOwnedExports,
  setOwnedExportCover,
} from "@/server/video/exports"
import { createOwnedProject } from "@/server/video/projects"
import { retryRenderJob } from "@/server/video/render-queue"
import { videoRenderJobs } from "@/server/video/schema"

// A bucket in memory: uploads are kept, ranged reads slice them, and removals
// are recorded.
const bucket = vi.hoisted(() => ({
  files: new Map<string, { data: Uint8Array; type: string }>(),
  removed: [] as string[],
}))
vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async (path: string, data: Uint8Array, type: string) => {
    bucket.files.set(path, { data, type })
  },
  getFromR2: async (path: string, range?: string | null) => {
    const file = bucket.files.get(path)
    if (!file) throw new Error("NoSuchKey")
    const match = range ? /^bytes=(\d+)-(\d+)$/.exec(range) : null
    const data = match
      ? file.data.slice(Number(match[1]), Number(match[2]) + 1)
      : file.data
    return {
      ContentType: file.type,
      Body: {
        transformToByteArray: async () => data,
        transformToWebStream: () => new Blob([new Uint8Array(data)]).stream(),
      },
    }
  },
  r2ObjectExists: async (path: string) => bucket.files.has(path),
  deleteFromR2: async (path: string) => {
    bucket.files.delete(path)
    bucket.removed.push(path)
  },
}))

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]
const DAY_MS = 24 * 60 * 60 * 1000

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  bucket.files = new Map()
  bucket.removed = []
})

afterEach(async () => {
  await client.close()
})

/** A carousel of three slides, each the starter slide renamed, with a caption. */
async function carouselOfThree(name = "Spring tips") {
  const carousel = await createOwnedCarousel(user.id, name, database)
  const detail = await getOwnedCarouselDetail(user.id, carousel.id, database)
  const [starter] = detail.slides
  const slides = ["One", "Two", "Three"].map((title, index) => ({
    ...starter,
    id: `slide-${index + 1}`,
    title,
    items: starter.items.map((item) => ({
      ...item,
      id: `text-${index + 1}`,
      ...(item.type === "text" ? { text: `Slide ${title}` } : {}),
    })),
  }))
  await writeCarousel(
    user.id,
    carousel.id,
    {
      slides,
      format: "4:5",
      caption: "  Three spring tips #garden  ",
      expectedVersion: detail.version,
    },
    database
  )
  return carousel
}

function keep(carouselId: string) {
  return keepCarouselExport({ userId: user.id, carouselId, database })
}

describe("keeping a carousel export", () => {
  it("stores a ZIP of every slide and the caption, and lists it on Carousel exports", async () => {
    const carousel = await carouselOfThree()
    const kept = await keep(carousel.id)

    expect(kept).toMatchObject({
      kind: "carousel",
      project_id: null,
      carousel_id: carousel.id,
      carousel_name: "Spring tips",
      slide_count: 3,
      status: "ready",
      aspect: "4:5",
      width: 1080,
      height: 1350,
      title: "Spring tips",
      has_thumbnail: true,
    })

    const [row] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, kept.id))
    const zip = bucket.files.get(row.storagePath!)
    expect(zip?.type).toBe("application/zip")
    expect(row.fileSize).toBe(zip?.data.byteLength)
    expect(row.caption).toBe("Three spring tips #garden")
    expect(bucket.files.get(row.thumbnailStoragePath!)?.type).toBe("image/png")

    // Each recorded range is one whole PNG inside the ZIP, in slide order.
    expect(row.slideRanges).toHaveLength(3)
    for (const range of row.slideRanges!) {
      const bytes = zip!.data.slice(range.start, range.start + range.size)
      expect([...bytes.slice(0, 4)]).toEqual(PNG_SIGNATURE)
    }
    const text = new TextDecoder().decode(zip!.data)
    expect(text).toContain("slides/slide-01.png")
    expect(text).toContain("slides/slide-03.png")
    expect(text).toContain("caption.txt")
    expect(text).toContain("Three spring tips #garden\n")

    const list = await listOwnedExports({
      userId: user.id,
      kind: "carousel",
      database,
    })
    expect(list.exports.map((item) => item.id)).toEqual([kept.id])
    expect(list.exports[0].carousel_name).toBe("Spring tips")

    const byCaption = await listOwnedExports({
      userId: user.id,
      search: "#garden",
      kind: "carousel",
      database,
    })
    expect(byCaption.total).toBe(1)
  })

  it("puts the slides in the ZIP in the saved order", async () => {
    const carousel = await carouselOfThree()
    const before = await keep(carousel.id)

    // Slide 3 dragged to the front, then saved.
    const detail = await getOwnedCarouselDetail(user.id, carousel.id, database)
    const [first, second, third] = detail.slides
    await writeCarousel(
      user.id,
      carousel.id,
      {
        slides: [third, first, second],
        format: detail.format,
        caption: detail.caption,
        expectedVersion: detail.version,
      },
      database
    )
    const after = await keep(carousel.id)

    async function slide(exportId: string, index: number) {
      const [row] = await database
        .select()
        .from(videoRenderJobs)
        .where(eq(videoRenderJobs.id, exportId))
      return readCarouselExportSlide(row.storagePath!, row.slideRanges!, index)
    }
    expect(await slide(after.id, 0)).toEqual(await slide(before.id, 2))
    expect(await slide(after.id, 1)).toEqual(await slide(before.id, 0))
    expect(await slide(after.id, 0)).not.toEqual(await slide(before.id, 0))
  })

  it("refuses somebody else's carousel and leaves nothing in storage", async () => {
    const stranger = await insertUser(database)
    const theirs = await createOwnedCarousel(stranger.id, "Theirs", database)
    await expect(keep(theirs.id)).rejects.toThrow("Carousel not found.")
    expect(bucket.files.size).toBe(0)
  })

  it("is never retried and never takes a cover from a moment", async () => {
    const kept = await keep((await carouselOfThree()).id)
    await expect(retryRenderJob(user.id, kept.id, database)).rejects.toThrow(
      ONLY_FAILED_RETRY_MESSAGE
    )
    await expect(
      setOwnedExportCover({
        userId: user.id,
        exportId: kept.id,
        atMs: 0,
        database,
      })
    ).rejects.toThrow(RENDER_NOT_FOUND_MESSAGE)
  })

  it("stays when its carousel is deleted", async () => {
    const carousel = await carouselOfThree()
    const kept = await keep(carousel.id)
    await deleteOwnedCarousels(user.id, [carousel.id], database)

    const list = await listOwnedExports({
      userId: user.id,
      kind: "carousel",
      database,
    })
    expect(list.exports).toHaveLength(1)
    expect(list.exports[0]).toMatchObject({
      id: kept.id,
      carousel_id: null,
      carousel_name: null,
      slide_count: 3,
    })
    expect(bucket.removed).toEqual([])
  })
})

describe("sharing a carousel export", () => {
  it("opens its slides and caption with no account, slide by slide", async () => {
    const kept = await keep((await carouselOfThree()).id)
    const link = await createOwnedExportShare({
      userId: user.id,
      exportId: kept.id,
      expiresInDays: null,
      database,
    })

    expect(await readSharedExportView(link.token, database)).toEqual({
      kind: "carousel",
      title: "Spring tips",
      width: 1080,
      height: 1350,
      slide_count: 3,
      caption: "Three spring tips #garden",
    })

    const shared = await findSharedExport(link.token, database)
    expect(shared?.kind).toBe("carousel")
    const slide = await readCarouselExportSlide(
      shared!.storagePath,
      shared!.slideRanges,
      2
    )
    expect([...slide!.slice(0, 4)]).toEqual(PNG_SIGNATURE)
    // Past the last slide, before the first, or not a whole number: no slide.
    for (const index of [3, -1, 1.5, Number.NaN]) {
      expect(
        await readCarouselExportSlide(
          shared!.storagePath,
          shared!.slideRanges,
          index
        )
      ).toBeNull()
    }

    // Deleting the export takes the link with it.
    await deleteOwnedExports(user.id, [kept.id], database)
    expect(await findSharedExport(link.token, database)).toBeNull()
    expect(bucket.files.size).toBe(0)
  })
})

describe("clearing out carousel exports", () => {
  it("counts and deletes an old carousel export, file and cover", async () => {
    const kept = await keep((await carouselOfThree()).id)
    const [row] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, kept.id))
    const old = new Date(Date.now() - 400 * DAY_MS)
    await database
      .update(videoRenderJobs)
      .set({ finishedAt: old })
      .where(eq(videoRenderJobs.id, kept.id))

    const before = new Date(Date.now() - 180 * DAY_MS)
    const preview = await previewExportClearOut(
      user.id,
      before,
      database,
      "carousel"
    )
    expect(preview).toMatchObject({ exports: 1, bytes: row.fileSize })

    const result = await clearOutOldExports({
      userId: user.id,
      before,
      includeShared: false,
      kind: "carousel",
      database,
    })
    expect(result).toEqual({
      deleted: 1,
      bytes_freed: row.fileSize,
      failed: 0,
    })
    // The ZIP, its PDF beside it, and the cover.
    expect(bucket.removed.sort()).toEqual(
      [
        row.storagePath,
        row.storagePath?.replace(/\.zip$/, ".pdf"),
        row.thumbnailStoragePath,
      ].sort()
    )
    expect(
      (await listOwnedExports({ userId: user.id, kind: "carousel", database }))
        .total
    ).toBe(0)
  })
})

/** An old finished video export, the kind the Exports page lists. */
async function oldVideoExport() {
  const project = await createOwnedProject(user.id, "Client cut", database)
  const id = uuid()
  const at = new Date(Date.now() - 400 * DAY_MS)
  await database.insert(videoRenderJobs).values({
    id,
    userId: user.id,
    projectId: project.id,
    status: "ready",
    quality: "high",
    aspect: "9:16",
    storagePath: `video/exports/${user.id}/${id}.mp4`,
    fileSize: 1000,
    title: "Client cut",
    createdAt: at,
    updatedAt: now(),
    finishedAt: at,
  })
  return id
}

async function oldCarouselExport() {
  const kept = await keep((await carouselOfThree()).id)
  await database
    .update(videoRenderJobs)
    .set({ finishedAt: new Date(Date.now() - 400 * DAY_MS) })
    .where(eq(videoRenderJobs.id, kept.id))
  return kept.id
}

describe("each dashboard keeps to its own kind", () => {
  it("never lists the other kind, even when a search matches both", async () => {
    const video = await oldVideoExport()
    const carousel = await oldCarouselExport()

    const videos = await listOwnedExports({ userId: user.id, database })
    expect(videos.exports.map((item) => item.id)).toEqual([video])
    const carousels = await listOwnedExports({
      userId: user.id,
      kind: "carousel",
      database,
    })
    expect(carousels.exports.map((item) => item.id)).toEqual([carousel])

    // "i" is in both titles.
    for (const [kind, id] of [
      ["video", video],
      ["carousel", carousel],
    ] as const) {
      const found = await listOwnedExports({
        userId: user.id,
        search: "i",
        kind,
        database,
      })
      expect(found.exports.map((item) => item.id)).toEqual([id])
    }
  })

  it("clears out only the kind it was asked for", async () => {
    await oldVideoExport()
    const carousel = await oldCarouselExport()
    const before = new Date(Date.now() - 180 * DAY_MS)

    expect(await previewExportClearOut(user.id, before, database)).toMatchObject(
      { exports: 1, bytes: 1000 }
    )
    const videoResult = await clearOutOldExports({
      userId: user.id,
      before,
      includeShared: true,
      database,
    })
    expect(videoResult.deleted).toBe(1)
    const remaining = await database
      .select({ id: videoRenderJobs.id })
      .from(videoRenderJobs)
    expect(remaining.map((row) => row.id)).toEqual([carousel])

    await oldVideoExport()
    const carouselResult = await clearOutOldExports({
      userId: user.id,
      before,
      includeShared: true,
      kind: "carousel",
      database,
    })
    expect(carouselResult.deleted).toBe(1)
    const left = await database
      .select({ kind: videoRenderJobs.kind })
      .from(videoRenderJobs)
    expect(left).toEqual([{ kind: "video" }])
  })

  it("deletes only ids of its own kind", async () => {
    const video = await oldVideoExport()
    const carousel = await oldCarouselExport()
    const result = await deleteOwnedExports(
      user.id,
      [video, carousel],
      database,
      "carousel"
    )
    expect(result).toEqual({ deleted_ids: [carousel], failed_ids: [] })
    expect(
      (await listOwnedExports({ userId: user.id, database })).exports
    ).toHaveLength(1)
  })
})

describe("the PDF kept beside the ZIP", () => {
  it("keeps one page per slide at the slide's size", async () => {
    const kept = await keep((await carouselOfThree()).id)
    const [row] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, kept.id))
    const pdf = bucket.files.get(String(row.storagePath).replace(/\.zip$/, ".pdf"))
    expect(pdf?.type).toBe("application/pdf")
    const text = new TextDecoder("latin1").decode(pdf?.data)
    expect(text.startsWith("%PDF-1.4")).toBe(true)
    expect(text.match(/\/Type \/Page /g)).toHaveLength(3)
    expect(text).toContain("/MediaBox [0 0 1080 1350]")
    // Every object is where the cross-reference table says it is.
    const table = /xref\n0 (\d+)\n0000000000 65535 f \n((?:\d{10} 00000 n \n)+)/.exec(text)
    expect(table).not.toBeNull()
    const offsets = (table?.[2] ?? "").trim().split("\n").map((line) => Number(line.slice(0, 10)))
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + 12)).toMatch(new RegExp(`^${index + 1} 0 obj`))
    })
  })

  it("builds the PDF of an export kept before PDFs were, and keeps it", async () => {
    const kept = await keep((await carouselOfThree()).id)
    const [row] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, kept.id))
    const pdfPath = String(row.storagePath).replace(/\.zip$/, ".pdf")
    bucket.files.delete(pdfPath)
    expect(
      await ensureCarouselExportPdf(String(row.storagePath), row.slideRanges ?? [])
    ).toBe(pdfPath)
    const text = new TextDecoder("latin1").decode(bucket.files.get(pdfPath)?.data)
    expect(text.match(/\/Type \/Page /g)).toHaveLength(3)
  })
})

describe("a video slide", () => {
  const work = { dir: "" }

  beforeEach(async () => {
    work.dir = await mkdtemp(path.join(tmpdir(), "carousel-clip-test-"))
  })

  afterEach(async () => {
    await rm(work.dir, { recursive: true, force: true })
  })

  // A real one-second clip, 320 by 240, made by ffmpeg.
  async function testClip() {
    const file = path.join(work.dir, "clip.mp4")
    execFileSync("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x240:rate=10",
      "-t",
      "1",
      "-pix_fmt",
      "yuv420p",
      file,
    ])
    return new Uint8Array(await readFile(file))
  }

  it("exports as an MP4 the size of the slide, with the other slides as PNGs", async () => {
    const carousel = await carouselOfThree()
    const detail = await getOwnedCarouselDetail(user.id, carousel.id, database)
    const storagePath = `${user.id}/${uuid()}.mp4`
    bucket.files.set(storagePath, { data: await testClip(), type: "video/mp4" })
    const timestamp = now()
    const [media] = await database
      .insert(customShellMedia)
      .values({
        id: uuid(),
        workspaceId: (await insertWorkspace(database, { userId: user.id })).id,
        userId: user.id,
        filename: "clip.mp4",
        originalName: "clip.mp4",
        fileSize: 100,
        mimeType: "video/mp4",
        fileType: "video",
        storagePath,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
    const slides = detail.slides.map((slide, index) =>
      index === 1
        ? {
            ...slide,
            items: [
              {
                id: "clip",
                type: "video" as const,
                mediaId: media.id,
                url: "https://example.com/clip.mp4",
                fit: "cover" as const,
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                zIndex: 0,
              },
              ...slide.items,
            ],
          }
        : slide
    )
    await writeCarousel(
      user.id,
      carousel.id,
      { slides, format: "4:5", caption: "", expectedVersion: detail.version },
      database
    )

    const kept = await keep(carousel.id)
    const [row] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, kept.id))
    expect(row.slideRanges?.map((range) => range.type ?? "picture")).toEqual([
      "picture",
      "video",
      "picture",
    ])
    const clip = await readCarouselExportSlide(
      String(row.storagePath),
      row.slideRanges ?? [],
      1
    )
    const out = path.join(work.dir, "out.mp4")
    await writeFile(out, clip ?? new Uint8Array())
    const probe = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:format=duration",
        "-of",
        "json",
        out,
      ]).toString()
    ) as {
      streams: { width: number; height: number }[]
      format: { duration: string }
    }
    expect(probe.streams[0]).toMatchObject({ width: 1080, height: 1350 })
    expect(Number(probe.format.duration)).toBeCloseTo(1, 0)
    // The ZIP names the slide as a video.
    const zip = bucket.files.get(String(row.storagePath))?.data ?? new Uint8Array()
    expect(new TextDecoder("latin1").decode(zip)).toContain("slides/slide-02.mp4")
  })
})
