import { describe, expect, it } from "vitest"

import { coverImagesSchema, coverSchema, MAX_COVER_IMAGES, readCoverImages, skyPhaseAt } from "@/lib/notes/page-cover"

const at = (hours: number, minutes = 0) => new Date(2026, 10, 8, hours, minutes)

/** A page cover: none, the sky, or a picture, and the pictures kept as tiles. */
describe("page covers", () => {
  it("takes none, the sky, or a picture at https or a path here, and nothing else", () => {
    expect(coverSchema.safeParse(null).success).toBe(true)
    expect(coverSchema.safeParse("sky").success).toBe(true)
    expect(coverSchema.safeParse("/media/a.jpg").success).toBe(true)
    expect(coverSchema.safeParse("https://cdn.example.com/a.jpg").success).toBe(true)
    expect(coverSchema.safeParse("//evil.example.com/a.jpg").success).toBe(false)
    expect(coverSchema.safeParse("javascript:alert(1)").success).toBe(false)
  })

  it("keeps at most eight pictures, and reads anything else stored as none", () => {
    const nine = Array.from({ length: MAX_COVER_IMAGES + 1 }, (_, index) => `/media/${index}.jpg`)
    expect(coverImagesSchema.safeParse(nine).success).toBe(false)
    expect(readCoverImages(["/media/a.jpg"])).toEqual(["/media/a.jpg"])
    expect(readCoverImages("nonsense")).toEqual([])
    expect(readCoverImages(["//evil.example.com"])).toEqual([])
  })

  it("follows Project's hours: sunrise, day, gold, sunset, then night until 5 AM", () => {
    expect(skyPhaseAt(at(5, 30))).toBe("sunrise")
    expect(skyPhaseAt(at(9))).toBe("day")
    expect(skyPhaseAt(at(14))).toBe("day")
    expect(skyPhaseAt(at(17))).toBe("golden")
    expect(skyPhaseAt(at(18, 30))).toBe("sunset")
    expect(skyPhaseAt(at(22))).toBe("night")
    expect(skyPhaseAt(at(2))).toBe("night")
  })
})
