import { describe, expect, it } from "vitest"

import {
  createBroadcastBlock,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import {
  personalizeEmail,
  renderBroadcastBlockHtml,
  renderBroadcastEmailHtml,
} from "@/lib/broadcasts/render"

function block<K extends BroadcastBlock["kind"]>(
  kind: K,
  content: Partial<Extract<BroadcastBlock, { kind: K }>["content"]> = {}
): BroadcastBlock {
  const base = createBroadcastBlock(kind)
  return { ...base, content: { ...base.content, ...content } } as BroadcastBlock
}

describe("renderBroadcastBlockHtml", () => {
  it("renders a header logo with alignment and padding", () => {
    const html = renderBroadcastBlockHtml(
      block("header", {
        logoUrl: "https://example.com/logo.png",
        logoWidth: 140,
        alignment: "left",
        paddingTop: 10,
        paddingBottom: 30,
      })
    )
    expect(html).toContain('src="https://example.com/logo.png"')
    expect(html).toContain("width:140px")
    expect(html).toContain("padding:10px 20px 30px 20px")
    expect(html).toContain("text-align:left")
  })

  it("renders nothing inside an empty header", () => {
    const html = renderBroadcastBlockHtml(block("header"))
    expect(html).not.toContain("<img")
  })

  it("escapes footer company fields", () => {
    const html = renderBroadcastBlockHtml(
      block("footer", {
        companyName: "<script>alert(1)</script>",
        companyAddress: '"Main" & Co',
      })
    )
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&quot;Main&quot; &amp; Co")
  })

  it("includes the unsubscribe placeholder only when enabled", () => {
    expect(
      renderBroadcastBlockHtml(block("footer", { showUnsubscribe: true }))
    ).toContain("{{unsubscribe_url}}")
    expect(
      renderBroadcastBlockHtml(block("footer", { showUnsubscribe: false }))
    ).not.toContain("{{unsubscribe_url}}")
  })

  it("inlines styles into rich text tags", () => {
    const html = renderBroadcastBlockHtml(
      block("richText", {
        htmlContent: "<h2>Hello</h2><p>World</p><a href='https://x.dev'>x</a>",
      })
    )
    expect(html).toContain('<h2 style="margin:0 0 16px 0;')
    expect(html).toContain('<p style="margin:0 0 24px 0;">World</p>')
    expect(html).toContain("color:#2563eb")
  })

  it("renders divider settings", () => {
    const html = renderBroadcastBlockHtml(
      block("divider", { color: "#ff0000", thickness: 3, width: 50, spacing: 8 })
    )
    expect(html).toContain("border-top:3px solid #ff0000")
    expect(html).toContain("width:50%")
    expect(html).toContain("padding:8px 0")
  })
})

describe("renderBroadcastEmailHtml", () => {
  it("wraps blocks in an MSO-safe 600px document", () => {
    const html = renderBroadcastEmailHtml([block("divider")])
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<!--[if mso]>")
    expect(html).toContain('width="600"')
  })

  it("injects a hidden, escaped preheader", () => {
    const html = renderBroadcastEmailHtml([block("divider")], {
      preheader: "Deals <today>",
    })
    expect(html).toContain("display:none")
    expect(html).toContain("Deals &lt;today&gt;")
  })
})

describe("personalizeEmail", () => {
  const contact = {
    email: "ada@example.com",
    firstName: '<b>"Ada"</b>',
    lastName: null,
  }

  it("escapes contact values in html mode", () => {
    const output = personalizeEmail(
      "<p>Hi {{firstName}} {{lastName}} ({{email}})</p>",
      contact,
      { html: true }
    )
    expect(output).toContain("&lt;b&gt;&quot;Ada&quot;&lt;/b&gt;")
    expect(output).not.toContain("<b>")
    expect(output).toContain("ada@example.com")
  })

  it("leaves values raw in text mode", () => {
    const output = personalizeEmail("Hi {{firstName}}", contact, {
      html: false,
    })
    expect(output).toBe('Hi <b>"Ada"</b>')
  })

  it("replaces the unsubscribe url with attribute escaping", () => {
    const output = personalizeEmail(
      '<a href="{{unsubscribe_url}}">bye</a>',
      contact,
      { html: true, unsubscribeUrl: "https://x.dev/u?c=1&t=2" }
    )
    expect(output).toContain('href="https://x.dev/u?c=1&amp;t=2"')
  })
})
