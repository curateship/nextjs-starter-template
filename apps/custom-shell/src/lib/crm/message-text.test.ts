import { describe, expect, it } from "vitest"

import {
  htmlToText,
  messageSnippet,
  splitQuotedText,
} from "@/lib/crm/message-text"

describe("htmlToText", () => {
  it("reads the words out of tags", () => {
    expect(htmlToText("<p>Hello <b>there</b></p>")).toBe("Hello there")
  })

  it("throws away a script and a style rather than reading them aloud", () => {
    expect(
      htmlToText("<style>p{color:red}</style><script>evil()</script><p>Hi</p>")
    ).toBe("Hi")
  })

  it("turns breaks and paragraphs into real lines", () => {
    expect(htmlToText("<p>One</p><p>Two<br>Three</p>")).toBe(
      "One\n\nTwo\nThree"
    )
  })

  it("puts the escaped characters back", () => {
    expect(htmlToText("<p>Jack &amp; Jill &lt;3 &quot;rain&quot;</p>")).toBe(
      'Jack & Jill <3 "rain"'
    )
  })

  it("answers an empty string for markup with no words in it", () => {
    expect(htmlToText("<div><span></span></div>")).toBe("")
  })
})

describe("splitQuotedText", () => {
  it("folds a quoted run away from the words above it", () => {
    const { own, quoted } = splitQuotedText(
      "That works for us.\n\n> Can you do Tuesday?\n> Thanks"
    )
    expect(own).toBe("That works for us.")
    expect(quoted).toBe("> Can you do Tuesday?\n> Thanks")
  })

  it("folds at the line a mail client writes above the quote", () => {
    const { own, quoted } = splitQuotedText(
      "Yes please.\n\nOn 1 October 2026 Jane wrote:\nAre you free?"
    )
    expect(own).toBe("Yes please.")
    expect(quoted).toBe("On 1 October 2026 Jane wrote:\nAre you free?")
  })

  it("leaves a message with no quoting alone", () => {
    const { own, quoted } = splitQuotedText("Morning, any news?")
    expect(own).toBe("Morning, any news?")
    expect(quoted).toBeNull()
  })

  it("keeps the lot when the message is nothing but quoting", () => {
    const { own, quoted } = splitQuotedText("> Only their words")
    expect(own).toBe("> Only their words")
    expect(quoted).toBeNull()
  })
})

describe("messageSnippet", () => {
  it("prefers the plain text, which is what they typed", () => {
    expect(messageSnippet("Typed words", "<p>Markup words</p>")).toBe(
      "Typed words"
    )
  })

  it("falls back to the html when there is no plain text", () => {
    expect(messageSnippet(null, "<p>Markup words</p>")).toBe("Markup words")
    expect(messageSnippet("   ", "<p>Markup words</p>")).toBe("Markup words")
  })

  it("leaves the quoting out, so a short reply is not buried", () => {
    expect(
      messageSnippet("Sounds good.\n\n> a long quoted thread\n> goes here", null)
    ).toBe("Sounds good.")
  })

  it("squeezes the lines into one", () => {
    expect(messageSnippet("One\nTwo\n\nThree", null)).toBe("One Two Three")
  })

  it("trims at 160 characters and says it was trimmed", () => {
    const snippet = messageSnippet("x".repeat(400), null)
    expect(snippet).toHaveLength(161)
    expect(snippet?.endsWith("…")).toBe(true)
  })

  it("answers null for a body that has not arrived", () => {
    expect(messageSnippet(null, null)).toBeNull()
    expect(messageSnippet("", "")).toBeNull()
  })
})
