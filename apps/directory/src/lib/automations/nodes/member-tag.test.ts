import { describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import { EMPTY_AUTOMATION_GRAPH } from "@/lib/automations/graph"
import { memberTagWording } from "@/lib/automations/nodes/member-tag"

function compile(settings: Record<string, string>) {
  return compileAutomationGraph({
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [{ id: "tag", kind: "memberTag", x: 0, y: 0, settings }],
  })
}

describe("Member tag node", () => {
  it("requires one tag", () => {
    expect(compile({ mode: "add", tag: "" }).errors[0]?.message).toContain(
      "Enter the tag"
    )
  })

  it("normalizes the compiled tag to lowercase", () => {
    expect(
      compile({ mode: "add", tag: "  Beta User  " }).config?.nodes.tag.settings
    ).toEqual({ mode: "add", tag: "beta user" })
    expect(compile({ mode: "add", tag: "beta,vip" }).config).toBeNull()
  })

  it("describes both changes plainly", () => {
    expect(memberTagWording("add", "beta")).toBe("Add the “beta” tag")
    expect(memberTagWording("remove", "at-risk")).toBe(
      "Remove the “at-risk” tag"
    )
  })
})
