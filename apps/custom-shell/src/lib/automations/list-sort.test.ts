import { describe, expect, it } from "vitest"

import type { AutomationListItem } from "@/lib/api/automations/automations"
import { compareAutomationSteps } from "./list-sort"

function item(
  nodeCount: number,
  summary: string,
  isValid = true
): AutomationListItem {
  return {
    id: summary,
    name: summary,
    summary,
    isValid,
    nodeCount,
    enabled: false,
    paused_reason: null,
    trigger_name: null,
    can_run_manually: false,
    next_run_at: null,
    updated_at: "2026-01-01T00:00:00.000Z",
  }
}

describe("compareAutomationSteps", () => {
  const flows = [
    item(10, "10 steps"),
    item(0, "Empty draft", false),
    item(2, "2 steps"),
    item(3, "Needs attention", false),
  ]

  it("sorts valid step counts as numbers and leaves word states at the end", () => {
    expect(
      [...flows]
        .sort((left, right) => compareAutomationSteps(left, right, "asc"))
        .map((flow) => flow.summary)
    ).toEqual(["2 steps", "10 steps", "Empty draft", "Needs attention"])
  })

  it("reverses the numbers without mixing in word states", () => {
    expect(
      [...flows]
        .sort((left, right) => compareAutomationSteps(left, right, "desc"))
        .map((flow) => flow.summary)
    ).toEqual(["10 steps", "2 steps", "Empty draft", "Needs attention"])
  })
})
