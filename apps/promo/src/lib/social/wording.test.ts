import { describe, expect, it } from "vitest"

import {
  keywordScopeText,
  postedDateText,
  postingBlockedReason,
  splitIntoBlocks,
} from "./wording"

const NOW = new Date("2099-06-10T12:00:00.000Z")

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

describe("when a post went up", () => {
  it("names the recent days the way a person would", () => {
    expect(postedDateText(daysAgo(0), NOW)).toBe("Today")
    expect(postedDateText(daysAgo(1), NOW)).toBe("Yesterday")
    expect(postedDateText(daysAgo(2), NOW)).toBe("2 days ago")
    expect(postedDateText(daysAgo(5), NOW)).toBe("5 days ago")
  })

  it("rolls up once the day count stops meaning anything", () => {
    expect(postedDateText(daysAgo(8), NOW)).toBe("Last week")
    expect(postedDateText(daysAgo(20), NOW)).toBe("2 weeks ago")
    expect(postedDateText(daysAgo(90), NOW)).toBe("3 months ago")
  })

  it("says nothing rather than guessing when Reddit gave no time", () => {
    expect(postedDateText(null, NOW)).toBe("—")
  })

  it("counts whole days, so an hour either side of midnight is a day apart", () => {
    // Built in local time on purpose. The helper compares whole days in the
    // reader's own timezone, which is the point of it, so a test written in UTC
    // would be testing a different clock than the screen uses.
    const lateLastNight = new Date(2099, 5, 9, 23, 30)
    const earlyToday = new Date(2099, 5, 10, 0, 30)
    expect(postedDateText(lateLastNight, earlyToday)).toBe("Yesterday")
  })

  it("reads two moments on one day as the same day, however far apart", () => {
    const morning = new Date(2099, 5, 10, 0, 1)
    const night = new Date(2099, 5, 10, 23, 59)
    expect(postedDateText(morning, night)).toBe("Today")
  })
})

describe("what a saved keyword searches", () => {
  it("says the count, the window and where", () => {
    expect(
      keywordScopeText({ postCount: 15, subreddits: [], timeWindow: "week" })
    ).toBe("15 posts · Past week · All of Reddit")
  })

  it("names the subreddits when there are some", () => {
    expect(
      keywordScopeText({
        postCount: 1,
        subreddits: ["SaaS", "founder"],
        timeWindow: "day",
      })
    ).toBe("1 post · Past day · r/SaaS, r/founder")
  })
})

describe("why posting is off", () => {
  const ready = {
    streamUrl: "http://127.0.0.1:8900/",
    streamPassword: "watch-me",
    handle: "a_persona",
    blocked: false,
    reason: "",
    jobs: { queued: 0, running: 0, failed: 0, searchingKeywordIds: [] },
  }

  it("asks for the replies to be read first", () => {
    expect(postingBlockedReason(ready, { thread: null })).toContain(
      "Read the replies first"
    )
  })

  it("says to sign in when nobody has", () => {
    expect(
      postingBlockedReason({ ...ready, handle: null }, { thread: { body: "", replies: [] } })
    ).toContain("not signed in")
  })

  it("names what Reddit is asking when something is in the way", () => {
    expect(
      postingBlockedReason(
        { ...ready, blocked: true, reason: "a captcha is on screen" },
        { thread: { body: "", replies: [] } }
      )
    ).toContain("a captcha is on screen")
  })

  it("is off when everything is ready", () => {
    expect(
      postingBlockedReason(ready, { thread: { body: "", replies: [] } })
    ).toBeNull()
  })
})

describe("breaking a Reddit post into paragraphs", () => {
  it("keeps plain paragraphs apart", () => {
    expect(splitIntoBlocks("First one.\n\nSecond one.")).toEqual([
      { text: "First one.", quoted: false },
      { text: "Second one.", quoted: false },
    ])
  })

  it("marks a quoted run as one quote, with the angle brackets gone", () => {
    const body = [
      ">Yes, I know.",
      ">",
      ">Automated DMs are the problem.",
      "",
      "So here is what we did.",
    ].join("\n")

    expect(splitIntoBlocks(body)).toEqual([
      { text: "Yes, I know.\n\nAutomated DMs are the problem.", quoted: true },
      { text: "So here is what we did.", quoted: false },
    ])
  })

  it("parts a quote from the words after it", () => {
    const blocks = splitIntoBlocks(">Somebody said this\nAnd I said that")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ text: "Somebody said this", quoted: true })
    expect(blocks[1]).toEqual({ text: "And I said that", quoted: false })
  })

  it("handles the space Reddit sometimes puts after the bracket", () => {
    expect(splitIntoBlocks("> With a space")).toEqual([
      { text: "With a space", quoted: true },
    ])
  })

  it("answers with nothing for an empty post", () => {
    expect(splitIntoBlocks("")).toEqual([])
    expect(splitIntoBlocks("\n\n   \n")).toEqual([])
  })

  it("does not lose a post that is one line", () => {
    expect(splitIntoBlocks("Just the one line.")).toEqual([
      { text: "Just the one line.", quoted: false },
    ])
  })
})

describe("a post that is mostly quoted", () => {
  it("collapses the blank lines a quote run leaves behind", () => {
    // The real shape Reddit returns: every line quoted, with bare ">" lines
    // between the paragraphs, sometimes three in a row.
    const body = [
      ">First paragraph.",
      ">",
      ">",
      ">",
      ">Second paragraph.",
    ].join("\n")

    const blocks = splitIntoBlocks(body)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].quoted).toBe(true)
    expect(blocks[0].text).toBe("First paragraph.\n\nSecond paragraph.")
  })

  it("keeps one blank line between paragraphs", () => {
    const blocks = splitIntoBlocks(">One.\n>\n>Two.")
    expect(blocks[0].text).toBe("One.\n\nTwo.")
  })

  it("leaves no leading or trailing blank lines on a block", () => {
    const blocks = splitIntoBlocks(">\n>\n>Only this.\n>\n>")
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe("Only this.")
  })
})
