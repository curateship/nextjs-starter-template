import { describe, expect, it } from "vitest"

import { describeLeadView } from "./lead-views"
import { buildLeads, leadGroupCounts, readLeadView, shownLeads, type LeadCard, type LeadChat } from "./leads"

const day = (n: number) => new Date(Date.UTC(2099, 0, n, 12))

function card(id: string, patch: Partial<LeadCard> = {}): LeadCard {
  return { id, name: id, age: 30, photoId: null, score: 70, swipe: "none", swipedBy: null, swipedAt: null, readAt: day(1), sample: false, ...patch }
}

function chat(id: string, patch: Partial<LeadChat> = {}): LeadChat {
  return {
    id,
    profileId: null,
    theirName: id,
    photoId: null,
    lastLine: "",
    lastMessageAt: null,
    matchedAt: day(2),
    unreadCount: 0,
    hasDraft: false,
    draftSendsItself: false,
    flagged: null,
    messagesFromThem: 0,
    messagesFromUs: 0,
    unmatchedBy: null,
    ended: false,
    movedToText: false,
    aiOff: false,
    dateAccepted: false,
    dateAt: null,
    datePlace: "",
    trend: "too_early",
    sample: false,
    ...patch,
  }
}

describe("buildLeads", () => {
  it("makes one lead of a card and its chat, keyed by the card, and a lead of a chat whose card was never read", () => {
    const leads = buildLeads(
      [card("Ana", { swipe: "like", swipedBy: "ai" }), card("Bea")],
      [chat("m-ana", { profileId: "Ana", theirName: "Ana", messagesFromThem: 1 }), chat("m-cleo", { theirName: "Cleo" })]
    )
    expect(leads).toHaveLength(3)
    const ana = leads.find((lead) => lead.name === "Ana")
    expect(ana).toMatchObject({ id: "Ana", profileId: "Ana", matchId: "m-ana", status: "chatting", swipedBy: "ai", score: 70 })
    expect(leads.find((lead) => lead.name === "Cleo")).toMatchObject({ id: "m-cleo", profileId: null, status: "matched" })
    expect(leads.find((lead) => lead.name === "Bea")).toMatchObject({ matchId: null, status: "new" })
  })

  it("never gives two leads one id, and keeps a card the dashboard did not read in", () => {
    const leads = buildLeads(
      [card("Ana")],
      [chat("m-1", { profileId: "Ana", theirName: "Ana" }), chat("m-2", { profileId: "Ana", theirName: "Ana" }), chat("m-3", { profileId: "far", theirName: "Bo" })]
    )
    expect(new Set(leads.map((lead) => lead.id)).size).toBe(leads.length)
    expect(leads.find((lead) => lead.matchId === "m-2")).toMatchObject({ id: "m-2", profileId: null })
    expect(leads.find((lead) => lead.matchId === "m-3")).toMatchObject({ id: "far", profileId: "far", score: null })
  })

  it("gives each lead the status a person would", () => {
    const leads = buildLeads(
      [card("new"), card("liked", { swipe: "super" }), card("passed", { swipe: "pass" })],
      [
        chat("date", { dateAccepted: true, messagesFromThem: 4 }),
        chat("ended", { ended: true }),
        chat("moved", { movedToText: true, dateAccepted: true }),
        chat("gone", { unmatchedBy: "them", dateAccepted: true }),
      ]
    )
    const status = Object.fromEntries(leads.map((lead) => [lead.name, [lead.status, lead.overWhy]]))
    expect(status).toEqual({
      new: ["new", null],
      liked: ["liked", null],
      passed: ["passed", null],
      date: ["date", null],
      ended: ["over", "ended"],
      moved: ["over", "moved"],
      gone: ["over", "unmatched-them"],
    })
    // An unmatched chat is not on the Dates tab, even though they once said yes.
    expect(leads.find((lead) => lead.name === "gone")?.dateAccepted).toBe(false)
  })

  it("says what a chat waits on the member for, and a draft the AI sends by itself waits on nobody", () => {
    const leads = buildLeads(
      [],
      [
        chat("draft", { hasDraft: true }),
        chat("automated", { hasDraft: true, draftSendsItself: true }),
        chat("taken-over", { hasDraft: true, aiOff: true }),
        chat("question", { flagged: "missing_fact", hasDraft: true }),
        chat("flag", { flagged: "asked_if_bot" }),
        chat("over", { flagged: "scam", ended: true }),
      ]
    )
    const waiting = Object.fromEntries(leads.map((lead) => [lead.name, lead.waiting]))
    expect(waiting).toEqual({ draft: "draft", automated: null, "taken-over": null, question: "question", flag: "flag", over: null })
  })
})

describe("shownLeads", () => {
  const leads = buildLeads(
    [
      card("old", { readAt: day(1), score: 90 }),
      card("swiped", { swipe: "like", swipedBy: "member", swipedAt: day(3), score: 55 }),
      card("sample", { readAt: day(4), sample: true, score: null }),
    ],
    [chat("waiting", { matchedAt: day(2), hasDraft: true }), chat("done", { matchedAt: day(5), ended: true }), chat("yes", { matchedAt: day(6), dateAccepted: true })]
  )
  const names = (view: Parameters<typeof shownLeads>[1]) => shownLeads(leads, view).map((lead) => lead.name)

  it("puts leads waiting on the member first, then the newest change, and hides over leads", () => {
    expect(names({})).toEqual(["waiting", "yes", "sample", "swiped", "old"])
  })

  it("shows over leads with Show over or the Over group", () => {
    expect(names({ over: true })).toContain("done")
    expect(names({ group: "over" })).toEqual(["done"])
  })

  it("narrows by tab, group, who swiped, score, samples and search", () => {
    expect(names({ tab: "matches" })).toEqual(["waiting", "yes"])
    expect(names({ tab: "dates" })).toEqual(["yes"])
    expect(names({ group: "waiting" })).toEqual(["waiting"])
    expect(names({ by: "member" })).toEqual(["swiped"])
    expect(names({ score: 80 })).toEqual(["old"])
    expect(names({ real: true })).not.toContain("sample")
    expect(names({ q: "SWI" })).toEqual(["swiped"])
  })

  it("sorts by score with unscored last, and by name either way", () => {
    expect(names({ sort: "score" })).toEqual(["old", "swiped", "yes", "sample", "waiting"])
    expect(names({ sort: "name" })).toEqual(["old", "sample", "swiped", "waiting", "yes"])
    expect(names({ sort: "name", direction: "desc" })).toEqual(["yes", "waiting", "swiped", "sample", "old"])
  })

  it("counts each group for the left panel", () => {
    expect(leadGroupCounts(leads)).toMatchObject({ waiting: 1, new: 2, liked: 1, matched: 1, date: 1, over: 1 })
  })
})

describe("readLeadView", () => {
  it("keeps checked values and leaves the defaults out, so one view is one address", () => {
    expect(readLeadView({ tab: "all", sort: "changed", direction: "desc", over: false })).toEqual({})
    expect(readLeadView({ tab: "dates", q: "  hiking ", group: "waiting", by: "ai", score: "80", over: "true", real: true, sort: "name", direction: "asc" })).toEqual({
      tab: "dates",
      q: "hiking",
      group: "waiting",
      by: "ai",
      score: 80,
      over: true,
      sort: "name",
      real: true,
    })
  })

  it("drops values it does not know", () => {
    expect(readLeadView({ tab: "profiles", group: "everyone", by: "them", score: 75, sort: "age", direction: "up" })).toEqual({})
  })

  it("describes a view in words for the Views menu", () => {
    expect(describeLeadView({ tab: "matches", group: "waiting", score: 80, sort: "score" })).toBe("Matches · Waiting on you · 80 or more · Sort: Score")
    expect(describeLeadView({})).toBe("Every lead")
  })
})
