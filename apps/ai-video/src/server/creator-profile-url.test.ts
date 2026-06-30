import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseCreatorProfileUrl } from "./creator-profile-url"

describe("parseCreatorProfileUrl", () => {
  it("accepts TikTok profile URLs and normalizes the handle", () => {
    assert.deepEqual(
      parseCreatorProfileUrl(" https://www.tiktok.com/@Some.Creator_123 "),
      { platform: "tiktok", username: "some.creator_123" }
    )
  })

  it("accepts Instagram profile URLs and normalizes the username", () => {
    assert.deepEqual(
      parseCreatorProfileUrl("https://www.instagram.com/Some.Creator_123/"),
      { platform: "instagram", username: "some.creator_123" }
    )
  })

  it("rejects reel and post URLs", () => {
    assert.throws(
      () => parseCreatorProfileUrl("https://www.tiktok.com/@creator/video/123"),
      /profile URL, not a reel or post URL/
    )
    assert.throws(
      () => parseCreatorProfileUrl("https://www.instagram.com/reel/abc123/"),
      /profile URL, not a reel or post URL/
    )
  })

  it("rejects unsupported domains and malformed URLs", () => {
    assert.throws(
      () => parseCreatorProfileUrl("https://www.youtube.com/@creator"),
      /Only TikTok and Instagram profile URLs are supported/
    )
    assert.throws(
      () => parseCreatorProfileUrl("not a url"),
      /Enter a valid TikTok or Instagram profile URL/
    )
  })
})
