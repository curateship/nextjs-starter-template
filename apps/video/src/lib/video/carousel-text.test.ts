import { describe, expect, it } from "vitest"

import type { CarouselTextMark } from "@/lib/video/carousel-schema"
import {
  baselineEm,
  hasMark,
  markRuns,
  shiftMarks,
  slideNumberText,
  toggleMark,
  byLetterCount,
  wrapCarouselRuns,
  wrapCarouselText,
} from "@/lib/video/carousel-text"

const bold = (start: number, end: number): CarouselTextMark => ({
  start,
  end,
  style: "bold",
})

describe("toggleMark", () => {
  it("makes the selected words bold", () => {
    expect(toggleMark([], 6, 11, "bold")).toEqual([bold(6, 11)])
  })

  it("takes bold off when every selected letter is already bold", () => {
    expect(toggleMark([bold(0, 11)], 6, 11, "bold")).toEqual([bold(0, 6)])
  })

  it("joins a new mark to one it touches", () => {
    expect(toggleMark([bold(0, 5)], 5, 9, "bold")).toEqual([bold(0, 9)])
  })

  it("keeps bold and highlight as separate marks over the same words", () => {
    const marks = toggleMark([bold(0, 5)], 0, 5, "highlight")
    expect(hasMark(marks, 0, 5, "bold")).toBe(true)
    expect(hasMark(marks, 0, 5, "highlight")).toBe(true)
  })

  it("does nothing with no letters selected", () => {
    expect(toggleMark([bold(0, 3)], 4, 4, "bold")).toEqual([bold(0, 3)])
  })
})

describe("shiftMarks", () => {
  it("moves a mark along when words are typed before it", () => {
    expect(shiftMarks("Get rich", "Now get rich", [bold(4, 8)])).toEqual([
      bold(8, 12),
    ])
  })

  it("takes in letters typed inside a marked word", () => {
    expect(shiftMarks("hello", "helXlo", [bold(0, 5)])).toEqual([bold(0, 6)])
  })

  it("does not stretch a mark when typing right in front of it", () => {
    expect(shiftMarks("Get rich", "Get very rich", [bold(4, 8)])).toEqual([
      bold(9, 13),
    ])
    expect(shiftMarks("rich", "so rich", [bold(0, 4)])).toEqual([bold(3, 7)])
  })

  it("keeps a mark when its first letter is typed over", () => {
    expect(shiftMarks("Get rich", "Get Rich", [bold(4, 8)])).toEqual([
      bold(4, 8),
    ])
  })

  it("does not stretch a mark when typing right after it", () => {
    expect(shiftMarks("hello", "hello!", [bold(0, 5)])).toEqual([bold(0, 5)])
  })

  it("drops a mark whose letters were all deleted", () => {
    expect(shiftMarks("a big win", "a win", [bold(2, 5)])).toEqual([])
  })

  it("keeps what is left of a mark that was partly deleted", () => {
    expect(shiftMarks("hello", "heo", [bold(0, 5)])).toEqual([bold(0, 3)])
  })
})

describe("runs and lines", () => {
  it("cuts text wherever its look changes, keeping every character", () => {
    const runs = markRuns("Save  big today", [bold(6, 9)])
    expect(runs.map((run) => run.text).join("")).toBe("Save  big today")
    expect(runs).toEqual([
      { text: "Save  ", bold: false, highlight: false },
      { text: "big", bold: true, highlight: false },
      { text: " today", bold: false, highlight: false },
    ])
  })

  it("wraps the same words onto the same lines as before marks existed", () => {
    const text = "Five habits that\nchanged how I work every single week"
    const plain = wrapCarouselText(text, 600, 60, 0.55)
    const runs = wrapCarouselRuns(text, [bold(0, 4)], 600, byLetterCount(60, 0.55))
    expect(runs.map((line) => line.map((run) => run.text).join(""))).toEqual(
      plain
    )
    expect(runs[0][0]).toEqual({ text: "Five", bold: true, highlight: false })
  })

  it("breaks lines by measured width, so wide capitals wrap sooner", () => {
    // W is three units wide and every other letter one, in a box ten wide.
    const measure = (words: string) =>
      [...words].reduce((sum, letter) => sum + (letter === "W" ? 3 : 1), 0)
    const lines = (text: string) =>
      wrapCarouselRuns(text, [], 10, measure).map((line) =>
        line.map((run) => run.text).join("")
      )
    expect(lines("ab cd ef gh")).toEqual(["ab cd ef", "gh"])
    expect(lines("WW WW ab")).toEqual(["WW", "WW ab"])
    // A word wider than the box is cut where it stops fitting.
    expect(lines("WWWWW")).toEqual(["WWW", "WW"])
  })

  it("keeps a highlight across the space between two highlighted words", () => {
    const [line] = wrapCarouselRuns(
      "go big now",
      [{ start: 0, end: 6, style: "highlight" }],
      2000,
      byLetterCount(60, 0.55)
    )
    expect(line).toEqual([
      { text: "go big", bold: false, highlight: true },
      { text: " now", bold: false, highlight: false },
    ])
  })

  it("says 3/7 on the third of seven slides", () => {
    expect(slideNumberText(2, 7)).toBe("3/7")
  })

  it("centres a face's height on its line", () => {
    // Inter at the default spacing sits a little above one font size down.
    expect(baselineEm({ ascent: 0.969, descent: 0.241 }, 1.16)).toBeCloseTo(
      0.944,
      3
    )
    // Double spacing adds half the extra room above the words.
    expect(baselineEm({ ascent: 0.969, descent: 0.241 }, 2.16)).toBeCloseTo(
      1.444,
      3
    )
  })
})
