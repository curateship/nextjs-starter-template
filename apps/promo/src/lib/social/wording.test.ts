import { describe, expect, it } from "vitest"

import {
  accountAgeText,
  findsHeading,
  keywordScopeText,
  keywordTitle,
  profileCheckWords,
  postedDateText,
  paceLineText,
  paceWarningText,
  postingBlockedReason,
  postingRefusalText,
  splitIntoBlocks,
  voiceDeleteWords,
  voiceUsersWords,
  whenText,
} from "./wording"
import type { PostingState } from "@/server/social/posting"

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
      keywordScopeText({ term: "a tool", postCount: 15, subreddits: [], timeWindow: "week" })
    ).toBe("15 posts · Past week · All of Reddit")
  })

  it("names the subreddits when there are some", () => {
    expect(
      keywordScopeText({
        term: "a tool",
        postCount: 1,
        subreddits: ["SaaS", "founder"],
        timeWindow: "day",
      })
    ).toBe("1 post · Past day · r/SaaS, r/founder")
  })

  it("says what a watch watches instead of an empty pair of quotes", () => {
    const watch = { term: "", postCount: 25, subreddits: ["SaaS"], timeWindow: "week" }
    expect(keywordTitle(watch)).toBe("r/SaaS")
    expect(keywordScopeText(watch)).toBe("Watching · 25 posts · Newest first")
    expect(findsHeading(watch)).toBe("New posts in r/SaaS")
    expect(findsHeading({ term: "a tool", subreddits: [] })).toBe('"a tool"')
    expect(findsHeading(null)).toBe("Everything")
  })
})

describe("why posting is off", () => {
  const ready = {
    handle: "a_persona",
    blocked: false,
    reason: "",
    profile: { id: "p1", name: "Main" },
    phone: null,
    posting: null,
  }
  const read = { thread: { body: "", replies: [] } }

  it("asks for the replies to be read first", () => {
    expect(postingBlockedReason(ready, { thread: null })?.text).toContain(
      "Read the replies first"
    )
  })

  it("says to sign in, naming the profile", () => {
    const reason = postingBlockedReason({ ...ready, handle: null }, read)
    expect(reason?.text).toBe(
      "The browser is not signed in to Reddit. Open the profile Main on the Browser profiles dashboard and sign in once."
    )
  })

  it("names what Reddit is asking and the profile to clear it in", () => {
    const reason = postingBlockedReason(
      { ...ready, blocked: true, reason: "a captcha is on screen" },
      read
    )
    expect(reason?.text).toBe(
      "Reddit is asking the browser something: a captcha is on screen. Open the profile Main on the Browser profiles dashboard and clear it."
    )
  })

  it("sends a person to the Accounts dashboard when the account has no profile", () => {
    const reason = postingBlockedReason({ ...ready, profile: null }, read)
    expect(reason?.text).toContain("on the Accounts dashboard")
  })

  it("sends a person to the phone's screen for an account on a phone", () => {
    const phone = { id: "f1", name: "Pixel 8a", shelfSlot: "", status: "connected" as const, offlineReason: "", inUse: false, addressStop: "" }
    const reason = postingBlockedReason({ ...ready, profile: null, phone, handle: null }, read)
    expect(reason?.text).toBe(
      "The phone is not signed in to Reddit. Open the screen of Pixel 8a on the Phones dashboard and sign in once."
    )
    expect(postingBlockedReason({ ...ready, profile: null, phone }, read)).toBeNull()
  })

  it("says to pick an account beside Post before one is picked", () => {
    expect(postingBlockedReason(null, read)?.text).toBe("Pick an account beside Post comment.")
  })

  it("is off when everything is ready", () => {
    expect(postingBlockedReason(ready, read)).toBeNull()
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

describe("who uses a voice", () => {
  it("names the accounts, signed in or not", () => {
    expect(
      voiceUsersWords([
        { platform: "reddit", handle: "a_persona" },
        { platform: "reddit", handle: "" },
      ])
    ).toBe("Used by Reddit u/a_persona and a Reddit account.")
    expect(voiceUsersWords([])).toBe("No account uses it yet.")
  })

  it("says what deleting does to them", () => {
    expect(voiceDeleteWords([{ platform: "reddit", handle: "a_persona" }])).toBe(
      "Reddit u/a_persona loses it, and will draft plainly, never mentioning what you make, until given another voice in Settings."
    )
  })
})

describe("how old the account is", () => {
  it("counts days, then months, then years", () => {
    expect(accountAgeText(daysAgo(1), NOW)).toBe("1 day old")
    expect(accountAgeText(daysAgo(12), NOW)).toBe("12 days old")
    expect(accountAgeText(daysAgo(150), NOW)).toBe("4 months old")
    expect(accountAgeText(daysAgo(3 * 365 + 10), NOW)).toBe("3 years old")
  })
})

describe("what a stranger sees of the profile", () => {
  const check = {
    handle: "a_persona",
    signedInStatus: 200,
    signedInFound: true,
    signedOutStatus: 200,
    signedOutFound: true,
    suspended: false,
    readAt: NOW.toISOString(),
  }

  it("says plainly when a stranger can see it", () => {
    expect(profileCheckWords(check)).toEqual({
      text: "A signed-out visitor can see u/a_persona.",
      concern: false,
    })
  })

  it("describes the shadowban pattern without calling it one for certain", () => {
    const words = profileCheckWords({ ...check, signedOutStatus: 404, signedOutFound: false })
    expect(words.concern).toBe(true)
    expect(words.text).toContain("loads for you, but Reddit told a signed-out visitor it does not exist")
    expect(words.text).toContain("Reddit never confirms one")
    expect(words.text).not.toMatch(/\bis shadowbanned\b/)
  })

  it("says a refusal tells nothing either way", () => {
    expect(
      profileCheckWords({ ...check, signedOutStatus: 403, signedOutFound: false }).text
    ).toBe("Reddit refused the signed-out request (status 403), so this reading says nothing either way.")
    expect(profileCheckWords({ ...check, signedOutStatus: 0, signedOutFound: false })).toEqual({
      text: "The signed-out request got no answer, so this reading says nothing either way.",
      concern: false,
    })
  })

  it("names a suspension and a profile missing both ways", () => {
    expect(profileCheckWords({ ...check, suspended: true }).text).toBe(
      "Reddit marks u/a_persona as suspended."
    )
    expect(
      profileCheckWords({
        ...check,
        signedInStatus: 404,
        signedInFound: false,
        signedOutStatus: 404,
        signedOutFound: false,
      }).text
    ).toBe('Reddit answered "not found" for u/a_persona both signed in and signed out.')
  })
})

describe("why the account may not comment yet", () => {
  const now = new Date("2026-10-12T12:00:00Z")
  const free: PostingState = {
    paused: null,
    timeZone: "UTC",
    awake: true,
    nextWakeAt: null,
    warmUp: { endsAt: null, ageUnknown: false },
    young: true,
    lastHour: 0,
    lastDay: 0,
    warnPerHour: 4,
    youngPerHour: 2,
    youngPerDay: 6,
    limit: null,
    waiting: [],
  }

  it("has nothing to say when the account may comment", () => {
    expect(postingRefusalText(free, now, "UTC")).toBeNull()
  })

  it("names the day and time a warm-up ends", () => {
    const state = { ...free, warmUp: { endsAt: new Date("2026-10-14T09:12:00Z"), ageUnknown: false } }
    expect(postingRefusalText(state, now, "UTC")).toBe(
      "This account is still warming up. Its first comment is allowed on Wed 14 Oct at 9:12 UTC time."
    )
  })

  it("says when a young account's next comment is allowed", () => {
    const state = { ...free, limit: { limit: "hour" as const, nextAllowedAt: new Date("2026-10-12T12:40:00Z") } }
    expect(postingRefusalText(state, now, "UTC")).toBe(
      "A young account may send 2 comments an hour, and this one has. The next one is allowed today at 12:40 UTC time."
    )
    // Once that time has passed, it is no longer a reason.
    expect(postingRefusalText(state, new Date("2026-10-12T12:41:00Z"), "UTC")).toBeNull()
  })

  it("puts the pace in plain counts and warns past the hour's number", () => {
    expect(paceLineText({ lastHour: 1, lastDay: 11 })).toBe("1 comment in the last hour, 11 today.")
    expect(paceWarningText({ lastHour: 3, warnPerHour: 4 })).toBeNull()
    expect(paceWarningText({ lastHour: 4, warnPerHour: 4 })).toBe(
      "That would be the 5th comment this hour. New accounts get banned for less."
    )
    expect(paceWarningText({ lastHour: 10, warnPerHour: 4 })).toContain("the 11th comment")
  })

  it("says today, tomorrow, or the date, naming a clock it was given", () => {
    expect(whenText(new Date("2026-10-12T18:05:00Z"), now, "UTC")).toBe("today at 18:05 UTC time")
    expect(whenText(new Date("2026-10-13T08:00:00Z"), now, "UTC")).toBe("tomorrow at 8:00 UTC time")
    // Midnight in Toronto is still the 12th there.
    expect(whenText(new Date("2026-10-13T03:00:00Z"), now, "America/Toronto")).toBe(
      "today at 23:00 America/Toronto time"
    )
  })
})
