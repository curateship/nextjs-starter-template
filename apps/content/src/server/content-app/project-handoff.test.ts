import { describe, expect, it } from "vitest"

import { handoffNoteApp } from "./project-handoff"

function note(body: unknown) {
  return `${Buffer.from(JSON.stringify(body)).toString("base64url")}.stamp`
}

describe("handoffNoteApp", () => {
  it("reads which app a Project note is for", () => {
    expect(handoffNoteApp(note({ v: 1, app: "video" }))).toBe("video")
    expect(handoffNoteApp(note({ v: 1, app: "promo" }))).toBe("promo")
  })

  it("answers null for anything else", () => {
    expect(handoffNoteApp("")).toBeNull()
    expect(handoffNoteApp("not-base64!.x")).toBeNull()
    expect(handoffNoteApp(note({ v: 1, app: "trade" }))).toBeNull()
    expect(handoffNoteApp(note({ v: 1 }))).toBeNull()
    expect(handoffNoteApp(note(null))).toBeNull()
  })
})
