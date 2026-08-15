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

  /**
   * Right alignment used to do nothing: the image was `display:block` with
   * `margin:0 0` for anything that was not centred, so it sat hard left
   * whichever of left or right was picked.
   */
  it.each(["left", "center", "right"] as const)(
    "lines the logo up %s",
    (alignment) => {
      const html = renderBroadcastBlockHtml(
        block("header", { logoUrl: "https://example.com/logo.png", alignment })
      )
      expect(html).toContain(`text-align:${alignment}`)
      // Inline-block is what lets text-align reach the image at all.
      expect(html).toContain("display:inline-block")
      expect(html).not.toContain("display:block")
    }
  )

  it("shows the app name when a header has no logo", () => {
    const html = renderBroadcastBlockHtml(block("header"), {
      appName: "North Star",
    })
    expect(html).not.toContain("<img")
    expect(html).toContain("North Star")
    expect(html).toContain("color:#111827")
  })

  it("keeps the app name readable on a dark header", () => {
    const html = renderBroadcastBlockHtml(
      block("header", { backgroundColor: "#111111" }),
      { appName: "North Star" }
    )
    expect(html).toContain("color:#f9fafb")
  })

  it("keeps the app name as text before a labelled logo", () => {
    const html = renderBroadcastBlockHtml(
      block("header", { logoUrl: "https://example.com/logo.png" }),
      { appName: "North & Star" }
    )
    expect(html).toContain("North &amp; Star")
    expect(html).toContain('alt="Logo"')
    expect(html.indexOf("North &amp; Star")).toBeLessThan(
      html.indexOf("<img")
    )
  })

  it("adds useful fallback text to rich-text images without a description", () => {
    const missing = renderBroadcastBlockHtml(
      block("richText", { htmlContent: '<img src="https://x.dev/photo.png">' })
    )
    const blank = renderBroadcastBlockHtml(
      block("richText", {
        htmlContent: '<img src="https://x.dev/photo.png" alt="">',
      })
    )
    const described = renderBroadcastBlockHtml(
      block("richText", {
        htmlContent:
          '<img src="https://x.dev/photo.png" alt="Two people talking">',
      })
    )

    expect(missing).toContain('alt="Email image"')
    expect(blank).toContain('alt="Email image"')
    expect(described).toContain('alt="Two people talking"')
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

  it("renders a button with its own address", () => {
    const html = renderBroadcastBlockHtml(
      block("button", {
        label: "Read it",
        url: "https://example.com/post?a=1&b=2",
        backgroundColor: "#ff0000",
        textColor: "#ffffff",
        alignment: "center",
        borderRadius: 4,
        padding: 12,
      })
    )
    expect(html).toContain('href="https://example.com/post?a=1&amp;b=2"')
    expect(html).toContain("Read it")
    expect(html).toContain("background-color:#ff0000")
    expect(html).toContain("color:#ffffff")
    expect(html).toContain("text-align:center")
    expect(html).toContain("padding:12px")
    expect(html).toContain("border-radius:4px")
  })

  /**
   * The whole reason the app's own emails can use this block: with no address
   * of its own it holds the placeholder, and the send puts the one-use link in.
   */
  it("falls back to the action placeholder when a button has no address", () => {
    const html = renderBroadcastBlockHtml(block("button", { url: "" }))
    expect(html).toContain('href="{{action_url}}"')
  })

  /**
   * The editor draws every block by handing this HTML to the browser, so a
   * saved `javascript:` address would be a live link in the next admin's
   * preview. Escaping the address does nothing about its scheme.
   */
  it("refuses an address that is not http, https or mailto", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1) ",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "/somewhere/relative",
    ]) {
      const html = renderBroadcastBlockHtml(block("button", { url }))
      expect(html).toContain('href="{{action_url}}"')
      expect(html).not.toContain("alert(1)")
      expect(html).not.toContain("msgbox")
    }
  })

  it("keeps the addresses that are fine", () => {
    for (const url of [
      "https://example.com",
      "http://example.com",
      "mailto:ada@example.com",
    ]) {
      expect(renderBroadcastBlockHtml(block("button", { url }))).toContain(
        `href="${url}"`
      )
    }
  })

  it("escapes the words on a button", () => {
    const html = renderBroadcastBlockHtml(
      block("button", { label: '<img src=x onerror="alert(1)">' })
    )
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img")
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

  it("identifies the sender in text when an email has no header block", () => {
    const html = renderBroadcastEmailHtml([block("richText")], {
      appName: "North & Star",
    })

    expect(html).toContain("North &amp; Star")
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
