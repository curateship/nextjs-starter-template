import { describe, expect, it } from "vitest"

import {
  appPanelHref,
  findConnectedApp,
  panelFrameSrc,
  readPanelReport,
} from "@/lib/personal/app-panels"

const project = findConnectedApp("project")!
const frame = {}

function message(data: unknown, overrides: { origin?: string; source?: unknown } = {}) {
  return {
    origin: overrides.origin ?? "http://localhost:3020",
    source: (overrides.source ?? frame) as MessageEventSource,
    data,
  }
}

describe("app panels", () => {
  it("knows Project and nothing made up", () => {
    expect(project.address).toBe("http://localhost:3020")
    expect(findConnectedApp("nope")).toBeNull()
  })

  it("turns Personal's address into the framed page and back", () => {
    expect(panelFrameSrc(project, "/dashboard")).toBe(
      "http://localhost:3020/dashboard?panel=1"
    )
    expect(panelFrameSrc(project, "/")).toBe("http://localhost:3020/?panel=1")
    expect(appPanelHref("project", "/dashboard")).toBe("/apps/project/dashboard")
    expect(appPanelHref("project", "/")).toBe("/apps/project")
  })

  it("keeps the framed page on the app's own address", () => {
    expect(panelFrameSrc(project, "//evil.example/x")).toBe(
      "http://localhost:3020//evil.example/x?panel=1"
    )
    expect(new URL(panelFrameSrc(project, "//evil.example/x")).origin).toBe(
      "http://localhost:3020"
    )
    expect(panelFrameSrc(project, "/a b/c?d")).toBe(
      "http://localhost:3020/a%20b/c%3Fd?panel=1"
    )
  })

  it("reads the frame's report", () => {
    expect(
      readPanelReport(
        message({ type: "shell-panel", path: "/projects", title: "Projects" }),
        project,
        frame
      )
    ).toEqual({ path: "/projects", title: "Projects" })
    expect(
      readPanelReport(
        message({ type: "shell-panel", path: "/a%20b", title: 7 }),
        project,
        frame
      )
    ).toEqual({ path: "/a b", title: "" })
  })

  it("ignores a report from another address or another window", () => {
    const data = { type: "shell-panel", path: "/projects", title: "Projects" }
    expect(
      readPanelReport(message(data, { origin: "http://localhost:3014" }), project, frame)
    ).toBeNull()
    expect(readPanelReport(message(data, { source: {} }), project, frame)).toBeNull()
    expect(readPanelReport(message(data), project, null)).toBeNull()
  })

  it("ignores anything not shaped like the shell's note", () => {
    for (const data of [
      null,
      "shell-panel",
      { type: "other", path: "/x", title: "" },
      { type: "shell-panel", path: "x", title: "" },
      { type: "shell-panel", path: 3, title: "" },
    ]) {
      expect(readPanelReport(message(data), project, frame)).toBeNull()
    }
  })
})
