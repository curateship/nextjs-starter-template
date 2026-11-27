import { describe, expect, it } from "vitest"

import {
  betterThanOutOf100,
  figuresMayLag,
  readYoutubeVideoId,
  stillWatchingOutOf100,
  YOUTUBE_LINK_INVALID_MESSAGE,
} from "@/lib/video/retention"

const ID = "dQw4w9WgXcQ"

describe("readYoutubeVideoId", () => {
  it.each([
    ID,
    ` ${ID} `,
    `https://www.youtube.com/watch?v=${ID}&t=12s`,
    `https://youtube.com/shorts/${ID}?feature=share`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `youtube.com/live/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
  ])("reads %s", (pasted) => {
    expect(readYoutubeVideoId(pasted)).toBe(ID)
  })

  it.each([
    "",
    "hello",
    "https://vimeo.com/123456",
    "https://www.youtube.com/@barelycooking",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    `https://youtu.be/${ID}${"x".repeat(400)}`,
  ])("refuses %s", (pasted) => {
    expect(() => readYoutubeVideoId(pasted)).toThrow(YOUTUBE_LINK_INVALID_MESSAGE)
  })
})

describe("the figures in words", () => {
  it("counts out of 100", () => {
    expect(stillWatchingOutOf100({ watch: 0.404 })).toBe(40)
    expect(betterThanOutOf100({ relative: 0.62 })).toBe(62)
  })

  it("warns about YouTube's lag for two days after posting", () => {
    const posted = "2026-10-20T12:00:00Z"
    expect(figuresMayLag(posted, new Date("2026-10-22T11:00:00Z"))).toBe(true)
    expect(figuresMayLag(posted, new Date("2026-10-22T13:00:00Z"))).toBe(false)
  })
})
