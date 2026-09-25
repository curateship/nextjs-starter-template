import { describe, expect, it } from "vitest"

import { clipFit, frameFitFilter, storedClipFit } from "./clip-frame-fit"

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
