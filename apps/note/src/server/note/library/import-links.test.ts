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
    [
      "https://www.linkedin.com/posts/someone_pricing-activity-7120000000000000000-AbCd",
      "linkedin",
      "7120000000000000000",
    ],
    ["https://www.linkedin.com/feed/update/urn:li:activity:7120000000000000000/", "linkedin", "7120000000000000000"],
    ["https://www.facebook.com/watch/?v=1234567890123456", "facebook", "1234567890123456"],
    ["https://www.facebook.com/reel/1234567890123456", "facebook", "1234567890123456"],
    ["https://www.facebook.com/somepage/videos/1234567890123456/", "facebook", "1234567890123456"],
    ["https://www.facebook.com/share/v/1AbCdEfGh/", "facebook", null],
    ["https://fb.watch/abCD12/", "facebook", null],
    ["https://www.reddit.com/r/videos/comments/1abc2de/a_title_here/", "reddit", "1abc2de"],
    ["https://old.reddit.com/r/videos/comments/1ABC2DE/", "reddit", "1abc2de"],
    ["https://www.reddit.com/r/videos/s/AbCdEf123", "reddit", null],
    ["https://redd.it/1abc2de", "reddit", "1abc2de"],
    ["https://www.threads.com/@mosseri/post/Cw1dvVTLesB", "threads", "Cw1dvVTLesB"],
    ["https://www.threads.net/@mosseri/post/Cw1dvVTLesB?xmt=abc", "threads", "Cw1dvVTLesB"],
    ["threads.com/@conno_r/post/DbTWrz4G-Hh", "threads", "DbTWrz4G-Hh"],
  ])("files %s under %s", (raw, source, platformId) => {
    const link = readImportLink(raw)
    expect(link.source).toBe(source)
    expect(link.platformId).toBe(platformId)
  })

  it("keeps one threads.com address for a Threads post, whichever way it was written", () => {
    expect(readImportLink("https://threads.net/@mosseri/post/Cw1dvVTLesB/?igshid=1").url).toBe(
      "https://www.threads.com/@mosseri/post/Cw1dvVTLesB"
    )
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
    "https://www.linkedin.com/in/someone/",
    "https://www.facebook.com/somepage",
    "https://www.reddit.com/r/videos/",
    "http://www.reddit.com/r/videos/comments/1abc2de/",
    "https://www.threads.com/@mosseri",
    "http://www.threads.com/@mosseri/post/Cw1dvVTLesB",
    "https://www.threads.com/@not ok/post/Cw1dvVTLesB",
  ])("refuses %s", (raw) => {
    expect(() => readImportLink(raw)).toThrow(LIBRARY_SAYS.notALink)
  })
})
