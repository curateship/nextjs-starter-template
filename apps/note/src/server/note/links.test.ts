import { describe, expect, it } from "vitest"

import {
  checkLinkHost,
  isPrivateAddress,
  parseVideoLink,
  readVideoLink,
  type ResolveHost,
} from "@/server/note/links"

/**
 * Which pasted links reach yt-dlp. The three known sites are read for their
 * id straight away; any other https link only gets through when its host is a
 * public name that answers with public addresses. That host check is what
 * keeps a pasted link from reaching the inside of the server.
 */

const publicHost: ResolveHost = async () => ["93.184.215.14"]

describe("YouTube, TikTok and Instagram links", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=12", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/abcDEF_123-x", "abcDEF_123-x"],
    ["https://youtu.be/dQw4w9WgXcQ?si=share", "dQw4w9WgXcQ"],
  ])("reads the YouTube id from %s", (url, id) => {
    expect(parseVideoLink(url)).toMatchObject({ source: "youtube", platformVideoId: id })
  })

  it("reads the TikTok id from a full link", () => {
    expect(
      parseVideoLink("https://www.tiktok.com/@creator/video/7312345678901234567")
    ).toMatchObject({ source: "tiktok", platformVideoId: "7312345678901234567" })
  })

  it.each(["https://vm.tiktok.com/ZMabc123/", "https://www.tiktok.com/t/ZTabc123/"])(
    "leaves a shortened TikTok link's id for yt-dlp to name: %s",
    (url) => {
      expect(parseVideoLink(url)).toMatchObject({ source: "tiktok", platformVideoId: null })
    }
  )

  it.each(["reel", "reels", "p", "tv"])("reads an Instagram /%s/ link", (kind) => {
    expect(parseVideoLink(`https://www.instagram.com/${kind}/DAbc_12-x/`)).toMatchObject({
      source: "instagram",
      platformVideoId: "DAbc_12-x",
    })
  })

  it.each([
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/watch",
    "https://www.tiktok.com/@creator",
    "https://www.instagram.com/someone/",
  ])("refuses a page on a known site that is not one video: %s", (url) => {
    expect(() => parseVideoLink(url)).toThrow("That is not a link to a video")
  })
})

describe("links from anywhere else", () => {
  it("lets a public https site through, for yt-dlp to name after the download", async () => {
    await expect(readVideoLink("https://vimeo.com/76979871", publicHost)).resolves.toMatchObject({
      source: null,
      platformVideoId: null,
      url: "https://vimeo.com/76979871",
    })
  })

  it.each([
    ["http", "http://vimeo.com/76979871"],
    ["localhost", "https://localhost:3024/videos"],
    ["a .localhost name", "https://note.localhost/x"],
    ["a bare IPv4 address", "https://93.184.215.14/video.mp4"],
    ["a bare IPv6 address", "https://[2606:2800:220:1::]/video.mp4"],
    ["a name with no dot", "https://intranet/video.mp4"],
    ["a link with a password in it", "https://user:secret@vimeo.com/1"],
    ["something that is not a link", "my favourite video"],
    ["an ftp address", "ftp://example.com/video.mp4"],
  ])("refuses %s", async (_label, url) => {
    await expect(readVideoLink(url, publicHost)).rejects.toThrow("That is not a link to a video")
  })

  it.each([
    ["the loopback address", "127.0.0.1"],
    ["the cloud metadata address", "169.254.169.254"],
    ["a 10.x address", "10.0.0.5"],
    ["a 192.168.x address", "192.168.1.20"],
    ["a 172.16.x address", "172.20.3.4"],
    ["IPv6 loopback", "::1"],
    ["an IPv6 private address", "fd12:3456::1"],
    ["an IPv4 address written as IPv6", "::ffff:127.0.0.1"],
  ])("refuses a name that answers with %s", async (_label, address) => {
    const resolve: ResolveHost = async () => ["93.184.215.14", address]
    await expect(readVideoLink("https://videos.example.com/1", resolve)).rejects.toThrow(
      "That is not a link to a video"
    )
  })

  it("refuses a name that answers with nothing", async () => {
    const nowhere: ResolveHost = async () => {
      throw new Error("ENOTFOUND")
    }
    await expect(readVideoLink("https://no-such-site.example/1", nowhere)).rejects.toThrow(
      "That is not a link to a video"
    )
  })

  it("does not look up the three known sites", async () => {
    const never: ResolveHost = async () => {
      throw new Error("should not be asked")
    }
    await expect(
      checkLinkHost(parseVideoLink("https://youtu.be/dQw4w9WgXcQ"), never)
    ).resolves.toBeUndefined()
  })
})

describe("private addresses", () => {
  it("knows a public address from a private one", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false)
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false)
    expect(isPrivateAddress("100.64.0.1")).toBe(true)
    expect(isPrivateAddress("0.0.0.0")).toBe(true)
    expect(isPrivateAddress("fe80::1")).toBe(true)
    expect(isPrivateAddress("not an address")).toBe(true)
  })
})
