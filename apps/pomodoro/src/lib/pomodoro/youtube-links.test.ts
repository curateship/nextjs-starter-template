import { describe, expect, it } from "vitest"

import {
  clipStartProblem,
  isYoutubeClipImport,
  readStartTime,
  readYoutubeClipRequest,
  readYoutubeLink,
} from "@/lib/pomodoro/youtube-links"

const ID = "aqz-KE-bpKQ"

describe("readYoutubeLink", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
  ])("reads the video in %s", (link) => {
    expect(readYoutubeLink(link)).toEqual({ ok: true, id: ID, startFromLink: null })
  })

  it.each([
    [`https://youtu.be/${ID}?t=95`, 95],
    [`https://www.youtube.com/watch?v=${ID}&t=95s`, 95],
    [`https://www.youtube.com/watch?v=${ID}&t=1m35s`, 95],
    [`https://www.youtube.com/watch?v=${ID}&t=1h2m5s`, 3725],
    [`https://www.youtube.com/embed/${ID}?start=30`, 30],
    [`https://www.youtube.com/watch?v=${ID}&t=soon`, null],
  ])("reads the start in %s", (link, start) => {
    expect(readYoutubeLink(link)).toMatchObject({ ok: true, startFromLink: start })
  })

  it.each([
    ["", "Paste a YouTube link."],
    ["https://vimeo.com/123456", "Not a YouTube link."],
    ["ftp://youtube.com/watch?v=aqz-KE-bpKQ", "Not a YouTube link."],
    ["https://www.youtube.com/playlist?list=PL123", "That is a playlist. Paste one video's link."],
    ["https://www.youtube.com/@blender", "That is a channel. Paste one video's link."],
    ["https://www.youtube.com/channel/UC123", "That is a channel. Paste one video's link."],
    ["https://www.youtube.com/results?search_query=rain", "That is a search. Paste one video's link."],
    ["https://www.youtube.com/watch?v=short", "That link has no video in it. Paste one video's link."],
    [ID, "Not a YouTube link."],
  ])("refuses %j", (link, reason) => {
    expect(readYoutubeLink(link)).toEqual({ ok: false, reason })
  })
})

describe("readStartTime", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["95", 95],
    ["1:35", 95],
    ["0:05", 5],
    ["1:02:05", 3725],
  ])("reads %j as %j", (text, seconds) => {
    expect(readStartTime(text)).toEqual({ ok: true, seconds })
  })

  it.each(["1:75", "1.35", "abc", "1:2:3:4", "-5"])("refuses %j", (text) => {
    expect(readStartTime(text).ok).toBe(false)
  })

  it("refuses a start longer than a day", () => {
    expect(readStartTime("25:00:00")).toEqual({
      ok: false,
      reason: "That start is longer than a day. Check the time.",
    })
  })
})

describe("readYoutubeClipRequest", () => {
  it("lets a typed start win over the link's own", () => {
    expect(readYoutubeClipRequest(`https://youtu.be/${ID}?t=30`, "1:35")).toEqual({
      ok: true,
      id: ID,
      start: 95,
      address: `https://www.youtube.com/watch?v=${ID}&t=95`,
    })
  })

  it("falls back to the link's start, then to 0:00", () => {
    expect(readYoutubeClipRequest(`https://youtu.be/${ID}?t=30`, "")).toMatchObject({ start: 30 })
    expect(readYoutubeClipRequest(`https://youtu.be/${ID}`, "")).toMatchObject({ start: 0 })
  })

  it("names the field that is wrong", () => {
    expect(readYoutubeClipRequest("https://vimeo.com/1", "1:35")).toMatchObject({
      ok: false,
      field: "link",
    })
    expect(readYoutubeClipRequest(`https://youtu.be/${ID}`, "1:75")).toMatchObject({
      ok: false,
      field: "start",
    })
  })

  it("stores an address the worker reads back to the same video and start", () => {
    const request = readYoutubeClipRequest(`https://youtu.be/${ID}`, "2:00")
    if (!request.ok) throw new Error("expected a request")
    expect(isYoutubeClipImport(request.address)).toBe(true)
    expect(readYoutubeLink(request.address)).toEqual({ ok: true, id: ID, startFromLink: 120 })
    expect(isYoutubeClipImport("https://pixabay.com/videos/rain-window-28470/")).toBe(false)
  })
})

describe("clipStartProblem", () => {
  it("lets a clip end exactly at the video's end", () => {
    expect(clipStartProblem(195, 200)).toBeNull()
  })

  it("says when the clip must start by", () => {
    expect(clipStartProblem(196, 200)).toBe(
      "The video is only 3:20 long, so the clip must start by 3:15."
    )
  })

  it("refuses a video shorter than the clip", () => {
    expect(clipStartProblem(0, 4)).toBe("The video is shorter than 5 seconds.")
  })
})
