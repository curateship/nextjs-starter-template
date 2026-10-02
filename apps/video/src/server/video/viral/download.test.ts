import { afterEach, describe, expect, it } from "vitest"

import {
  maxDownloadBytes,
  parseVideoLink,
  VIDEO_LINK_ERROR,
} from "@/server/video/viral/download"

/**
 * The host check is the whole point of these tests.
 *
 * The address reaching `downloadViralVideo` is handed to a program that will
 * fetch whatever it is pointed at, so every address that is not one of the
 * three platforms has to be refused before that program starts. A hole here is
 * a way to make the server fetch something on the inside of the network, so
 * the refusal cases matter more than the accepting ones.
 */

describe("parseVideoLink", () => {
  it("reads both shapes a YouTube video arrives as", () => {
    expect(parseVideoLink("https://www.youtube.com/shorts/abc123_-X")).toEqual({
      platform: "youtube",
      platformVideoId: "abc123_-X",
    })
    expect(parseVideoLink("https://www.youtube.com/watch?v=abc123_-X")).toEqual({
      platform: "youtube",
      platformVideoId: "abc123_-X",
    })
    expect(parseVideoLink("https://youtu.be/abc123_-X")).toEqual({
      platform: "youtube",
      platformVideoId: "abc123_-X",
    })
  })

  it("reads a TikTok video from the long and the short link", () => {
    expect(
      parseVideoLink("https://www.tiktok.com/@creator/video/7312345678901234567")
    ).toEqual({ platform: "tiktok", platformVideoId: "7312345678901234567" })
    expect(parseVideoLink("https://vm.tiktok.com/ZMabc123")).toEqual({
      platform: "tiktok",
      platformVideoId: "ZMabc123",
    })
  })

  it("reads an Instagram reel, post and tv link", () => {
    for (const kind of ["reel", "p", "tv"]) {
      expect(
        parseVideoLink(`https://www.instagram.com/${kind}/Cabc-123_/`)
      ).toEqual({ platform: "instagram", platformVideoId: "Cabc-123_" })
    }
  })

  it("refuses every other host, which is what keeps yt-dlp off the network", () => {
    for (const link of [
      "https://example.com/video/123",
      "https://vimeo.com/123456",
      "https://127.0.0.1/video/1",
      "https://169.254.169.254/latest/meta-data/",
      "https://localhost:8080/video",
      "https://youtube.com.evil.test/shorts/abc",
      "https://eviltiktok.com/@a/video/1",
    ]) {
      expect(() => parseVideoLink(link)).toThrow(VIDEO_LINK_ERROR)
    }
  })

  it("refuses anything that is not an https web address", () => {
    for (const link of [
      "file:///etc/passwd",
      "http://www.youtube.com/shorts/abc123",
      "ftp://youtube.com/shorts/abc",
      "not a url",
      "",
    ]) {
      expect(() => parseVideoLink(link)).toThrow(VIDEO_LINK_ERROR)
    }
  })

  it("refuses a YouTube address that is not a video", () => {
    for (const link of [
      "https://www.youtube.com/@creator",
      "https://www.youtube.com/playlist?list=PL123",
      "https://www.youtube.com/",
    ]) {
      expect(() => parseVideoLink(link)).toThrow(VIDEO_LINK_ERROR)
    }
  })

  it("refuses an id with anything odd in it, or one too long for the column", () => {
    expect(() =>
      parseVideoLink("https://www.youtube.com/shorts/../../etc/passwd")
    ).toThrow(VIDEO_LINK_ERROR)
    expect(() =>
      parseVideoLink(`https://www.youtube.com/shorts/${"a".repeat(101)}`)
    ).toThrow(VIDEO_LINK_ERROR)
    expect(() => parseVideoLink("https://www.youtube.com/watch?v=")).toThrow(
      VIDEO_LINK_ERROR
    )
  })
})

describe("maxDownloadBytes", () => {
  const original = process.env.VIDEO_MAX_DOWNLOAD_BYTES

  afterEach(() => {
    if (original === undefined) delete process.env.VIDEO_MAX_DOWNLOAD_BYTES
    else process.env.VIDEO_MAX_DOWNLOAD_BYTES = original
  })

  it("is 100MB unless the deployment says otherwise", () => {
    delete process.env.VIDEO_MAX_DOWNLOAD_BYTES
    expect(maxDownloadBytes()).toBe(100 * 1024 * 1024)
  })

  it("takes the deployment's number, and ignores nonsense", () => {
    process.env.VIDEO_MAX_DOWNLOAD_BYTES = "5000000"
    expect(maxDownloadBytes()).toBe(5_000_000)
    process.env.VIDEO_MAX_DOWNLOAD_BYTES = "not a number"
    expect(maxDownloadBytes()).toBe(100 * 1024 * 1024)
    process.env.VIDEO_MAX_DOWNLOAD_BYTES = "-1"
    expect(maxDownloadBytes()).toBe(100 * 1024 * 1024)
  })
})
