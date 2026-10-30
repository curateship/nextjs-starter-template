import { describe, expect, it } from "vitest"

import {
  CAROUSEL_MEDIA_FILTER,
  describeMediaView,
  mediaViewFilters,
} from "@/lib/video/media-saved-views"

describe("Media saved views", () => {
  it("keeps the ticked types in order and the picked collection", () => {
    expect(
      mediaViewFilters({ types: "audio,video,nonsense", collection: "abc-1" })
    ).toEqual({ types: "video,audio", collection: "abc-1" })
  })

  it("leaves out the defaults: every type, or All media", () => {
    expect(
      mediaViewFilters({ types: "image,video,audio", collection: "all" })
    ).toEqual({})
    expect(mediaViewFilters({ types: "", collection: "uncollected" })).toEqual({
      collection: "uncollected",
    })
  })

  it("keeps only Video and Image on the carousel's Image panel", () => {
    expect(
      mediaViewFilters({ types: "video,audio", collection: "shelf" }, CAROUSEL_MEDIA_FILTER)
    ).toEqual({ types: "video" })
    expect(
      mediaViewFilters({ types: "image,video", collection: "uncollected" }, CAROUSEL_MEDIA_FILTER)
    ).toEqual({})
    expect(
      mediaViewFilters({ collection: "abc-1" }, CAROUSEL_MEDIA_FILTER)
    ).toEqual({ collection: "abc-1" })
  })

  it("says what a view shows, naming a deleted collection plainly", () => {
    expect(
      describeMediaView({ types: "video,audio", collection: "x" }, () => "B-roll")
    ).toBe("Video, Sound · B-roll")
    expect(describeMediaView({ collection: "x" }, () => undefined)).toBe(
      "A deleted collection"
    )
  })
})
