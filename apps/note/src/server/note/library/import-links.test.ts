import { describe, expect, it } from "vitest"

import { readImportLink } from "@/server/note/library/import-links"
import { LIBRARY_SAYS } from "@/lib/note/library/notes"

/** Which source each pasted link files under, and what is refused. */
describe("readImportLink", () => {
  it.each([
    ["https://www.youtube.com/watch?v=jNQXAC9IVRw", "youtube_long", "jNQXAC9IVRw"],
    ["https://youtu.be/jNQXAC9IVRw", "youtube_long", "jNQXAC9IVRw"],
    ["youtube.com/watch?v=jNQXAC9IVRw", "youtube_long", "jNQXAC9IVRw"],
    ["https://www.youtube.com/shorts/aqz-KE-bpKQ", "youtube_short", "aqz-KE-bpKQ"],
    ["https://www.instagram.com/reel/C9xYzAbCdEf/", "instagram", "C9xYzAbCdEf"],
    ["https://www.instagram.com/p/C9xYzAbCdEf/", "instagram", "C9xYzAbCdEf"],
    ["https://www.tiktok.com/@creator/video/7301234567890123456", "tiktok", "7301234567890123456"],
    ["https://vm.tiktok.com/ZMabc123/", "tiktok", null],
    ["https://x.com/naval/status/1002103360646823936", "x", "1002103360646823936"],
    ["twitter.com/naval/status/1002103360646823936?s=20", "x", "1002103360646823936"],
  ])("files %s under %s", (raw, source, platformId) => {
    const link = readImportLink(raw)
    expect(link.source).toBe(source)
    expect(link.platformId).toBe(platformId)
  })

  it("keeps the tidy X address", () => {
    expect(readImportLink("https://twitter.com/naval/status/1002103360646823936?s=20").url).toBe(
      "https://x.com/naval/status/1002103360646823936"
    )
  })

  it.each([
    "https://vimeo.com/76979871",
    "https://example.com/video.mp4",
    "https://www.youtube.com/@channel",
    "https://www.instagram.com/someone/",
    "https://x.com/naval",
    "not a link at all",
    "http://localhost:3000/video",
  ])("refuses %s", (raw) => {
    expect(() => readImportLink(raw)).toThrow(LIBRARY_SAYS.notALink)
  })
})
