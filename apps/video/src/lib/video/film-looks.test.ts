import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

import {
  applyLook,
  clipLook,
  CURVE_POINTS,
  FILM_LOOK_IDS,
  lookCube,
  lookCurveTables,
  lookMatrixValues,
  LUT_SIZE,
} from "@/lib/video/film-looks"
import { clipSchema } from "@/lib/video/timeline-schema"

/**
 * The film looks: the preview's SVG sums and the export's LUT must be the same
 * look. `applyLook` is the SVG filter's own sum (a colour matrix, then a
 * straight-line table per channel), so each LUT is run through ffmpeg's real
 * `lut3d` on a sheet of colour patches and every patch is compared with it.
 */

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0
const dir = mkdtempSync(path.join(tmpdir(), "film-looks-"))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// Every mix of 0, 64, 128, 192 and 255 on red, green and blue: 125 patches.
const STEPS = [0, 64, 128, 192, 255]
const PATCHES = STEPS.flatMap((r) => STEPS.flatMap((g) => STEPS.map((b) => [r, g, b] as const)))

function throughLut3d(look: (typeof FILM_LOOK_IDS)[number]) {
  const cube = path.join(dir, `${look}.cube`)
  writeFileSync(cube, lookCube(look))
  const input = Buffer.from(PATCHES.flatMap((patch) => [...patch]))
  const result = spawnSync(
    "ffmpeg",
    [
      "-v", "error",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${PATCHES.length}x1`, "-i", "pipe:0",
      "-vf", `lut3d=file='${cube}'`,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ],
    { input }
  )
  if (result.status !== 0) throw new Error(result.stderr.toString())
  return result.stdout
}

describe("each look", () => {
  it("has a 20-number matrix and three 9-point curves inside black and white", () => {
    for (const look of FILM_LOOK_IDS) {
      expect(lookMatrixValues(look)).toHaveLength(20)
      for (const table of lookCurveTables(look)) {
        expect(table).toHaveLength(CURVE_POINTS)
        expect(table.every((value) => value >= 0 && value <= 1)).toBe(true)
      }
    }
  })

  it("writes a LUT of 33 by 33 by 33 colours", () => {
    const lines = lookCube("warm").trim().split("\n")
    expect(lines[1]).toBe(`LUT_3D_SIZE ${LUT_SIZE}`)
    expect(lines.length).toBe(3 + LUT_SIZE ** 3)
  })

  it("turns noir black and white", () => {
    const [r, g, b] = applyLook("noir", [0.8, 0.2, 0.1])
    expect(r).toBeCloseTo(g, 5)
    expect(g).toBeCloseTo(b, 5)
  })

  it("lifts faded film's blacks off black", () => {
    expect(applyLook("faded", [0, 0, 0])[0]).toBeGreaterThan(0.05)
  })

  it("is read from a clip, and nothing else is", () => {
    expect(clipLook({ look: "vivid" })).toBe("vivid")
    expect(clipLook({ look: "sepia" })).toBeNull()
    expect(clipLook({})).toBeNull()
    expect(
      clipSchema.safeParse({
        id: "c",
        kind: "video",
        name: "Clip",
        startMs: 0,
        durationMs: 1000,
        trimStartMs: 0,
        look: "teal-orange",
      }).success
    ).toBe(true)
  })
})

describe.skipIf(!hasFfmpeg)("the export's LUT against the preview's sums", () => {
  it.each(FILM_LOOK_IDS)("%s is within 3 levels on every patch", (look) => {
    const out = throughLut3d(look)
    let worst = 0
    PATCHES.forEach((patch, index) => {
      const expected = applyLook(look, [patch[0] / 255, patch[1] / 255, patch[2] / 255])
      for (let channel = 0; channel < 3; channel++) {
        worst = Math.max(worst, Math.abs(out[index * 3 + channel] - expected[channel] * 255))
      }
    })
    expect(worst).toBeLessThanOrEqual(3)
  })
})
