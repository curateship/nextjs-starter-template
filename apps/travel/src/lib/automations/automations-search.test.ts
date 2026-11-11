import { describe, expect, it } from "vitest"

import { readAutomationsSearch } from "@/lib/automations/automations-search"

/** Each section reads only its own keys, and a hand-edited address falls back. */
describe("readAutomationsSearch", () => {
  it("reads an open flow's canvas, its Runs tab and the step picked", () => {
    expect(
      readAutomationsSearch({ tab: "automations", open: "flow-1", full: "1", pane: "runs", run: "run-1", node: "n2" })
    ).toMatchObject({ tab: "automations", open: "flow-1", full: true, pane: "runs", run: "run-1", node: "n2" })
  })

  it("drops the canvas keys when no canvas is open", () => {
    const search = readAutomationsSearch({ open: "flow-1", pane: "runs", run: "run-1", node: "n2" })
    expect(search).toMatchObject({ open: "flow-1" })
    expect(search.pane).toBeUndefined()
    expect(search.run).toBeUndefined()
    expect(search.node).toBeUndefined()
  })

  it("opens a template's canvas only for a template that exists, with no Runs tab", () => {
    expect(readAutomationsSearch({ template: "nope" }).template).toBeUndefined()
    const known = readAutomationsSearch({ template: "welcome-members", full: "1", pane: "runs" })
    expect(known.template).toBe("welcome-members")
    expect(known.full).toBeUndefined()
    expect(known.pane).toBeUndefined()
  })

  it("reads Waiting on you's own keys only", () => {
    expect(readAutomationsSearch({ tab: "waiting", open: "run-1", q: "bo", full: "1", node: "n1" })).toEqual({
      tab: "waiting",
      open: "run-1",
      q: "bo",
    })
  })

  it("sends a remembered Runs section address to Automations, now that runs live on each flow", () => {
    expect(readAutomationsSearch({ tab: "runs", open: "run-1" }).tab).toBeUndefined()
  })
})
