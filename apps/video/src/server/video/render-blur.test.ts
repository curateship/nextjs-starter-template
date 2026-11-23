import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { ProjectTimeline } from "@/lib/video/timeline-schema"

/**
 * Real exports of a blur over one spot (blur.ts), measured in the finished
 * files: how much detail is left inside the box and outside it, whether an
 * oval leaves its corners sharp, whether a lane above stays sharp, and
 * whether a blur that follows something moves.
 *
 * Only the two things outside this machine are stood in for, as in
 * render-editor-features.test.ts: the media lookup and where each file is
 * read from.
 */

const sources = vi.hoisted(() => ({ files: new Map<string, string>() }))

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () =>
          [...sources.files.keys()].map((id) => ({
            id,
            userId: "owner",
            fileType: "video",
            storagePath: id,
          })),
      }),
    }),
  },
}))

// Where ffmpeg reads each file from: the file on this machine, in place of
// its storage address.
vi.mock("@/server/video/render-sources", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/video/render-sources")>()
  return {
    ...real,
    openRenderSource: async (media: { storagePath: string }) => ({
      input: sources.files.get(media.storagePath)!,
      release: async () => undefined,
    }),
  }
})

const { renderTimeline, renderTimelineStills } = await import("@/server/video/render")

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0

const FPS = 30
// The low quality frame of a tall project.
const WIDTH = 480
const HEIGHT = 854

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args], {
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr.toString())
  return result.stdout
}

/** One frame as grey levels, row by row, at the export's own size. */
function frameAt(file: string, seconds: number) {
  return ffmpeg([
    "-ss",
    String(seconds),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    `scale=${WIDTH}:${HEIGHT}`,
    "-pix_fmt",
    "gray",
    "-f",
    "rawvideo",
    "-",
  ])
}

/**
 * How much detail a box of the frame holds: the spread of its grey levels.
 * A sharp checkerboard is about 127; a well blurred one is near 0.
 */
function detail(
  frame: Buffer,
  box: { left: number; top: number; right: number; bottom: number }
) {
  const levels: number[] = []
  const x0 = Math.round(box.left * WIDTH)
  const x1 = Math.round(box.right * WIDTH)
  const y0 = Math.round(box.top * HEIGHT)
  const y1 = Math.round(box.bottom * HEIGHT)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) levels.push(frame[y * WIDTH + x])
  }
  const mean = levels.reduce((sum, level) => sum + level, 0) / levels.length
  return Math.sqrt(
    levels.reduce((sum, level) => sum + (level - mean) ** 2, 0) / levels.length
  )
}

/** How bright a box of the frame is on average, 0 to 255. */
function brightness(
  frame: Buffer,
  box: { left: number; top: number; right: number; bottom: number }
) {
  let total = 0
  let count = 0
  const x0 = Math.round(box.left * WIDTH)
  const x1 = Math.round(box.right * WIDTH)
  const y0 = Math.round(box.top * HEIGHT)
  const y1 = Math.round(box.bottom * HEIGHT)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      total += frame[y * WIDTH + x]
      count += 1
    }
  }
  return total / count
}

function clip(extra: Partial<Clip> & Pick<Clip, "id" | "kind">): Clip {
  return { name: extra.id, startMs: 0, durationMs: 2_000, trimStartMs: 0, ...extra }
}

// Every file the tests made. The stand-in library answers with every file it
// holds, so each export is handed only the ones its own clips name.
const library = new Map<string, string>()

async function render(dir: string, name: string, timeline: ProjectTimeline) {
  const named = new Set(
    timeline.tracks.flatMap((track) => track.clips.map((one) => one.mediaId))
  )
  sources.files.clear()
  for (const [id, file] of library) if (named.has(id)) sources.files.set(id, file)
  const result = await renderTimeline({
    userId: "owner",
    aspect: timeline.aspect,
    quality: "low",
    frameRate: FPS,
    normalizeLoudness: false,
    timeline,
  })
  const out = path.join(dir, `${name}.mp4`)
  await copyFile(result.filePath, out)
  await result.dispose()
  return out
}

describe.skipIf(!hasFfmpeg)("exports of a blur", () => {
  let dir = ""

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-blur-"))
    // A black and white checkerboard of 8-pixel squares: all detail.
    const checks = path.join(dir, "checks.mp4")
    ffmpeg([
      "-f", "lavfi", "-i", `nullsrc=s=${WIDTH}x${HEIGHT}:r=${FPS}:d=2`,
      "-vf", "geq=lum='if(mod(floor(X/8)+floor(Y/8),2),255,0)':cb=128:cr=128",
      "-c:v", "libx264", "-crf", "10", "-pix_fmt", "yuv420p", checks,
    ])
    library.set("checks", checks)
    // A small white square, for a picture on the lane above the blur.
    const square = path.join(dir, "square.png")
    ffmpeg(["-f", "lavfi", "-i", "color=c=white:s=64x64", "-frames:v", "1", square])
    library.set("square", square)
    // A white square crossing a black frame left to right over 2 seconds.
    const crossing = path.join(dir, "crossing.mp4")
    ffmpeg([
      "-f", "lavfi", "-i", `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=2`,
      "-f", "lavfi", "-i", "color=c=white:s=60x60",
      "-filter_complex", `[0][1]overlay=x='t*${(WIDTH - 60) / 2}':y=${HEIGHT / 2 - 30}:shortest=1`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", crossing,
    ])
    library.set("crossing", crossing)
  }, 60_000)

  afterAll(async () => {
    sources.files.clear()
    library.clear()
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  const under = { id: "under", muted: false, clips: [clip({ id: "c", kind: "video" as const, mediaId: "checks" })] }

  it("blurs the box and leaves the rest of the frame sharp", async () => {
    const out = await render(dir, "box", {
      aspect: "9:16",
      tracks: [
        { id: "blur", muted: false, clips: [clip({ id: "b", kind: "shape", shape: "blur", blurShape: "box", blurStrength: 20, x: 0.25, y: 0.25, toX: 0.75, toY: 0.5 })] },
        under,
      ],
    })
    const frame = frameAt(out, 1)
    expect(detail(frame, { left: 0.35, right: 0.65, top: 0.3, bottom: 0.45 })).toBeLessThan(20)
    expect(detail(frame, { left: 0.05, right: 0.2, top: 0.6, bottom: 0.8 })).toBeGreaterThan(90)
  }, 60_000)

  it("leaves an oval's corners sharp", async () => {
    const out = await render(dir, "oval", {
      aspect: "9:16",
      tracks: [
        { id: "blur", muted: false, clips: [clip({ id: "b", kind: "shape", shape: "blur", blurShape: "oval", blurStrength: 20, x: 0.2, y: 0.2, toX: 0.8, toY: 0.6 })] },
        under,
      ],
    })
    const frame = frameAt(out, 1)
    expect(detail(frame, { left: 0.45, right: 0.55, top: 0.37, bottom: 0.43 })).toBeLessThan(20)
    // The box's top-left corner lies outside the oval.
    expect(detail(frame, { left: 0.2, right: 0.26, top: 0.2, bottom: 0.23 })).toBeGreaterThan(90)
  }, 60_000)

  it("never blurs a lane above it", async () => {
    const out = await render(dir, "above", {
      aspect: "9:16",
      tracks: [
        { id: "top", muted: false, clips: [clip({ id: "s", kind: "image", mediaId: "square", scale: 0.2, x: 0.5, y: 0.375 })] },
        { id: "blur", muted: false, clips: [clip({ id: "b", kind: "shape", shape: "blur", blurStrength: 30, x: 0.1, y: 0.1, toX: 0.9, toY: 0.7 })] },
        under,
      ],
    })
    const frame = frameAt(out, 1)
    // The square is still pure white at its middle, so nothing softened it.
    expect(brightness(frame, { left: 0.48, right: 0.52, top: 0.37, bottom: 0.38 })).toBeGreaterThan(240)
  }, 60_000)

  it("only blurs while it is on", async () => {
    const out = await render(dir, "timing", {
      aspect: "9:16",
      tracks: [
        { id: "blur", muted: false, clips: [clip({ id: "b", kind: "shape", shape: "blur", startMs: 1_000, durationMs: 1_000, x: 0.25, y: 0.25, toX: 0.75, toY: 0.5 })] },
        under,
      ],
    })
    const spot = { left: 0.35, right: 0.65, top: 0.3, bottom: 0.45 }
    expect(detail(frameAt(out, 0.5), spot)).toBeGreaterThan(90)
    expect(detail(frameAt(out, 1.5), spot)).toBeLessThan(20)
  }, 60_000)

  it("moves a blur that follows something", async () => {
    const out = await render(dir, "follow", {
      aspect: "9:16",
      tracks: [
        {
          id: "blur",
          muted: false,
          clips: [
            clip({
              id: "b",
              kind: "shape",
              shape: "blur",
              x: 0.1,
              y: 0.1,
              toX: 0.3,
              toY: 0.2,
              blurTrack: [
                { atMs: 0, x: 0.2, y: 0.15 },
                { atMs: 2_000, x: 0.8, y: 0.15 },
              ],
            }),
          ],
        },
        under,
      ],
    })
    const left = { left: 0.14, right: 0.26, top: 0.11, bottom: 0.19 }
    const right = { left: 0.74, right: 0.86, top: 0.11, bottom: 0.19 }
    const early = frameAt(out, 0.05)
    const late = frameAt(out, 1.95)
    expect(detail(early, left)).toBeLessThan(25)
    expect(detail(early, right)).toBeGreaterThan(90)
    expect(detail(late, right)).toBeLessThan(25)
    expect(detail(late, left)).toBeGreaterThan(90)
  }, 60_000)

  it("draws small stills every half second for following", async () => {
    sources.files.clear()
    sources.files.set("crossing", library.get("crossing")!)
    const stills = await renderTimelineStills({
      userId: "owner",
      timeline: {
        aspect: "9:16",
        tracks: [{ id: "a", muted: false, clips: [clip({ id: "x", kind: "video", mediaId: "crossing" })] }],
      },
      fromMs: 0,
      toMs: 2_000,
      everyMs: 500,
      maxSide: 384,
    })
    expect(stills).toHaveLength(4)
    // Where the square is across each still: further right every time.
    const across = stills.map((bytes, index) => {
      const file = path.join(dir, `still-${index}.jpg`)
      writeFileSync(file, bytes)
      const frame = ffmpeg(["-i", file, "-vf", `scale=${WIDTH}:${HEIGHT}`, "-pix_fmt", "gray", "-f", "rawvideo", "-"])
      const row = Math.round(HEIGHT / 2) * WIDTH
      let total = 0
      let count = 0
      for (let x = 0; x < WIDTH; x++) {
        if (frame[row + x] > 128) {
          total += x
          count += 1
        }
      }
      return total / count
    })
    for (let index = 1; index < across.length; index++) {
      expect(across[index]).toBeGreaterThan(across[index - 1] + 40)
    }
  }, 60_000)
})
