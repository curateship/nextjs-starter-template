import { describe, expect, it } from "vitest"

import { replyHtml, replySubject } from "@/server/crm/reply"

describe("replySubject", () => {
  it("puts Re: on the front", () => {
    expect(replySubject("Kitchen quote")).toBe("Re: Kitchen quote")
  })

  it("does not stack a second Re: on a subject that has one", () => {
    expect(replySubject("Re: Kitchen quote")).toBe("Re: Kitchen quote")
    expect(replySubject("RE: Kitchen quote")).toBe("RE: Kitchen quote")
    expect(replySubject("Fwd: Kitchen quote")).toBe("Fwd: Kitchen quote")
  })

  it("still answers something for a mail with no subject", () => {
    expect(replySubject("")).toBe("Re:")
    expect(replySubject("   ")).toBe("Re:")
  })

  it("leaves a subject that only looks like a prefix alone", () => {
    expect(replySubject("Revenue for March")).toBe("Re: Revenue for March")
  })
})

describe("replyHtml", () => {
  it("makes a paragraph of each blank-line-separated block", () => {
    const html = replyHtml("First line.\n\nSecond line.")
    expect(html).toContain("First line.")
    expect(html).toContain("Second line.")
    expect(html.match(/<p /g)).toHaveLength(2)
  })

  it("makes a single newline a break inside one paragraph", () => {
    const html = replyHtml("Line one\nLine two")
    expect(html.match(/<p /g)).toHaveLength(1)
    expect(html).toContain("Line one<br />Line two")
  })

  it("escapes what somebody typed, so a reply cannot carry markup", () => {
    const html = replyHtml('<script>alert("x")</script>')
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("never carries an unsubscribe footer, which belongs on a newsletter", () => {
    const html = replyHtml("Thanks, speak soon.")
    expect(html.toLowerCase()).not.toContain("unsubscribe")
  })

  it("answers valid html for an empty body rather than nothing", () => {
    expect(replyHtml("")).toContain("<p></p>")
  })
})
