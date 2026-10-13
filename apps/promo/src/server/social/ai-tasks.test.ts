import { describe, expect, it } from "vitest"

import { nearlyTheSame } from "@/lib/social/similar"
import { keywordTimerText, subredditRemovalText, subredditRemovalWarning } from "@/lib/social/wording"
import { proxyCostTotalText, renewalText } from "@/lib/browser/wording"

import { readIdeasAnswer, readPostAnswer, readRulesAnswer } from "./ai-tasks"
import { isPromotionThread } from "./reddit/promo-threads"

/**
 * The plain pieces of the 12 Oct 2026 features: reading what the AI answered,
 * telling a promotion thread from a post about promotion, spotting the same
 * comment twice, and the words the screens say.
 */
describe("reading the AI's answers", () => {
  it("reads broken rules one a line, and NONE as none", () => {
    expect(readRulesAnswer("NONE")).toEqual([])
    expect(readRulesAnswer("None of them.")).toEqual([])
    expect(
      readRulesAnswer("1. No links | The comment links to a website.\n- No self-promotion | It names the product.")
    ).toEqual([
      { rule: "No links", why: "The comment links to a website." },
      { rule: "No self-promotion", why: "It names the product." },
    ])
    // A line with no reason is not a broken rule.
    expect(readRulesAnswer("No links")).toEqual([])
  })

  it("reads keyword and subreddit ideas, cleaning names and dropping repeats", () => {
    expect(
      readIdeasAnswer(
        'KEYWORD: find customers on reddit\nkeyword: "find customers on reddit"\nSUBREDDIT: r/SaaS\nSUBREDDIT: https://www.reddit.com/r/startups/\nSomething else'
      )
    ).toEqual({ keywords: ["find customers on reddit"], subreddits: ["SaaS", "startups"] })
  })

  it("reads a post's title and words, and refuses an answer with no title", () => {
    expect(readPostAnswer("TITLE: What I learned\nBODY: First line.\nSecond line.")).toEqual({
      title: "What I learned",
      body: "First line.\nSecond line.",
    })
    expect(() => readPostAnswer("Just some words")).toThrow("no title")
  })
})

describe("telling a self-promotion thread apart", () => {
  it("knows the usual names", () => {
    expect(isPromotionThread("Weekly Self-Promotion Thread")).toBe(true)
    expect(isPromotionThread("Share your startup - weekly thread")).toBe(true)
    expect(isPromotionThread("Monthly showcase megathread")).toBe(true)
  })

  it("is not fooled by somebody's own post about promotion", () => {
    expect(isPromotionThread("How do you promote your SaaS on Reddit?")).toBe(false)
    expect(isPromotionThread("Self-promotion got me banned")).toBe(false)
  })
})

describe("the same comment twice", () => {
  it("says so when most of the words are the same", () => {
    const sent = "I used a plain spreadsheet for two years before moving to a proper tool, and it was fine."
    expect(nearlyTheSame("I used a plain spreadsheet for two years before moving to a proper tool.", sent)).toBe(true)
    expect(nearlyTheSame("A kanban board in Trello worked for our team of four people.", sent)).toBe(false)
    // Too short to judge.
    expect(nearlyTheSame("I used a spreadsheet.", sent)).toBe(false)
  })
})

describe("the words on screen", () => {
  const now = new Date("2026-10-13T12:00:00Z")

  it("says when a keyword last searched and whether its timer is on", () => {
    expect(keywordTimerText({ enabled: true, lastRunAt: null }, now)).toBe("Not searched yet")
    expect(keywordTimerText({ enabled: true, lastRunAt: new Date("2026-10-13T10:00:00Z") }, now)).toBe(
      "Searched 2 hours ago"
    )
    expect(keywordTimerText({ enabled: false, lastRunAt: new Date("2026-10-13T11:59:30Z") }, now)).toBe(
      "Timer off · Searched just now"
    )
  })

  it("counts removals only when there are some, and says Post still works", () => {
    expect(subredditRemovalText({ removed: 0, checked: 5 })).toBeNull()
    expect(subredditRemovalText({ removed: 2, checked: 5 })).toBe("2 of 5 removed")
    expect(subredditRemovalWarning("SaaS", { removed: 2, checked: 5 })).toBe(
      "r/SaaS removed 2 of your 5 checked comments there."
    )
  })

  it("adds up proxy costs and says when one renews", () => {
    expect(proxyCostTotalText(84, 7)).toBe("$84.00 a month for 7 proxies")
    expect(renewalText("2026-10-13", now)).toBe("Renews today")
    expect(renewalText("2026-10-14", now)).toBe("Renews tomorrow")
    expect(renewalText("2026-10-18", now)).toBe("Renews in 5 days")
    expect(renewalText("2026-11-30", now)).toBe("Renews 30 Nov")
    expect(renewalText("2026-10-10", now)).toBe("Renewal was 10 Oct")
  })
})
