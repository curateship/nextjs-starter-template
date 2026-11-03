import { spawnSync } from "node:child_process"
import { createReadStream } from "node:fs"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { ProjectTimeline } from "@/lib/video/timeline-schema"

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

/**
 * Exports and saved frames read a video straight from its storage address,
 * and fetch only the stretch they draw. Checked by serving a real file from
 * a small web server on this machine that answers range requests the way the
 * bucket does, and counting the bytes it sends.
 */

const stand = vi.hoisted(() => ({
  origin: "",
  media: [] as Record<string, unknown>[],
  proxies: [] as Record<string, unknown>[],
}))

vi.mock("@/server/db", async () => {
  const schema = await import("@/server/video/schema")
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            const rows = table === schema.videoMediaProxies ? stand.proxies : stand.media
            return Object.assign(Promise.resolve(rows), { limit: async () => rows })
          },
        }),
      }),
    },
  }
})
vi.mock("@/server/media/storage", () => ({
  getPublicMediaUrl: async (storagePath: string) => `${stand.origin}/${storagePath}`,
}))

const { renderTimeline, renderTimelineFrame } = await import("@/server/video/render")
const { openRenderSource } = await import("@/server/video/render-sources")

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0

describe("where an export reads a file from", () => {
  beforeEach(() => {
    stand.origin = "https://media.example.test"
    stand.proxies = []
  })

  it("reads a video from its storage address", async () => {
    const source = await openRenderSource(
      { id: "m1", storagePath: "u/beach.mov", fileType: "video", fileSize: 20 * 1024 ** 3 },
      { draft: false }
    )
    expect(source.input).toBe("https://media.example.test/u/beach.mov")
  })

  it("reads the smooth copy for a Small export once it is made", async () => {
    stand.proxies = [{ storagePath: "video/proxies/u/m1/lease.mp4", fileSize: 900 }]
    const draft = await openRenderSource(
      { id: "m1", storagePath: "u/beach.mov", fileType: "video", fileSize: 20 * 1024 ** 3 },
      { draft: true }
    )
    expect(draft.input).toBe("https://media.example.test/video/proxies/u/m1/lease.mp4")
  })

  it("reads the original for a Small export while there is no smooth copy", async () => {
    const draft = await openRenderSource(
      { id: "m1", storagePath: "u/beach.mov", fileType: "video", fileSize: 20 * 1024 ** 3 },
      { draft: true }
    )
    expect(draft.input).toBe("https://media.example.test/u/beach.mov")
  })
})

describe.skipIf(!hasFfmpeg)("how much of a video an export fetches", () => {
  let dir = ""
  let server: Server
  let video = ""
  let videoBytes = 0
  let served = 0

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-sources-"))
    process.env.VIDEO_FILE_CACHE_DIR = path.join(dir, "cache")
    globalThis.__videoFileCache = undefined
    // A minute of busy 720p picture with sound, a keyframe every second.
    video = path.join(dir, "minute.mp4")
    const made = spawnSync("ffmpeg", [
      "-v", "error",
      "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=60",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=60",
      "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "4M", "-g", "30",
      "-c:a", "aac", "-movflags", "+faststart", "-shortest", video,
    ])
    if (made.status !== 0) throw new Error(made.stderr.toString())
    videoBytes = (await stat(video)).size

    server = createServer((request, response) => {
      if (request.url?.includes("broken")) {
        response.writeHead(500)
        response.end()
        return
      }
      const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? "")
      const start = range ? Number(range[1]) : 0
      const end = range && range[2] ? Number(range[2]) : videoBytes - 1
      response.writeHead(range ? 206 : 200, {
        "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4",
        "Content-Length": end - start + 1,
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${videoBytes}` } : {}),
      })
      // Counted as it leaves, once the request is over: what was read off
      // disk ahead of the connection is not what was fetched.
      response.on("close", () => {
        served += response.socket?.bytesWritten ?? 0
      })
      createReadStream(video, { start, end }).pipe(response)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    stand.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    stand.media = [
      {
        id: "minute",
        userId: "owner",
        fileType: "video",
        fileSize: videoBytes,
        storagePath: "owner/minute.mp4",
      },
    ]
  }, 120_000)

  afterAll(async () => {
    server?.close()
    delete process.env.VIDEO_FILE_CACHE_DIR
    globalThis.__videoFileCache = undefined
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  function timeline(clip: Partial<Clip>) {
    return {
      aspect: "16:9" as const,
      tracks: [
        {
          id: "footage",
          muted: false,
          clips: [
            {
              id: "take",
              kind: "video" as const,
              name: "Take",
              mediaId: "minute",
              startMs: 0,
              durationMs: 5_000,
              trimStartMs: 40_000,
              ...clip,
            },
          ],
        },
      ],
    }
  }

  it("fetches about the five seconds a clip uses, not the minute", async () => {
    served = 0
    const result = await renderTimeline({
      userId: "owner",
      timeline: timeline({}),
      aspect: "16:9",
      quality: "medium",
      frameRate: 30,
      normalizeLoudness: false,
    })
    await result.dispose()
    // Five seconds of sixty is 8 out of 100 of the file. On top of that come
    // the file's index, read twice (the sound check and the render), and the
    // read-ahead: a few megabytes that stay the same however big the file
    // is. The local connection lets the server send some way ahead of what
    // ffmpeg reads, more on a busy machine. Measured 3 Nov 2026: 6.7MB of a
    // 30.8MB file.
    const clipShare = (5 / 60) * videoBytes
    expect(served).toBeGreaterThan(clipShare)
    expect(served - clipShare).toBeLessThan(10 * 1024 * 1024)
    expect(result.durationMs).toBe(5_000)
  }, 120_000)

  it("fetches a few frames' worth to save one frame", async () => {
    served = 0
    const jpeg = await renderTimelineFrame({
      userId: "owner",
      timeline: timeline({}),
      atMs: 2_500,
    })
    expect(jpeg.byteLength).toBeGreaterThan(0)
    // Measured 3 Nov 2026: 1.8MB, and 4.8MB on a busy machine, of the 30.8MB
    // file. Reading the whole file would be all 30.8MB.
    expect(served).toBeLessThan(8 * 1024 * 1024)
  }, 120_000)

  it("fails the export rather than drop a clip's sound when storage cannot be read", async () => {
    const working = stand.media
    stand.media = [{ ...working[0], storagePath: "owner/broken.mp4" }]
    try {
      await expect(
        renderTimeline({
          userId: "owner",
          timeline: timeline({}),
          aspect: "16:9",
          quality: "medium",
          frameRate: 30,
          normalizeLoudness: false,
        })
      ).rejects.toThrow("could not be read from storage")
    } finally {
      stand.media = working
    }
  }, 120_000)
})
