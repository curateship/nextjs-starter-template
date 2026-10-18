import { describe, expect, it } from "vitest"

import { replyHtml, replySubject, replyText } from "@/server/crm/reply"

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

describe("the signature under a reply", () => {
  it("adds nothing at all when there is no signature", () => {
    // Byte for byte what went out before there was a signature setting.
    expect(replyHtml("Thanks, speak soon.", "")).toBe(
      replyHtml("Thanks, speak soon.")
    )
    expect(replyHtml("Thanks.", "   \n  ")).toBe(replyHtml("Thanks."))
    expect(replyHtml("Thanks.")).not.toContain("<hr")
  })

  it("puts a rule between the words and the signature", () => {
    const html = replyHtml("Thanks, speak soon.", "Tyler")
    const rule = html.indexOf("<hr")
    expect(rule).toBeGreaterThan(html.indexOf("Thanks, speak soon."))
    expect(rule).toBeLessThan(html.indexOf("Tyler"))
  })

  it("keeps the line breaks of a signature somebody typed", () => {
    const html = replyHtml("Thanks.", "Tyler\nAcme Kitchens\n01234 567890")
    expect(html).toContain("Tyler<br />Acme Kitchens<br />01234 567890")
  })

  it("shows typed markup as characters rather than running it", () => {
    const html = replyHtml("Thanks.", "<b>Tyler</b>")
    expect(html).not.toContain("<b>Tyler</b>")
    expect(html).toContain("&lt;b&gt;Tyler&lt;/b&gt;")
  })

  it("still carries no unsubscribe footer and no branding", () => {
    const html = replyHtml("Thanks.", "Tyler\nAcme Kitchens")
    expect(html.toLowerCase()).not.toContain("unsubscribe")
    expect(html).not.toContain("<img")
  })
})

describe("replyText", () => {
  it("is the typed words alone when there is no signature", () => {
    expect(replyText("Thanks, speak soon.", "")).toBe("Thanks, speak soon.")
  })

  it("marks the signature with the line mail clients know", () => {
    expect(replyText("Thanks.", "Tyler\n01234 567890")).toBe(
      "Thanks.\n\n-- \nTyler\n01234 567890"
    )
  })

  it("leaves typed markup exactly as it was typed", () => {
    expect(replyText("Thanks.", "<b>Tyler</b>")).toContain("<b>Tyler</b>")
  })

  it("does not escape anything, because nothing reads it as markup", () => {
    expect(replyText("5 < 6 & 7 > 2")).toBe("5 < 6 & 7 > 2")
  })
})
