import { describe, expect, it } from "vitest"

import { fitWarnings } from "./fit"

describe("the post writers' fit warnings", () => {
  it("warns about a wide video on TikTok and not on LinkedIn", () => {
    const wide = { kind: "video" as const, aspect: "16:9", durationMs: 30_000, fileSize: 10 }
    expect(fitWarnings("tiktok", wide)).toEqual(["TikTok shows videos tall, at 9:16. This one is 16:9, so it shows small with bars around it."])
    expect(fitWarnings("linkedin", wide)).toEqual([])
  })

  it("warns about a video over a network's length and size", () => {
    const long = { kind: "video" as const, aspect: "9:16", durationMs: 11 * 60_000, fileSize: 5 * 1024 ** 3 }
    expect(fitWarnings("tiktok", long)).toEqual([
      "TikTok takes videos up to 10 minutes. This one is 11 minutes.",
      "TikTok takes files up to 4 GB. This one is 5.0 GB.",
    ])
    expect(fitWarnings("instagram", { ...long, durationMs: 60_000, fileSize: 1 })).toEqual([])
  })

  it("leaves pictures and carousels alone", () => {
    expect(fitWarnings("tiktok", { kind: "picture", aspect: "16:9", durationMs: null, fileSize: 1 })).toEqual([])
  })
})
