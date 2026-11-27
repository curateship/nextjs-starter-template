import { describe, expect, it } from "vitest"

import {
  filmstripPlan,
  filmstripSheetPath,
  framePlace,
} from "@/lib/video/filmstrip-sheets"

describe("how many frames a strip holds", () => {
  it("keeps a frame every two seconds up to four minutes, in one sheet", () => {
    expect(filmstripPlan(30)).toEqual({ frameCount: 15, columns: 10, rowsPerSheet: 2, sheetCount: 1 })
    expect(filmstripPlan(240)).toEqual({ frameCount: 120, columns: 10, rowsPerSheet: 12, sheetCount: 1 })
  })

  it("gives an hour a frame every five seconds, over six sheets", () => {
    expect(filmstripPlan(3600)).toEqual({ frameCount: 720, columns: 10, rowsPerSheet: 12, sheetCount: 6 })
  })

  it("gives a very short clip one frame", () => {
    expect(filmstripPlan(0.5)).toEqual({ frameCount: 1, columns: 1, rowsPerSheet: 1, sheetCount: 1 })
  })
})

describe("where the sheets and frames are", () => {
  it("keeps the first sheet at the strip's own address", () => {
    const first = "video/filmstrips/u/m/lease.jpg"
    expect(filmstripSheetPath(first, 0)).toBe(first)
    expect(filmstripSheetPath(first, 3)).toBe("video/filmstrips/u/m/lease-3.jpg")
  })

  it("finds a frame's sheet, row and column", () => {
    expect(framePlace(0, { columns: 10, rowsPerSheet: 12 })).toEqual({ sheet: 0, column: 0, row: 0 })
    // The fourth sheet's 78th frame.
    expect(framePlace(437, { columns: 10, rowsPerSheet: 12 })).toEqual({ sheet: 3, column: 7, row: 7 })
  })
})
