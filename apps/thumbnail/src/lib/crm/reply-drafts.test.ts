import { describe, expect, it } from "vitest"

import {
  applyReplyDraft,
  hasReplyDraft,
  noReplyDrafts,
  replyDraftFor,
} from "@/lib/crm/reply-drafts"

describe("replyDraftFor", () => {
  it("gives back what was typed in that conversation", () => {
    const drafts = applyReplyDraft(noReplyDrafts, "a", "half a sentence")
    expect(replyDraftFor(drafts, "a")).toBe("half a sentence")
  })

  it("gives back nothing for a conversation never typed in", () => {
    expect(replyDraftFor(noReplyDrafts, "a")).toBe("")
  })

  it("gives back nothing when no conversation is open", () => {
    const drafts = applyReplyDraft(noReplyDrafts, "a", "half a sentence")
    expect(replyDraftFor(drafts, null)).toBe("")
  })
})

describe("applyReplyDraft", () => {
  it("keeps three conversations apart", () => {
    let drafts = noReplyDrafts
    drafts = applyReplyDraft(drafts, "a", "about the invoice")
    drafts = applyReplyDraft(drafts, "b", "about the date")
    drafts = applyReplyDraft(drafts, "c", "about the dog")

    expect(replyDraftFor(drafts, "a")).toBe("about the invoice")
    expect(replyDraftFor(drafts, "b")).toBe("about the date")
    expect(replyDraftFor(drafts, "c")).toBe("about the dog")
  })

  it("empties the one that was sent and leaves the others alone", () => {
    let drafts = noReplyDrafts
    drafts = applyReplyDraft(drafts, "a", "about the invoice")
    drafts = applyReplyDraft(drafts, "b", "about the date")
    drafts = applyReplyDraft(drafts, "c", "about the dog")

    drafts = applyReplyDraft(drafts, "b", "")

    expect(replyDraftFor(drafts, "b")).toBe("")
    expect(hasReplyDraft(drafts, "b")).toBe(false)
    expect(replyDraftFor(drafts, "a")).toBe("about the invoice")
    expect(replyDraftFor(drafts, "c")).toBe("about the dog")
  })

  it("stores nothing for a box emptied by hand", () => {
    let drafts = applyReplyDraft(noReplyDrafts, "a", "typed then deleted")
    drafts = applyReplyDraft(drafts, "a", "")
    expect(Object.keys(drafts)).toEqual([])
  })

  it("treats spaces and newlines as an empty box", () => {
    const drafts = applyReplyDraft(noReplyDrafts, "a", "  \n ")
    expect(hasReplyDraft(drafts, "a")).toBe(false)
  })

  it("adds to what is already there when given a function", () => {
    let drafts = applyReplyDraft(noReplyDrafts, "a", "my own words")
    drafts = applyReplyDraft(
      drafts,
      "a",
      (current) => `${current}\n\nand the AI's`
    )
    expect(replyDraftFor(drafts, "a")).toBe("my own words\n\nand the AI's")
  })

  it("gives back the same object when the text did not change", () => {
    const drafts = applyReplyDraft(noReplyDrafts, "a", "about the invoice")
    expect(applyReplyDraft(drafts, "a", "about the invoice")).toBe(drafts)
    expect(applyReplyDraft(drafts, "b", "")).toBe(drafts)
  })

  it("does not change the drafts it was given", () => {
    const first = applyReplyDraft(noReplyDrafts, "a", "about the invoice")
    applyReplyDraft(first, "a", "something else")
    applyReplyDraft(first, "a", "")
    expect(replyDraftFor(first, "a")).toBe("about the invoice")
  })
})
