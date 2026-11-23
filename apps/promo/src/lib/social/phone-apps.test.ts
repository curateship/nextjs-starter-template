import { describe, expect, it } from "vitest"

import { phoneStepRefusal } from "@/lib/phones/options"

import { aNetwork, handleWords } from "./networks"
import { captionProblem, countWords, hashtagCount, replyMax } from "./phone-apps"

describe("Instagram and TikTok limits", () => {
  it("counts hashtags the way the app does", () => {
    expect(hashtagCount("Night mode #study #studytok and #1")).toBe(3)
    expect(hashtagCount("no tags here, not#this")).toBe(0)
  })

  it("refuses a caption past the network's length or Instagram's 30 hashtags, saying which", () => {
    expect(captionProblem("instagram", "x".repeat(2_200))).toBeNull()
    expect(captionProblem("instagram", "x".repeat(2_201))).toContain("Instagram allows 2,200")
    expect(captionProblem("tiktok", "x".repeat(4_000))).toBeNull()
    const tags = Array.from({ length: 31 }, (_, index) => `#t${index}`).join(" ")
    expect(captionProblem("instagram", tags)).toContain("31 hashtags")
    expect(captionProblem("tiktok", tags)).toBeNull()
  })

  it("lets an answer be as long as its kind allows on its network", () => {
    expect(replyMax("message", "reddit")).toBe(1_000)
    expect(replyMax("comment", "tiktok")).toBe(150)
    expect(replyMax("comment", "instagram")).toBe(2_200)
  })

  it("writes counts as people do, and an unread one as a dash", () => {
    expect([countWords(null), countWords(999), countWords(1_234), countWords(12_345), countWords(123_456)]).toEqual([
      "-",
      "999",
      "1,234",
      "12.3k",
      "123k",
    ])
  })

  it("names accounts and networks the way each network does", () => {
    expect([handleWords("reddit", "a"), handleWords("instagram", "b"), handleWords("tiktok", "")]).toEqual(["u/a", "@b", ""])
    expect([aNetwork("instagram"), aNetwork("tiktok", true)]).toEqual(["an Instagram", "A TikTok"])
  })

  it("lets a phone take Instagram's and TikTok's steps and refuses any other app step", () => {
    expect(phoneStepRefusal("instagram/post", "Pixel 8a")).toBeNull()
    expect(phoneStepRefusal("tiktok/reply", "Pixel 8a")).toBeNull()
    expect(phoneStepRefusal("reddit/reply_message", "Pixel 8a")).toBeNull()
    expect(phoneStepRefusal("instagram/follow", "Pixel 8a")).toContain("Pixel 8a cannot do instagram/follow yet")
    expect(phoneStepRefusal("reddit/reply", "Pixel 8a")).toContain("answering a reply")
  })

  it("lets a phone take X's app steps and refuses X's browser-only ones", () => {
    for (const routine of ["x/state", "x/quick_state", "x/reply", "x/quote", "x/publish", "x/follow", "x/warm_up", "x/inbox", "x/reply_message"]) {
      expect(phoneStepRefusal(routine, "Pixel 8a")).toBeNull()
    }
    expect(phoneStepRefusal("x/edit", "Pixel 8a")).toBe(
      "Pixel 8a cannot do editing an X post: on a phone, the X app reads who is signed in, replies, quotes, posts, follows, warms up, and reads and answers messages. Searches, reading posts again, edits, deletes, lists and sign-in codes are done in a browser. Nothing was sent."
    )
    expect(phoneStepRefusal("x/search", "Pixel 8a")).toContain("cannot do searching X")
  })

  it("lets a phone take LinkedIn's app steps and refuses LinkedIn's browser-only ones", () => {
    for (const routine of [
      "linkedin/state",
      "linkedin/quick_state",
      "linkedin/comment",
      "linkedin/publish",
      "linkedin/connect",
      "linkedin/invites",
      "linkedin/accept",
      "linkedin/warm_up",
      "linkedin/inbox",
      "linkedin/reply_message",
    ]) {
      expect(phoneStepRefusal(routine, "Pixel 8a")).toBeNull()
    }
    expect(phoneStepRefusal("linkedin/viewers", "Pixel 8a")).toBe(
      "Pixel 8a cannot do reading who viewed the profile: on a phone, the LinkedIn app reads who is signed in, comments, posts with words and a picture, sends and accepts connection requests, warms up, and reads and answers messages. Who viewed the profile, the account's numbers, its own feed, searches, reading posts again, edits, deletes, newsletters and the emailed sign-in code are done in a browser. Nothing was sent."
    )
    expect(phoneStepRefusal("linkedin/newsletter", "Pixel 8a")).toContain("cannot do publishing a newsletter issue")
  })
})
