import { describe, expect, it } from "vitest"

import {
  captionEntranceProgress,
  captionExportWindows,
  captionWordAnimation,
  captionWordTransformCss,
  CAPTION_ANIM_ENTRANCE_MS,
  clamp01,
  isAnimatedCaption,
  resolveCaptionAnimation,
} from "./caption-animations"

describe("reading a saved animation", () => {
  it("keeps a known one and treats anything else as none", () => {
    expect(resolveCaptionAnimation("pop")).toBe("pop")
    expect(resolveCaptionAnimation("rise")).toBe("rise")
    expect(resolveCaptionAnimation(undefined)).toBe("none")
    expect(resolveCaptionAnimation(null)).toBe("none")
    expect(resolveCaptionAnimation("wobble")).toBe("none")
  })

  it("counts everything but none as animated", () => {
    expect(isAnimatedCaption("none")).toBe(false)
    expect(isAnimatedCaption(undefined)).toBe(false)
    expect(isAnimatedCaption("pop")).toBe(true)
  })
})

describe("how far through its entrance a word is", () => {
  const start = 1000

  it("is nothing before the word, and full once the entrance is over", () => {
    expect(captionEntranceProgress(500, start)).toBe(0)
    expect(captionEntranceProgress(start, start)).toBe(0)
    expect(
      captionEntranceProgress(start + CAPTION_ANIM_ENTRANCE_MS / 2, start)
    ).toBe(0.5)
    expect(captionEntranceProgress(start + CAPTION_ANIM_ENTRANCE_MS, start)).toBe(
      1
    )
    // Long after, it stays put rather than running away.
    expect(
      captionEntranceProgress(start + CAPTION_ANIM_ENTRANCE_MS * 5, start)
    ).toBe(1)
  })
})

describe("where the word sits", () => {
  it("leaves a plain caption exactly where it belongs, the whole way through", () => {
    for (const progress of [0, 0.5, 1]) {
      expect(captionWordAnimation("none", progress)).toEqual({
        scale: 1,
        opacity: 1,
        dyEm: 0,
      })
    }
  })

  it("rests rather than breaks on an animation it does not know", () => {
    // @ts-expect-error on purpose: this is the runtime fallback being checked.
    expect(captionWordAnimation("nope", 0.5)).toEqual({
      scale: 1,
      opacity: 1,
      dyEm: 0,
    })
  })

  it("pops in big and settles", () => {
    expect(captionWordAnimation("pop", 0).scale).toBeGreaterThan(1.2)
    const end = captionWordAnimation("pop", 1)
    expect(round(end.scale)).toBe(1)
    expect(end.opacity).toBe(1)
    expect(end.dyEm).toBe(0)
  })

  it("rises from below while fading in", () => {
    const start = captionWordAnimation("rise", 0)
    const end = captionWordAnimation("rise", 1)
    expect(start.opacity).toBeLessThan(end.opacity)
    expect(start.dyEm).toBeGreaterThan(0)
    expect(round(end.dyEm)).toBe(0)
    expect(round(end.scale)).toBe(1)
  })

  it("bounces: normal at both ends, bigger in the middle", () => {
    expect(round(captionWordAnimation("bounce", 0).scale)).toBe(1)
    expect(round(captionWordAnimation("bounce", 1).scale)).toBe(1)
    expect(captionWordAnimation("bounce", 0.5).scale).toBeGreaterThan(1.1)
  })

  it("never produces a size or a fade that makes no sense", () => {
    for (const id of ["pop", "rise", "bounce"] as const) {
      for (let progress = -0.5; progress <= 1.5; progress += 0.1) {
        const at = captionWordAnimation(id, progress)
        expect(Number.isFinite(at.scale)).toBe(true)
        expect(at.scale).toBeGreaterThan(0)
        expect(at.opacity).toBeGreaterThanOrEqual(0)
        expect(at.opacity).toBeLessThanOrEqual(1)
        expect(Number.isFinite(at.dyEm)).toBe(true)
      }
    }
  })

  it("writes it the way the preview's stylesheet wants", () => {
    expect(captionWordTransformCss({ scale: 1.2, opacity: 1, dyEm: 0.3 })).toBe(
      "translateY(0.3000em) scale(1.2000)"
    )
  })
})

describe("the pictures an export has to draw", () => {
  it("has none to draw for a stretch with no length", () => {
    expect(captionExportWindows(100, 100, 100)).toEqual([])
    expect(captionExportWindows(200, 100, 100)).toEqual([])
  })

  it("covers the whole stretch with no gap and no overlap", () => {
    const windows = captionExportWindows(0, 1000, 100)
    expect(windows.length).toBeGreaterThan(1)
    expect(windows[0].fromMs).toBe(0)
    expect(windows.at(-1)?.toMs).toBe(1000)
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index].fromMs).toBe(windows[index - 1].toMs)
    }
  })

  it("holds still while the word is up but has not started yet", () => {
    const [first] = captionExportWindows(0, 1000, 100)
    expect(first.fromMs).toBe(0)
    expect(first.toMs).toBe(100)
    expect(first.progress).toBe(0)
  })

  it("ends on one still picture once the entrance is over", () => {
    const windows = captionExportWindows(100, 1000, 100)
    expect(windows.at(-1)?.progress).toBe(1)
    expect(windows.at(-1)?.toMs).toBe(1000)
    expect(windows.filter((window) => window.progress === 1)).toHaveLength(1)
  })

  it("draws the entrance across several pictures, always moving forwards", () => {
    const windows = captionExportWindows(
      100,
      100 + CAPTION_ANIM_ENTRANCE_MS,
      100
    )
    expect(windows.length).toBeGreaterThanOrEqual(3)
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index].progress).toBeGreaterThanOrEqual(
        windows[index - 1].progress
      )
    }
  })

  it("still draws something for a word that is barely on screen", () => {
    const windows = captionExportWindows(100, 130, 100)
    expect(windows.length).toBeGreaterThanOrEqual(1)
    expect(windows[0].fromMs).toBe(100)
    expect(windows.at(-1)?.toMs).toBe(130)
  })
})

describe("clamp01", () => {
  it("keeps a number between nothing and everything, and forgives nonsense", () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(Number.NaN)).toBe(0)
  })
})

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
