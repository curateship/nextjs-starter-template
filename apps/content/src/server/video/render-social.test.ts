import { spawnSync } from "node:child_process"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { ProjectTimeline } from "@/lib/video/timeline-schema"

/**
 * A real export of a Subscribe sticker (social-stickers.ts), measured in the
 * finished file: the button is red before the cursor presses it and grey
 * after, the round picture is drawn from the picture's bytes, and the name
 * comes out in the export's own font.
 *
 * Nothing in the timeline names a file, so the media lookup is never asked;
 * the sticker's picture lookup is stood in for with a plain green square.
 */

const GREEN_PNG = vi.hoisted(() => ({ uri: "" }))

vi.mock("@/server/db", () => ({ db: {} }))
vi.mock("@/server/video/social-pictures", () => ({
  loadSocialPictures: async (_userId: string, urls: string[]) =>
    new Map(urls.map((url) => [url, GREEN_PNG.uri])),
}))

const { renderTimeline } = await import("@/server/video/render")

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0

// The low quality frame of a tall project.
const WIDTH = 480
const HEIGHT = 854

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args], {
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr.toString())
  return result.stdout
}

/** One frame as RGB bytes, row by row. */
function frameAt(file: string, seconds: number) {
  return ffmpeg([
    "-ss",
    String(seconds),
    "-i",
    file,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ])
}

function pixel(frame: Buffer, x: number, y: number) {
  const at = (Math.round(y) * WIDTH + Math.round(x)) * 3
  return { r: frame[at], g: frame[at + 1], b: frame[at + 2] }
}

let dir: string
let exported: string

// The sticker's box is the Subscribe card's own shape, 80% of the width, so
// it is drawn at 384 / 760 of its own size from (48, 427).
const SCALE = 384 / 760
const LEFT = 48
const TOP = 427
const at = (x: number, y: number) => ({ x: LEFT + x * SCALE, y: TOP + y * SCALE })

beforeAll(async () => {
  if (!hasFfmpeg) return
  dir = await mkdtemp(path.join(tmpdir(), "render-social-"))
  const green = path.join(dir, "green.png")
  ffmpeg(["-f", "lavfi", "-i", "color=c=0x00ff00:s=64x64", "-frames:v", "1", green])
  const { readFile } = await import("node:fs/promises")
  GREEN_PNG.uri = `data:image/png;base64,${(await readFile(green)).toString("base64")}`

  const timeline: ProjectTimeline = {
    aspect: "9:16",
    tracks: [
      {
        id: "t1",
        muted: false,
        clips: [
          {
            id: "sub",
            kind: "shape",
            name: "Subscribe button",
            shape: "subscribe",
            socialPlatform: "youtube",
            socialName: "Tyler",
            pictureUrl: "https://media.example.com/me.png",
            animation: "none",
            x: 0.1,
            y: TOP / HEIGHT,
            toX: 0.9,
            toY: (TOP + 140 * SCALE) / HEIGHT,
            startMs: 0,
            durationMs: 3000,
            trimStartMs: 0,
          },
        ],
      },
    ],
  }
  const result = await renderTimeline({
    userId: "owner",
    timeline,
    aspect: "9:16",
    quality: "low",
    frameRate: 30,
    normalizeLoudness: false,
  })
  exported = path.join(dir, "out.mp4")
  await copyFile(result.filePath, exported)
  await result.dispose()
}, 120_000)

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe.skipIf(!hasFfmpeg)("a Subscribe sticker in an export", () => {
  it("is red before the press and grey after it", () => {
    // The button's left end, clear of its words and of the cursor's path.
    const spot = at(500, 70)
    const before = pixel(frameAt(exported, 0.3), spot.x, spot.y)
    expect(before.r).toBeGreaterThan(200)
    expect(before.g).toBeLessThan(60)

    const after = pixel(frameAt(exported, 2.5), spot.x, spot.y)
    expect(Math.abs(after.r - after.g)).toBeLessThan(20)
    expect(after.r).toBeLessThan(110)
  })

  it("draws the round picture from its bytes", () => {
    const middle = at(70, 70)
    const colour = pixel(frameAt(exported, 0.3), middle.x, middle.y)
    expect(colour.g).toBeGreaterThan(180)
    expect(colour.r).toBeLessThan(80)
  })

  it("writes the name in white letters", () => {
    // Somewhere along the name's line there are bright pixels.
    const frame = frameAt(exported, 0.3)
    let brightest = 0
    for (let x = 150; x < 300; x += 2) {
      const spot = at(x, 70)
      const { r, g, b } = pixel(frame, spot.x, spot.y)
      brightest = Math.max(brightest, Math.min(r, g, b))
    }
    expect(brightest).toBeGreaterThan(180)
  })
})
