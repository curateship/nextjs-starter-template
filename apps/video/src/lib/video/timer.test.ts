import { describe, expect, it } from "vitest"

import {
  isTimerClip,
  timerBox,
  timerExportWindows,
  timerMarkup,
  timerRingShare,
  timerSecondAt,
  timerSvg,
  timerText,
} from "./timer"

const focus = { durationMs: 25 * 60_000, x: 0.4, y: 0.3, toX: 0.6, toY: 0.7, timerAbove: "FOCUS", timerBelow: "Round 2/6" }

describe("the timer", () => {
  it("counts down from the clip's length to one second left", () => {
    expect(timerText(focus, 0)).toBe("25:00")
    expect(timerText(focus, 1)).toBe("24:59")
    expect(timerText(focus, 1499)).toBe("00:01")
    expect(timerSecondAt(focus, 1_499_999)).toBe(1499)
    expect(timerSecondAt(focus, 99_999_999)).toBe(1499)
  })

  it("counts up when asked, and shows hours past an hour", () => {
    expect(timerText({ ...focus, timerUp: true }, 61)).toBe("01:01")
    expect(timerText({ durationMs: 3 * 3_600_000 }, 0)).toBe("3:00:00")
  })

  it("empties its ring as it runs", () => {
    expect(timerRingShare(focus, 0)).toBe(1)
    expect(timerRingShare(focus, 750)).toBe(0.5)
    expect(timerRingShare({ ...focus, timerUp: true }, 750)).toBe(0.5)
  })

  it("has one export picture per whole second, the last cut short", () => {
    const windows = timerExportWindows({ durationMs: 2_500 })
    expect(windows).toEqual([
      { fromMs: 0, toMs: 1000, second: 0 },
      { fromMs: 1000, toMs: 2000, second: 1 },
      { fromMs: 2000, toMs: 2500, second: 2 },
    ])
    expect(timerExportWindows(focus)).toHaveLength(1500)
  })

  it("draws the same thing in the preview and the export for the same second", () => {
    const frame = { width: 1920, height: 1080 }
    const box = timerBox(focus, frame)
    const exported = timerSvg(focus, frame, 1)
    const previewed = timerMarkup(focus, { width: Math.round(box.width), height: Math.round(box.height) }, 1, "Fredoka", 1080)
    expect(exported).toContain(previewed)
    expect(exported).toContain(">24:59<")
    expect(exported).toContain(">FOCUS<")
    expect(exported).toContain(">Round 2/6<")
  })

  it("keeps its words as words, not markup", () => {
    expect(timerSvg({ ...focus, timerAbove: "<b>&" }, { width: 1920, height: 1080 }, 0)).toContain("&lt;b&gt;&amp;")
    expect(isTimerClip({ kind: "shape", shape: "timer" })).toBe(true)
    expect(isTimerClip({ kind: "shape", shape: "circle" })).toBe(false)
  })
})
