import { describe, expect, it } from "vitest"

import { findSharedLink } from "@/lib/viral/share"

describe("the link a phone shared", () => {
  it("takes the link from the url, or from inside the text", () => {
    expect(findSharedLink({ url: "https://youtube.com/shorts/abc123def45" })).toBe("https://youtube.com/shorts/abc123def45")
    expect(findSharedLink({ text: "Watch this on TikTok https://www.tiktok.com/@chef/video/123 so good" })).toBe(
      "https://www.tiktok.com/@chef/video/123"
    )
  })

  it("finds nothing when no web address came", () => {
    expect(findSharedLink({ title: "A video", text: "javascript:alert(1)" })).toBeNull()
    expect(findSharedLink({})).toBeNull()
  })
})
