import { describe, expect, it } from "vitest"

import type { AutomationDetail } from "@/lib/api/automations"

import {
  buildAutomationSettingsSave,
  parseAutomationBacktestSettings,
} from "./automation-settings"

const detail: AutomationDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Original",
  type: "Day Trading",
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
  backtest: {
    startingEquity: 10_000,
    takerFeeBps: 4.5,
    makerFeeBps: 1.5,
    slippageBps: 0,
  },
  compiledConfig: null,
  errors: [],
  created_at: "2026-07-11T00:00:00.000Z",
  updated_at: "2026-07-11T00:00:00.000Z",
}

const backtestValues = {
  startingEquity: "25000",
  takerFeeBps: "10",
  makerFeeBps: "1.5",
  slippageBps: "2",
}

// Spread into every settings-values fixture below so `type` is always present
// (the buildAutomationSettingsSave signature now requires it).
const baseValues = { ...backtestValues, type: "Swing Trading" }

describe("buildAutomationSettingsSave", () => {
  it("updates settings without replacing the saved canvas graph", () => {
    const result = buildAutomationSettingsSave(detail, {
      name: "  Updated setup  ",
      interval: "1h",
      takeProfitPct: "6.5",
      stopLossPct: "2",
      ...baseValues,
    })

    expect(result).toEqual({
      payload: {
        automationId: detail.id,
        name: "Updated setup",
        type: "Swing Trading",
        interval: "1h",
        graph: detail.graph,
        protection: { takeProfitPct: 6.5, stopLossPct: 2 },
        backtest: {
          startingEquity: 25_000,
          takerFeeBps: 10,
          makerFeeBps: 1.5,
          slippageBps: 2,
        },
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
        ...baseValues,
      }).payload?.protection
    ).toEqual({})

    expect(
      buildAutomationSettingsSave(detail, {
        name: "Updated setup",
        interval: "1h",
        takeProfitPct: "5",
        stopLossPct: "-1",
        ...baseValues,
      })
    ).toEqual({
      payload: null,
      error: "Stop loss must be greater than 0% and no more than 100%.",
    })
  })

  it("rejects invalid backtest amounts", () => {
    expect(
      buildAutomationSettingsSave(detail, {
        name: "Updated setup",
        interval: "1h",
        takeProfitPct: "",
        stopLossPct: "",
        ...baseValues,
        startingEquity: "0",
      }).error
    ).toContain("Starting capital")

    expect(
      buildAutomationSettingsSave(detail, {
        name: "Updated setup",
        interval: "1h",
        takeProfitPct: "",
        stopLossPct: "",
        ...baseValues,
        takerFeeBps: "51",
      }).error
    ).toContain("Taker fee")
  })
})

describe("parseAutomationBacktestSettings", () => {
  it("parses valid values and rejects empty or out-of-range fields", () => {
    expect(parseAutomationBacktestSettings(backtestValues)).toEqual({
      backtest: {
        startingEquity: 25_000,
        takerFeeBps: 10,
        makerFeeBps: 1.5,
        slippageBps: 2,
      },
      error: null,
    })

    expect(
      parseAutomationBacktestSettings({ ...backtestValues, slippageBps: "" })
        .error
    ).toContain("Slippage")
    expect(
      parseAutomationBacktestSettings({
        ...backtestValues,
        makerFeeBps: "-1",
      }).error
    ).toContain("Maker fee")
  })
})
