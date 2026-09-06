import { describe, expect, it } from "vitest"

import {
  isMemberEvent,
  MEMBER_EVENTS,
  MEMBER_EVENT_LABELS,
  memberEventNode,
  readMemberEvent,
} from "./member-event"

describe("member event trigger", () => {
  it("names every lifecycle choice plainly", () => {
    for (const event of MEMBER_EVENTS) {
      expect(memberEventNode.name({ event })).toBe(MEMBER_EVENT_LABELS[event])
      expect(isMemberEvent(event)({ event })).toBe(true)
    }
  })

  it("does not guess when saved settings are unreadable", () => {
    expect(readMemberEvent({ event: "something-else" })).toBeNull()
    expect(isMemberEvent("registered")({ event: "something-else" })).toBe(false)
  })
})
