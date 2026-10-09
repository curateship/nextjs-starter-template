import { describe, expect, it } from "vitest"

import { buildDraftPrompt, splitDrafts } from "./drafts"

describe("the words handed to the model", () => {
  const base = {
    subreddit: "productivity",
    title: "What do you use to keep track of client work?",
    body: "I have six clients and a spreadsheet that is falling apart.",
    voice: "Plain and helpful. Never salesy.",
    product: "A tool that finds Reddit threads worth answering.",
    commentRules: "Never pretend to be a customer.",
    count: 2,
  }

  it("shows the model the replies that are already there", () => {
    const prompt = buildDraftPrompt({
      ...base,
      replies: [
        { author: "dinosuitgirl", text: "I moved to Notion and never looked back.", score: 12 },
        { author: "ScopeIsDope", text: "Honestly a spreadsheet is fine.", score: 4 },
      ],
    })

    // Without these the draft repeats whatever the top comment said.
    expect(prompt).toContain("REPLIES ALREADY THERE")
    expect(prompt).toContain("I moved to Notion and never looked back.")
    expect(prompt).toContain("dinosuitgirl")
    expect(prompt).toContain("12 upvotes")
    expect(prompt).toContain("Do not repeat a point one of the replies above already made.")
  })

  it("says plainly when nobody has replied", () => {
    const prompt = buildDraftPrompt({ ...base, replies: [] })
    // An empty section would read as "the replies were not fetched".
    expect(prompt).toContain("(nobody has replied yet)")
  })

  it("carries the voice, the product and the rules", () => {
    const prompt = buildDraftPrompt({ ...base, replies: [] })
    expect(prompt).toContain("Plain and helpful. Never salesy.")
    expect(prompt).toContain("A tool that finds Reddit threads worth answering.")
    expect(prompt).toContain("Never pretend to be a customer.")
  })

  it("leaves out a section that has nothing in it", () => {
    const prompt = buildDraftPrompt({
      ...base,
      voice: "",
      product: "",
      commentRules: "",
      replies: [],
    })
    expect(prompt).not.toContain("HOW I SOUND")
    expect(prompt).not.toContain("WHAT I MAKE")
    expect(prompt).not.toContain("MY RULES")
  })

  it("tells the model not to advertise", () => {
    const prompt = buildDraftPrompt({ ...base, replies: [] })
    // The whole reason the product line is conditional.
    expect(prompt).toContain("A comment that reads as an advert gets me banned")
  })

  it("says what a link post is instead of leaving the body blank", () => {
    const prompt = buildDraftPrompt({ ...base, body: "", replies: [] })
    expect(prompt).toContain("(a link or image post, no words)")
  })

  it("trims a very long post rather than sending all of it", () => {
    const prompt = buildDraftPrompt({
      ...base,
      body: "x".repeat(10_000),
      replies: [],
    })
    expect(prompt.length).toBeLessThan(6_000)
  })
})

describe("the comments really posted, as examples of the voice", () => {
  const base = {
    subreddit: "productivity",
    title: "What do you use to keep track of client work?",
    body: "I have six clients and a spreadsheet that is falling apart.",
    replies: [],
    voice: "Plain and helpful.",
    product: "",
    commentRules: "",
    count: 2,
  }

  it("carries every example, labelled as voice and not as content", () => {
    const prompt = buildDraftPrompt({
      ...base,
      examples: [
        "honestly I just use a notebook and it works fine",
        "we tried three tools and went back to email, not even joking",
        "depends how many clients. under five a spreadsheet is fine",
      ],
    })

    expect(prompt).toContain("COMMENTS I HAVE REALLY POSTED")
    expect(prompt).toContain("Example 1:\nhonestly I just use a notebook and it works fine")
    expect(prompt).toContain("Example 2:\nwe tried three tools and went back to email, not even joking")
    expect(prompt).toContain("Example 3:\ndepends how many clients. under five a spreadsheet is fine")
    expect(prompt).toContain("Do not repeat their substance.")
    // Beside the voice description, which still stands.
    expect(prompt.indexOf("HOW I SOUND")).toBeLessThan(prompt.indexOf("COMMENTS I HAVE REALLY POSTED"))
  })

  it("leaves the prompt exactly as it was when nothing has been sent", () => {
    const withNone = buildDraftPrompt({ ...base, examples: [] })
    expect(withNone).toBe(buildDraftPrompt(base))
    expect(withNone).not.toContain("COMMENTS I HAVE REALLY POSTED")
  })
})

describe("splitting the answer into comments", () => {
  it("splits on the separator it asked for", () => {
    const drafts = splitDrafts(
      [
        "I ran six clients off a spreadsheet for two years and the thing that finally broke it was invoicing.",
        "---",
        "Honestly it depends whether your pain is tracking the work or billing for it. Mine was billing.",
      ].join("\n"),
      2
    )
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toContain("spreadsheet for two years")
    expect(drafts[1]).toContain("tracking the work or billing")
  })

  it("keeps one comment when the model ignored the separator", () => {
    // One good comment beats two halves of one.
    const drafts = splitDrafts(
      "I kept a spreadsheet for two years before switching, and the invoicing is what broke it.",
      2
    )
    expect(drafts).toHaveLength(1)
  })

  it("drops a numbered preamble that is not a comment", () => {
    const drafts = splitDrafts(
      ["1.", "---", "This is a real comment with enough words in it to count."].join("\n"),
      2
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toContain("real comment")
  })

  it("answers with nothing when the model said nothing usable", () => {
    // The caller turns this into a sentence rather than storing an empty draft.
    expect(splitDrafts("", 2)).toEqual([])
    expect(splitDrafts("ok", 2)).toEqual([])
  })

  it("never returns more than asked for", () => {
    const answer = ["a".repeat(50), "b".repeat(50), "c".repeat(50)].join("\n---\n")
    expect(splitDrafts(answer, 2)).toHaveLength(2)
  })

  it("caps a comment that ran long", () => {
    const drafts = splitDrafts("y".repeat(5_000), 2)
    expect(drafts[0].length).toBe(900)
  })
})
