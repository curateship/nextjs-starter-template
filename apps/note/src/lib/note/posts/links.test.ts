import { describe, expect, it } from "vitest"

import { parsePostLink, postUrl } from "@/lib/note/posts/links"
import { POST_SAYS } from "@/lib/note/posts/posts"

/** Which pasted links are X posts, and the one tidy address each becomes. */
describe("parsePostLink", () => {
  it.each([
    ["https://x.com/naval/status/1002103360646823936", "https://x.com/naval/status/1002103360646823936"],
    ["https://twitter.com/naval/status/1002103360646823936?s=20", "https://x.com/naval/status/1002103360646823936"],
    ["https://mobile.twitter.com/naval/status/1002103360646823936", "https://x.com/naval/status/1002103360646823936"],
    ["https://www.x.com/naval/status/1002103360646823936/photo/1", "https://x.com/naval/status/1002103360646823936"],
    ["x.com/naval/status/1002103360646823936", "https://x.com/naval/status/1002103360646823936"],
    ["  https://x.com/naval/status/1002103360646823936  ", "https://x.com/naval/status/1002103360646823936"],
    ["https://x.com/i/web/status/1002103360646823936", "https://x.com/i/status/1002103360646823936"],
    ["https://x.com/i/status/1002103360646823936", "https://x.com/i/status/1002103360646823936"],
  ])("reads %s", (raw, url) => {
    expect(parsePostLink(raw)).toEqual({ postId: "1002103360646823936", url })
  })

  it.each([
    "",
    "not a link",
    "https://x.com/naval",
    "https://x.com/naval/status/",
    "https://x.com/naval/status/abc",
    "https://x.com/home",
    "https://evil.example/naval/status/1002103360646823936",
    "https://x.com.evil.example/naval/status/1",
    "https://user:pass@x.com/naval/status/1",
    "ftp://x.com/naval/status/1",
    "https://x.com/this_handle_is_too_long/status/1",
    "https://x.com/naval/status/12345678901234567890123456",
  ])("refuses %s", (raw) => {
    expect(() => parsePostLink(raw)).toThrow(POST_SAYS.notALink)
  })
})

describe("postUrl", () => {
  it("uses the author once known, and /i/ before", () => {
    expect(postUrl("naval", "1")).toBe("https://x.com/naval/status/1")
    expect(postUrl(null, "1")).toBe("https://x.com/i/status/1")
    expect(postUrl("not ok!", "1")).toBe("https://x.com/i/status/1")
  })
})
