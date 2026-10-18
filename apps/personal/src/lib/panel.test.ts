import { describe, expect, it } from "vitest"

import { readPanelReport } from "@/lib/panel"

const frame = {}
const cms = "http://localhost:3015"

function message(data: unknown, overrides: { origin?: string; source?: unknown } = {}) {
  return {
    origin: overrides.origin ?? cms,
    source: (overrides.source ?? frame) as MessageEventSource,
    data,
  }
}

describe("the framed app's report", () => {
  it("is read when it comes from the open app and Personal's frame", () => {
    expect(
      readPanelReport(message({ type: "shell-panel", path: "/admin/posts", title: "Posts" }), cms, frame)
    ).toEqual({ path: "/admin/posts", title: "Posts", canGo: false })
  })

  it("says whether the app takes the change-page note", () => {
    const data = { type: "shell-panel", path: "/admin/posts", title: "Posts", canGo: true }
    expect(readPanelReport(message(data), cms, frame)?.canGo).toBe(true)
    expect(readPanelReport(message({ ...data, canGo: "yes" }), cms, frame)?.canGo).toBe(false)
  })

  it("is ignored from another address or another window", () => {
    const data = { type: "shell-panel", path: "/admin/posts", title: "Posts" }
    expect(readPanelReport(message(data, { origin: "http://localhost:3014" }), cms, frame)).toBeNull()
    expect(readPanelReport(message(data, { source: {} }), cms, frame)).toBeNull()
    expect(readPanelReport(message(data), cms, null)).toBeNull()
  })

  it("is ignored when it is not shaped like the shell's note", () => {
    for (const data of [
      null,
      "shell-panel",
      { type: "other", path: "/x", title: "" },
      { type: "shell-panel", path: "x", title: "" },
      { type: "shell-panel", path: "//evil.example/x", title: "" },
    ]) {
      expect(readPanelReport(message(data), cms, frame)).toBeNull()
    }
  })
})
