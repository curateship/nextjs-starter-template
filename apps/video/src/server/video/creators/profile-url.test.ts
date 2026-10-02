import { describe, expect, it } from "vitest"

import {
  creatorProfileUrl,
  parseCreatorProfileLink,
} from "@/server/video/creators/profile-url"

/**
 * The old app's profile-link tests, carried over and widened to YouTube.
 *
 * This parser is the gate as much as it is a convenience: whatever it returns
 * is handed to yt-dlp and to YouTube's API, so a link to any other host has to
 * be refused here. The "rejects everything else" case is the one that matters
 * most — it is what stops the server being pointed at an address somebody
 * chose.
 */

describe("parseCreatorProfileLink", () => {
  it("reads a TikTok profile and lowercases the handle", () => {
    expect(
      parseCreatorProfileLink(" https://www.tiktok.com/@Some.Creator_123 ")
    ).toEqual({
      platform: "tiktok",
      handle: "some.creator_123",
      channelId: null,
      profileUrl: "https://www.tiktok.com/@some.creator_123",
    })
  })

  it("reads an Instagram profile with or without the trailing slash", () => {
    expect(
      parseCreatorProfileLink("https://www.instagram.com/Some.Creator_123/")
    ).toEqual({
      platform: "instagram",
      handle: "some.creator_123",
      channelId: null,
      profileUrl: "https://www.instagram.com/some.creator_123",
    })
  })

  it("reads a YouTube @handle, leaving the channel id to be looked up", () => {
    expect(parseCreatorProfileLink("https://www.youtube.com/@MrBeast")).toEqual({
      platform: "youtube",
      handle: "mrbeast",
      channelId: null,
      profileUrl: "https://www.youtube.com/@mrbeast",
    })
  })

  it("keeps a YouTube channel id exactly as written, since it is case sensitive", () => {
    const link = parseCreatorProfileLink(
      "https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA"
    )
    expect(link.channelId).toBe("UCX6OQ3DkcsbYNE6H8uQQuVA")
    expect(link.handle).toBe("ucx6oq3dkcsbyne6h8uqquva")
  })

  it("reads the two older YouTube channel shapes", () => {
    expect(parseCreatorProfileLink("https://youtube.com/c/Creator").handle).toBe(
      "creator"
    )
    expect(
      parseCreatorProfileLink("https://m.youtube.com/user/Creator").handle
    ).toBe("creator")
  })

  it("says plainly when the link is to a video rather than a profile", () => {
    expect(() =>
      parseCreatorProfileLink("https://www.tiktok.com/@creator/video/123")
    ).toThrow(/profile link, not a link to one of their videos/)
    expect(() =>
      parseCreatorProfileLink("https://www.instagram.com/reel/abc123/")
    ).toThrow(/profile link, not a link to one of their videos/)
    expect(() =>
      parseCreatorProfileLink("https://www.youtube.com/watch?v=abc123")
    ).toThrow(/profile link, not a link to one of their videos/)
    expect(() =>
      parseCreatorProfileLink("https://www.youtube.com/shorts/abc123")
    ).toThrow(/profile link, not a link to one of their videos/)
  })

  it("refuses every other host, which is what keeps this an SSRF guard", () => {
    for (const link of [
      "https://vimeo.com/@creator",
      "https://example.com/@creator",
      "https://127.0.0.1/@creator",
      "https://youtube.com.evil.test/@creator",
      "https://notyoutube.com/@creator",
    ]) {
      expect(() => parseCreatorProfileLink(link)).toThrow(
        /Only YouTube, TikTok and Instagram/
      )
    }
  })

  it("refuses anything that is not an https web address", () => {
    for (const link of [
      "not a url",
      "",
      "   ",
      "http://www.tiktok.com/@creator",
      "file:///etc/passwd",
      "javascript:alert(1)",
    ]) {
      expect(() => parseCreatorProfileLink(link)).toThrow()
    }
  })

  it("refuses a handle that is only punctuation", () => {
    expect(() => parseCreatorProfileLink("https://www.tiktok.com/@...")).toThrow(
      /valid YouTube, TikTok or Instagram profile link/
    )
    expect(() =>
      parseCreatorProfileLink("https://www.instagram.com/..%2F..%2Fetc/")
    ).toThrow()
  })

  it("refuses a YouTube channel id that is not the right shape", () => {
    expect(() =>
      parseCreatorProfileLink("https://www.youtube.com/channel/not-a-channel")
    ).toThrow(/valid YouTube, TikTok or Instagram profile link/)
  })
})

describe("creatorProfileUrl", () => {
  it("rebuilds the link each platform is read back from", () => {
    expect(
      creatorProfileUrl({
        platform: "youtube",
        handle: "mrbeast",
        platformChannelId: "UCX6OQ3DkcsbYNE6H8uQQuVA",
      })
    ).toBe("https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA")
    expect(
      creatorProfileUrl({
        platform: "youtube",
        handle: "mrbeast",
        platformChannelId: null,
      })
    ).toBe("https://www.youtube.com/@mrbeast")
    expect(
      creatorProfileUrl({
        platform: "tiktok",
        handle: "creator",
        platformChannelId: null,
      })
    ).toBe("https://www.tiktok.com/@creator")
    expect(
      creatorProfileUrl({
        platform: "instagram",
        handle: "creator",
        platformChannelId: null,
      })
    ).toBe("https://www.instagram.com/creator")
  })
})
