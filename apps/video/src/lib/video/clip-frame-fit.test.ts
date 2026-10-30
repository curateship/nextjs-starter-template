import { describe, expect, it } from "vitest"

import {
  clipFillFocus,
  clipFit,
  fillFocusCss,
  frameFitFilter,
  storedClipFit,
  storedFillFocus,
} from "./clip-frame-fit"

describe("clipFit", () => {
  it("reads an unset clip as fitting inside", () => {
    expect(clipFit({})).toBe("contain")
  })

  it("reads a filled clip as filling", () => {
    expect(clipFit({ fit: "cover" })).toBe("cover")
  })

  it("falls back to fitting inside on a value it does not know", () => {
    expect(clipFit({ fit: "stretch" })).toBe("contain")
  })
})

describe("storedClipFit", () => {
  it("stores nothing for the default, so old and new files match", () => {
    expect(storedClipFit("contain")).toBeUndefined()
  })

  it("stores the filled choice", () => {
    expect(storedClipFit("cover")).toBe("cover")
  })
})

describe("frameFitFilter", () => {
  it("shrinks to fit and leaves the overlay to centre it", () => {
    expect(frameFitFilter("contain", 1080, 1920)).toBe(
      "scale=1080:1920:force_original_aspect_ratio=decrease"
    )
  })

  it("grows past the frame and crops the overflow back off", () => {
    expect(frameFitFilter("cover", 1080, 1920)).toBe(
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    )
  })
})

describe("where a filled picture's crop sits", () => {
  it("reads unset as the middle and stores nothing for it", () => {
    expect(clipFillFocus({})).toBe(0.5)
    expect(storedFillFocus(0.5)).toBeUndefined()
    expect(storedFillFocus(0.123456)).toBe(0.123)
  })

  it("keeps a stored value inside 0 to 1", () => {
    expect(clipFillFocus({ fillFocus: 1.4 })).toBe(1)
  })

  it("moves the export's crop by the same share as the preview", () => {
    expect(frameFitFilter("cover", 1080, 1920, 0)).toBe(
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-ow)*0:(ih-oh)*0"
    )
    expect(fillFocusCss(0)).toBe("0% 0%")
    expect(fillFocusCss(1)).toBe("100% 100%")
  })

  it("leaves the middle exactly as the export always wrote it", () => {
    expect(frameFitFilter("cover", 1080, 1920, 0.5)).toBe(
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    )
  })

  it("does nothing to a clip that fits inside", () => {
    expect(frameFitFilter("contain", 1080, 1920, 0)).toBe(
      "scale=1080:1920:force_original_aspect_ratio=decrease"
    )
  })
})
