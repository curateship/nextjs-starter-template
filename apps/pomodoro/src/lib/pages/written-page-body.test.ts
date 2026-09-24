import { describe, expect, it } from "vitest"

import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  isSafeWrittenPageLink,
  writtenPageBodyIsEmpty,
  writtenPageText,
} from "@/lib/pages/written-page-body"

/**
 * This is the app's main injection surface: words an admin typed, shown to the
 * open internet. The design is that the body is a tree of named nodes rather
 * than a string of markup, so there is nothing to escape — and these tests pin
 * down the half of that promise the cleaner is responsible for: **only shapes
 * on the allowed list survive, whatever arrives.**
 */

const doc = (...content: unknown[]) => ({ type: "doc", content })
const para = (...content: unknown[]) => ({ type: "paragraph", content })
const text = (value: string, marks?: unknown[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
})

describe("what survives a clean", () => {
  it("keeps the shapes a page is allowed to hold", () => {
    const body = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("About us")] },
      para(text("We sell "), text("things", [{ type: "bold" }])),
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [para(text("One"))] }],
      },
      { type: "blockquote", content: [para(text("A quote"))] }
    )

    expect(cleanWrittenPageBody(body)).toEqual(body)
  })

  it("throws away a node type nobody allowed", () => {
    // The whole boundary in one test: an editor extension somebody adds later,
    // or a hand-made request, cannot smuggle a new kind of content onto a page.
    const cleaned = cleanWrittenPageBody(
      doc(para(text("Kept")), { type: "iframe", attrs: { src: "//evil" } })
    )

    expect(cleaned).toEqual(doc(para(text("Kept"))))
  })

  it("keeps a pasted script tag as words, because words are all a text node is", () => {
    const cleaned = cleanWrittenPageBody(
      doc(para(text("<script>alert(1)</script>")))
    )

    // Still there, still text. It is drawn by React as the contents of a
    // paragraph, so it reads as characters rather than running.
    expect(writtenPageText(cleaned)).toBe("<script>alert(1)</script>")
  })

  it("answers with an empty page for anything that is not a document", () => {
    for (const junk of [null, undefined, "hello", 7, [], { type: "paragraph" }]) {
      expect(cleanWrittenPageBody(junk)).toEqual(emptyWrittenPageBody())
    }
  })
})

describe("links", () => {
  it("allows the schemes a page has a reason to point at", () => {
    for (const href of [
      "https://example.com",
      "http://example.com",
      "mailto:hi@example.com",
      "tel:+15551234",
      "/pricing",
    ]) {
      expect(isSafeWrittenPageLink(href), href).toBe(true)
    }
  })

  it("refuses the ones that run something", () => {
    for (const href of [
      "javascript:alert(1)",
      "  javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox",
    ]) {
      expect(isSafeWrittenPageLink(href), href).toBe(false)
    }
  })

  it("drops a dangerous link but keeps the sentence", () => {
    const cleaned = cleanWrittenPageBody(
      doc(
        para(
          text("Click here", [
            { type: "link", attrs: { href: "javascript:alert(1)" } },
          ])
        )
      )
    )

    // The words stay and simply stop being clickable — losing the paragraph
    // would be a worse answer than losing the link.
    expect(cleaned).toEqual(doc(para(text("Click here"))))
  })

  it("keeps a link that is fine", () => {
    const marks = [{ type: "link", attrs: { href: "https://example.com" } }]
    const cleaned = cleanWrittenPageBody(doc(para(text("Here", marks))))

    expect(cleaned).toEqual(doc(para(text("Here", marks))))
  })
})

describe("limits that stop one paste breaking the page", () => {
  it("refuses to nest for ever", () => {
    // A hand-made document could otherwise be deep enough to exhaust the stack
    // when it is walked.
    let deep: unknown = text("bottom")
    for (let i = 0; i < 60; i += 1) {
      deep = { type: "blockquote", content: [deep] }
    }

    const cleaned = cleanWrittenPageBody(doc(deep))
    expect(writtenPageText(cleaned)).toBe("")
  })

  it("caps a single run of text", () => {
    const cleaned = cleanWrittenPageBody(doc(para(text("a".repeat(50_000)))))

    expect(writtenPageText(cleaned).length).toBe(20_000)
  })

  it("falls back to a real heading level for one nobody offers", () => {
    const cleaned = cleanWrittenPageBody(
      doc({ type: "heading", attrs: { level: 99 }, content: [text("Hi")] })
    )

    expect(cleaned).toEqual(
      doc({ type: "heading", attrs: { level: 2 }, content: [text("Hi")] })
    )
  })
})

describe("is there anything on the page", () => {
  it("knows an empty document from a written one", () => {
    expect(writtenPageBodyIsEmpty(emptyWrittenPageBody())).toBe(true)
    expect(writtenPageBodyIsEmpty(cleanWrittenPageBody(doc(para())))).toBe(true)
    expect(
      writtenPageBodyIsEmpty(cleanWrittenPageBody(doc(para(text("Hi")))))
    ).toBe(false)
  })
})
