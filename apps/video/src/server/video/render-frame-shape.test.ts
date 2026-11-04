import { spawnSync } from "node:child_process"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { squareBox } from "@/lib/video/clip-frame-shape"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"

/**
 * Real exports of a round camera bubble (clip-frame-shape.ts), measured in
 * the finished files: a circle's corners show what is under it, its middle
 * shows the clip, a border is drawn just inside its edge, and rounded corners
 * cut less than a circle. A white clip sits over a black one, so every pixel
 * says which of the two it came from.
 *
 * As in render-blur.test.ts, only the media lookup and where each file is
 * read from are stood in for.
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

const { renderTimeline } = await import("@/server/video/render")

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0

const FPS = 30
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

function greyFrame(file: string, seconds: number) {
  return ffmpeg([
    "-ss", String(seconds), "-i", file, "-frames:v", "1",
    "-vf", `scale=${WIDTH}:${HEIGHT}`, "-pix_fmt", "gray", "-f", "rawvideo", "-",
  ])
}

function rgbFrame(file: string, seconds: number) {
  return ffmpeg([
    "-ss", String(seconds), "-i", file, "-frames:v", "1",
    "-vf", `scale=${WIDTH}:${HEIGHT}`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
  ])
}

const level = (frame: Buffer, x: number, y: number) =>
  frame[Math.round(y) * WIDTH + Math.round(x)]

function base(): Clip {
  return {
    id: "under",
    kind: "video",
    name: "Under",
    mediaId: "black",
    startMs: 0,
    durationMs: 1_000,
    trimStartMs: 0,
    sourceDurationMs: 2_000,
  }
}

// The corner box: 30% of the frame, middle at (0.7, 0.75), filled. A circle
// makes the box square: the frame's width by the frame's width.
function bubble(extra: Partial<Clip>): Clip {
  return {
    id: "bubble",
    kind: "video",
    name: "Bubble",
    mediaId: "white",
    startMs: 0,
    durationMs: 1_000,
    trimStartMs: 0,
    sourceDurationMs: 2_000,
    scale: 0.3,
    x: 0.7,
    y: 0.75,
    fit: "cover",
    ...extra,
  }
}

let dir = ""

async function render(name: string, top: Clip) {
  const timeline: ProjectTimeline = {
    aspect: "9:16",
    tracks: [
      { id: "top", muted: true, clips: [top] },
      { id: "bottom", muted: true, clips: [base()] },
    ],
  }
  const result = await renderTimeline({
    userId: "owner",
    aspect: "9:16",
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

beforeAll(async () => {
  if (!hasFfmpeg) return
  dir = await mkdtemp(path.join(tmpdir(), "render-frame-shape-"))
  for (const [id, colour] of [["white", "white"], ["black", "black"]] as const) {
    const file = path.join(dir, `${id}.mp4`)
    ffmpeg([
      "-f", "lavfi", "-i", `color=c=${colour}:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=2`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", file,
    ])
    sources.files.set(id, file)
  }
}, 60_000)

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe.skipIf(!hasFfmpeg)("a round camera bubble in an export", () => {
  // The square box: 0.3 of 480 = 144 pixels across, middle at (336, 640).
  const square = squareBox(WIDTH / HEIGHT)
  const side = 0.3 * WIDTH
  const middle = { x: 0.7 * WIDTH, y: 0.75 * HEIGHT }

  it("shows the clip in the middle of a circle and what is under it at the corners", async () => {
    const file = await render("circle", bubble({ ...square, frameShape: "circle" }))
    const frame = greyFrame(file, 0.5)
    expect(level(frame, middle.x, middle.y)).toBeGreaterThan(220)
    // Just inside the box's top-left corner, outside the circle.
    expect(level(frame, middle.x - side / 2 + 6, middle.y - side / 2 + 6)).toBeLessThan(40)
    // Just inside the circle at the top.
    expect(level(frame, middle.x, middle.y - side / 2 + 8)).toBeGreaterThan(200)
  }, 60_000)

  it("keeps a plain rectangle's corners", async () => {
    const file = await render("rectangle", bubble({ ...square }))
    const frame = greyFrame(file, 0.5)
    expect(level(frame, middle.x - side / 2 + 6, middle.y - side / 2 + 6)).toBeGreaterThan(200)
  }, 60_000)

  it("cuts a rounded corner less than a circle does", async () => {
    const file = await render(
      "rounded",
      bubble({ ...square, frameShape: "rounded", cornerRadius: 0.2 })
    )
    const frame = greyFrame(file, 0.5)
    // The very corner is cut away; a little in along the edge is not.
    expect(level(frame, middle.x - side / 2 + 2, middle.y - side / 2 + 2)).toBeLessThan(60)
    expect(level(frame, middle.x - side / 2 + 40, middle.y - side / 2 + 4)).toBeGreaterThan(200)
  }, 60_000)

  it("draws the border just inside the edge, in its colour", async () => {
    const file = await render(
      "border",
      bubble({ ...square, frameShape: "circle", borderColor: "#ff0000", borderWidth: 20 })
    )
    const frame = rgbFrame(file, 0.5)
    // 20 of 1080 is about 9 pixels on this 480-wide frame: 4 in from the top edge is ring.
    const at = (Math.round(middle.y - side / 2 + 4) * WIDTH + Math.round(middle.x)) * 3
    expect(frame[at]).toBeGreaterThan(180)
    expect(frame[at + 1]).toBeLessThan(80)
    const inside = (Math.round(middle.y) * WIDTH + Math.round(middle.x)) * 3
    expect(frame[inside + 1]).toBeGreaterThan(200)
  }, 60_000)

  it("draws no shape on a clip set to fit inside its box", async () => {
    const file = await render(
      "contain",
      bubble({ ...square, fit: "contain", frameShape: "circle" })
    )
    const frame = greyFrame(file, 0.5)
    // A tall clip fitted in the square box is 81 pixels wide. This spot is on
    // it, and outside where a circle would be: a circle would have cut it.
    expect(level(frame, middle.x - 36, middle.y - side / 2 + 4)).toBeGreaterThan(200)
  }, 60_000)
})

describe.skipIf(!hasFfmpeg)("a film look in an export", () => {
  it("goes through the LUT: faded film brings white down and lifts black", async () => {
    const file = await render("faded", {
      ...base(),
      id: "whole",
      mediaId: "white",
      look: "faded",
    })
    const frame = rgbFrame(file, 0.5)
    // White through faded film is 95% red and green and 93% blue: 242, 242, 237.
    const [r, g, b] = [frame[0], frame[1], frame[2]]
    expect(r).toBeGreaterThan(232)
    expect(r).toBeLessThan(250)
    expect(b).toBeLessThan(r)
    expect(g).toBeGreaterThan(232)
  }, 60_000)
})
