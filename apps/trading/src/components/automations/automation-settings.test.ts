import { describe, expect, it } from "vitest"

import type { AutomationDetail } from "@/lib/api/automations"

import { buildAutomationSettingsSave } from "./automation-settings"

const detail: AutomationDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Original",
  interval: "15m",
  graph: {
    nodes: [
      {
        id: "buy",
        kind: "action",
        action: "buy",
        targetEquityPct: 25,
        x: 100,
        y: 100,
      },
    ],
    edges: [],
    viewport: { x: 12, y: 24, zoom: 1.25 },
  },
  protection: { takeProfitPct: 4 },
  compiledConfig: null,
  errors: [],
  created_at: "2026-07-11T00:00:00.000Z",
  updated_at: "2026-07-11T00:00:00.000Z",
}

describe("buildAutomationSettingsSave", () => {
  it("updates settings without replacing the saved canvas graph", () => {
    const result = buildAutomationSettingsSave(detail, {
      name: "  Updated setup  ",
      interval: "1h",
      takeProfitPct: "6.5",
      stopLossPct: "2",
    })

    expect(result).toEqual({
      payload: {
        automationId: detail.id,
        name: "Updated setup",
        interval: "1h",
        graph: detail.graph,
        protection: { takeProfitPct: 6.5, stopLossPct: 2 },
      },
      error: null,
    })
  })

  it("clears optional protection and rejects invalid percentages", () => {
    expect(
      buildAutomationSettingsSave(detail, {
        name: "Updated setup",
        interval: "1h",
        takeProfitPct: "",
        stopLossPct: "",
      }).payload?.protection
    ).toEqual({})

    expect(
      buildAutomationSettingsSave(detail, {
        name: "Updated setup",
        interval: "1h",
        takeProfitPct: "5",
        stopLossPct: "-1",
      })
    ).toEqual({
      payload: null,
      error: "Stop loss must be greater than 0% and no more than 100%.",
    })
  })
})
