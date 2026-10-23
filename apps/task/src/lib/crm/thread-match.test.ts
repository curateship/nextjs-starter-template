import { describe, expect, it } from "vitest"

import {
  normalizeSubject,
  parseFromHeader,
  parseMessageIds,
  threadCandidateIds,
  threadMatchCutoff,
} from "@/lib/crm/thread-match"

describe("normalizeSubject", () => {
  it("takes off a reply prefix however it is written", () => {
    expect(normalizeSubject("Re: Your quote")).toBe("your quote")
    expect(normalizeSubject("RE:Your quote")).toBe("your quote")
    expect(normalizeSubject("Fwd: Your quote")).toBe("your quote")
    expect(normalizeSubject("AW: Your quote")).toBe("your quote")
  })

  it("takes off a whole stack of them", () => {
    expect(normalizeSubject("Re: Fwd: Re: Your quote")).toBe("your quote")
  })

  it("takes off the numbered form some clients use", () => {
    expect(normalizeSubject("Re[2]: Your quote")).toBe("your quote")
  })

  it("stops after ten, so a mail loop cannot make it crawl", () => {
    const subject = `${"Re: ".repeat(500)}Your quote`
    expect(normalizeSubject(subject).endsWith("your quote")).toBe(true)
  })

  it("squeezes the spaces so two spellings of one subject agree", () => {
    expect(normalizeSubject("  Your   quote ")).toBe("your quote")
  })

  it("leaves a subject that only looks like a prefix alone", () => {
    expect(normalizeSubject("Revenue for March")).toBe("revenue for march")
  })

  it("answers an empty string for an empty subject", () => {
    expect(normalizeSubject("")).toBe("")
  })
})

describe("parseMessageIds", () => {
  it("reads one id out of its brackets", () => {
    expect(parseMessageIds("<abc@mail.example.com>")).toEqual([
      "abc@mail.example.com",
    ])
  })

  it("reads a whole References chain in order", () => {
    expect(parseMessageIds("<one@x> <two@x>\n <three@x>")).toEqual([
      "one@x",
      "two@x",
      "three@x",
    ])
  })

  it("accepts a bare id from a sender that wrote no brackets", () => {
    expect(parseMessageIds("abc@mail.example.com")).toEqual([
      "abc@mail.example.com",
    ])
  })

  it("answers nothing for nothing", () => {
    expect(parseMessageIds(null)).toEqual([])
    expect(parseMessageIds("")).toEqual([])
    expect(parseMessageIds("   ")).toEqual([])
  })
})

describe("threadCandidateIds", () => {
  it("asks about the direct parent first", () => {
    const ids = threadCandidateIds("<parent@x>", "<one@x> <two@x>")
    expect(ids[0]).toBe("parent@x")
  })

  it("walks the References chain backwards, newest first", () => {
    const ids = threadCandidateIds(null, "<one@x> <two@x> <three@x>")
    expect(ids).toEqual(["three@x", "two@x", "one@x"])
  })

  it("never asks about the same id twice", () => {
    const ids = threadCandidateIds("<same@x>", "<same@x> <other@x>")
    expect(ids).toEqual(["same@x", "other@x"])
  })

  it("stops at twenty, because the match is always near the end", () => {
    const chain = Array.from({ length: 50 }, (_, i) => `<id-${i}@x>`).join(" ")
    expect(threadCandidateIds(null, chain)).toHaveLength(20)
  })
})

describe("threadMatchCutoff", () => {
  it("reaches back thirty days", () => {
    const at = new Date("2026-10-02T12:00:00.000Z")
    expect(threadMatchCutoff(at).toISOString()).toBe(
      "2026-09-02T12:00:00.000Z"
    )
  })
})

describe("parseFromHeader", () => {
  it("splits a name and an address", () => {
    expect(parseFromHeader("Jane Smith <Jane@Example.com>")).toEqual({
      email: "jane@example.com",
      name: "Jane Smith",
    })
  })

  it("takes the quotes off a name that had to be quoted", () => {
    expect(parseFromHeader('"Smith, Jane" <jane@example.com>')).toEqual({
      email: "jane@example.com",
      name: "Smith, Jane",
    })
  })

  it("gives a bare address no name rather than a made-up one", () => {
    expect(parseFromHeader("jane@example.com")).toEqual({
      email: "jane@example.com",
      name: null,
    })
  })

  it("gives an empty name no name", () => {
    expect(parseFromHeader("  <jane@example.com>")).toEqual({
      email: "jane@example.com",
      name: null,
    })
  })
})
