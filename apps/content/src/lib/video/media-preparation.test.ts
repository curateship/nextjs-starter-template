import { describe, expect, it } from "vitest"

import { mediaPreparation } from "@/lib/video/media-preparation"

const video = { file_type: "video", proxy_status: "ready", filmstrip_status: "ready" }

describe("mediaPreparation", () => {
  it("is ready once both the smooth copy and the frames are", () => {
    expect(mediaPreparation(video)).toBe("ready")
  })

  it("is preparing while either is queued, being made, or not yet discovered", () => {
    expect(mediaPreparation({ ...video, proxy_status: "queued" })).toBe("preparing")
    expect(mediaPreparation({ ...video, filmstrip_status: "generating" })).toBe(
      "preparing"
    )
    expect(
      mediaPreparation({ ...video, proxy_status: null, filmstrip_status: null })
    ).toBe("preparing")
  })

  it("says failed as soon as either gave up, even while the other is still going", () => {
    expect(
      mediaPreparation({ ...video, proxy_status: "error", filmstrip_status: "generating" })
    ).toBe("failed")
  })

  it("never marks a picture or a sound, which get neither", () => {
    expect(
      mediaPreparation({ file_type: "image", proxy_status: null, filmstrip_status: null })
    ).toBe("ready")
    expect(
      mediaPreparation({ file_type: "audio", proxy_status: null, filmstrip_status: null })
    ).toBe("ready")
  })
})
