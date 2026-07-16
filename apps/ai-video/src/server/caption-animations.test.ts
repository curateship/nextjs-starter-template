import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  captionEntranceProgress,
  captionExportWindows,
  captionWordAnimation,
  captionWordTransformCss,
  CAPTION_ANIM_ENTRANCE_MS,
  clamp01,
  isAnimatedCaption,
  resolveCaptionAnimation,
} from "../lib/caption-animations.ts"

describe("resolveCaptionAnimation", () => {
  it("passes through known ids and coerces unknown/absent to none", () => {
    assert.equal(resolveCaptionAnimation("pop"), "pop")
    assert.equal(resolveCaptionAnimation("rise"), "rise")
    assert.equal(resolveCaptionAnimation(undefined), "none")
    assert.equal(resolveCaptionAnimation(null), "none")
    assert.equal(resolveCaptionAnimation("wobble"), "none")
  })
})

describe("isAnimatedCaption", () => {
  it("treats only non-none ids as animated", () => {
    assert.equal(isAnimatedCaption("none"), false)
    assert.equal(isAnimatedCaption(undefined), false)
    assert.equal(isAnimatedCaption("pop"), true)
  })
})

describe("captionEntranceProgress", () => {
  it("is 0 before the word starts and clamps to 1 after the entrance", () => {
    const start = 1000
    assert.equal(captionEntranceProgress(500, start), 0) // before start
    assert.equal(captionEntranceProgress(start, start), 0) // at start
    assert.equal(
      captionEntranceProgress(start + CAPTION_ANIM_ENTRANCE_MS / 2, start),
      0.5
    )
    assert.equal(
      captionEntranceProgress(start + CAPTION_ANIM_ENTRANCE_MS, start),
      1
    )
    assert.equal(
      captionEntranceProgress(start + CAPTION_ANIM_ENTRANCE_MS * 5, start),
      1
    ) // clamped
  })
})

describe("captionWordAnimation", () => {
  it("none is the resting identity at every progress", () => {
    for (const p of [0, 0.5, 1]) {
      assert.deepEqual(captionWordAnimation("none", p), {
        scale: 1,
        opacity: 1,
        dyEm: 0,
      })
    }
  })

  it("unknown-typed ids fall back to rest (never NaN)", () => {
    // @ts-expect-error exercising the runtime default branch
    const a = captionWordAnimation("nope", 0.5)
    assert.deepEqual(a, { scale: 1, opacity: 1, dyEm: 0 })
  })

  it("pop starts enlarged and settles to 1.0 at the end", () => {
    const start = captionWordAnimation("pop", 0)
    const end = captionWordAnimation("pop", 1)
    assert.ok(start.scale > 1.2, `expected big start, got ${start.scale}`)
    assert.equal(round(end.scale), 1)
    assert.equal(end.opacity, 1)
    assert.equal(end.dyEm, 0)
  })

  it("rise fades in and slides up to rest", () => {
    const start = captionWordAnimation("rise", 0)
    const end = captionWordAnimation("rise", 1)
    assert.ok(start.opacity < end.opacity, "opacity should increase")
    assert.ok(start.dyEm > 0, "should start below the baseline")
    assert.equal(round(end.dyEm), 0)
    assert.equal(round(end.scale), 1)
  })

  it("bounce pulses: rest at both ends, larger in the middle", () => {
    const start = captionWordAnimation("bounce", 0)
    const mid = captionWordAnimation("bounce", 0.5)
    const end = captionWordAnimation("bounce", 1)
    assert.equal(round(start.scale), 1)
    assert.equal(round(end.scale), 1)
    assert.ok(mid.scale > 1.1, `expected pulse in the middle, got ${mid.scale}`)
  })

  it("scale and opacity stay finite and sane across the range", () => {
    for (const id of ["pop", "rise", "bounce"] as const) {
      for (let p = -0.5; p <= 1.5; p += 0.1) {
        const a = captionWordAnimation(id, p)
        assert.ok(Number.isFinite(a.scale) && a.scale > 0)
        assert.ok(a.opacity >= 0 && a.opacity <= 1)
        assert.ok(Number.isFinite(a.dyEm))
      }
    }
  })
})

describe("captionWordTransformCss", () => {
  it("emits a translateY(em)+scale string the browser and resvg can share", () => {
    const css = captionWordTransformCss({ scale: 1.2, opacity: 1, dyEm: 0.3 })
    assert.match(css, /^translateY\(0\.3000em\) scale\(1\.2000\)$/)
  })
})

describe("captionExportWindows", () => {
  it("returns empty for a non-positive window", () => {
    assert.deepEqual(captionExportWindows(100, 100, 100), [])
    assert.deepEqual(captionExportWindows(200, 100, 100), [])
  })

  it("covers the window contiguously with no gaps or overlaps", () => {
    const windows = captionExportWindows(0, 1000, 100)
    assert.ok(windows.length > 1)
    assert.equal(windows[0].fromMs, 0)
    assert.equal(windows[windows.length - 1].toMs, 1000)
    for (let i = 1; i < windows.length; i++) {
      assert.equal(windows[i].fromMs, windows[i - 1].toMs, "contiguous")
    }
  })

  it("pins progress to 0 during a lead-in before the word starts", () => {
    const windows = captionExportWindows(0, 1000, 100)
    assert.equal(windows[0].fromMs, 0)
    assert.equal(windows[0].toMs, 100) // up to the word's own start
    assert.equal(windows[0].progress, 0)
  })

  it("ends on a single resting frame at progress 1", () => {
    const windows = captionExportWindows(100, 1000, 100)
    const last = windows[windows.length - 1]
    assert.equal(last.progress, 1)
    assert.equal(last.toMs, 1000)
    // Only one resting frame at the tail (the rest is entrance sampling).
    assert.equal(windows.filter((w) => w.progress === 1).length, 1)
  })

  it("samples the entrance across multiple frames", () => {
    const windows = captionExportWindows(100, 100 + CAPTION_ANIM_ENTRANCE_MS, 100)
    // Progress strictly increases across the entrance frames.
    for (let i = 1; i < windows.length; i++) {
      assert.ok(windows[i].progress >= windows[i - 1].progress)
    }
    assert.ok(windows.length >= 3, "entrance should be multiple frames")
  })

  it("a short word window still yields at least one frame", () => {
    const windows = captionExportWindows(100, 130, 100)
    assert.ok(windows.length >= 1)
    assert.equal(windows[0].fromMs, 100)
    assert.equal(windows[windows.length - 1].toMs, 130)
  })
})

describe("clamp01", () => {
  it("clamps and guards NaN", () => {
    assert.equal(clamp01(-1), 0)
    assert.equal(clamp01(2), 1)
    assert.equal(clamp01(0.4), 0.4)
    assert.equal(clamp01(Number.NaN), 0)
  })
})

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
