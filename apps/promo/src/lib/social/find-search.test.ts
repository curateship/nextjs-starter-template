import { describe, expect, it } from "vitest"

import { findSearchWords, matchesFindSearch } from "./find-search"
import { emptyFindsWords } from "./wording"

const post = { title: "How we set our pricing", subreddit: "SaaS", author: "quiet_founder" }

describe("searching the posts already found", () => {
  it("matches part of a title, without case", () => {
    expect(matchesFindSearch(post, "PRIC")).toBe(true)
    expect(matchesFindSearch(post, "refund")).toBe(false)
  })

  it("matches the subreddit and the author, written with or without r/ and u/", () => {
    expect(matchesFindSearch(post, "saas")).toBe(true)
    expect(matchesFindSearch(post, "r/SaaS")).toBe(true)
    expect(matchesFindSearch(post, "u/quiet")).toBe(true)
  })

  it("needs every word, in any order, across the three", () => {
    expect(matchesFindSearch(post, "saas pricing")).toBe(true)
    expect(matchesFindSearch(post, "saas refund")).toBe(false)
  })

  it("lets everything through when the box is blank or only spaces", () => {
    expect(matchesFindSearch(post, "")).toBe(true)
    expect(matchesFindSearch(post, "   ")).toBe(true)
    expect(findSearchWords("   ")).toEqual([])
  })

  it("never searches the post's body", () => {
    expect(matchesFindSearch({ ...post, body: "refund" } as typeof post, "refund")).toBe(false)
  })
})

describe("what an empty list says", () => {
  const base = { loading: false, everything: false, hasKeywords: true, tab: "new" as const, searchHidAll: false }

  it("tells a search that matched nothing apart from a list with nothing in it", () => {
    expect(emptyFindsWords({ ...base, searchHidAll: true })).toBe("No post matches those words.")
    expect(emptyFindsWords(base)).toBe("Nothing found for this keyword yet. Press the search button beside it.")
  })

  it("speaks for every keyword on Everything", () => {
    expect(emptyFindsWords({ ...base, everything: true })).toBe(
      "Nothing is waiting under any keyword. Press the search button beside one to look again."
    )
    expect(emptyFindsWords({ ...base, everything: true, tab: "commented" })).toBe(
      "You have not replied to any post yet."
    )
  })

  it("says to add a keyword when none is saved", () => {
    expect(emptyFindsWords({ ...base, everything: true, hasKeywords: false })).toBe(
      "No keywords yet. Add one above and it searches straight away."
    )
  })
})
