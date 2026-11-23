import { describe, expect, it } from "vitest"

import type { AutomationNode } from "@/lib/automations/automation"
import {
  DEFAULT_MARKET_SCANNER_SETTINGS,
} from "@/lib/automations/dca-ladder"

import {
  canConnectNodes,
  edgePath,
  fitViewport,
  flowBounds,
  NODE_HEIGHT,
  NODE_WIDTH,
  nodeOutputPorts,
  nextNodePosition,
  portIn,
  portOut,
} from "./canvas-model"

const indicator: AutomationNode = {
  id: "ema",
  kind: "indicator",
  x: 100,
  y: 50,
  indicator: { type: "ema_cross", params: { fast: 20, slow: 50 } },
}

const longNode: AutomationNode = {
  id: "long",
  kind: "action",
  action: "buy",
  targetEquityPct: 10,
  x: 0,
  y: 0,
}

describe("Automation canvas model", () => {
  it("exposes stable named ports for every node kind", () => {
    expect(nodeOutputPorts(indicator)).toEqual([
      { id: "bullish", label: "Bullish" },
      { id: "trend", label: "Trend" },
      { id: "bearish", label: "Bearish" },
    ])
    expect(
      nodeOutputPorts({ id: "and", kind: "logic", op: "and", x: 0, y: 0 })
    ).toEqual([{ id: "match", label: "Match" }])
    expect(
      nodeOutputPorts({
        id: "buy",
        kind: "action",
        action: "buy",
        targetEquityPct: 10,
        x: 0,
        y: 0,
      })
    ).toEqual([{ id: "then", label: "Then" }])
    expect(
      nodeOutputPorts({ id: "lb", kind: "lookback", bars: 48, x: 0, y: 0 })
    ).toEqual([{ id: "trend", label: "Trend" }])
    expect(
      nodeOutputPorts({
        id: "wall",
        kind: "whaleWall",
        minUsd: 500_000,
        relativeSize: 5,
        maxDistancePct: 0.5,
        confirmationMs: 2_000,
        x: 0,
        y: 0,
      })
    ).toEqual([
      { id: "bidWall", label: "Bid Wall" },
      { id: "askWall", label: "Ask Wall" },
    ])
    expect(
      nodeOutputPorts({
        id: "scanner",
        kind: "marketScanner",
        ...DEFAULT_MARKET_SCANNER_SETTINGS,
        x: 0,
        y: 0,
      })
    ).toEqual([{ id: "markets", label: "Markets" }])
  })

  it("anchors named outputs and inputs to the node edges", () => {
    expect(portOut(indicator, "bullish")).toEqual({ x: 380, y: 74 })
    expect(portOut(indicator, "trend")).toEqual({ x: 380, y: 94 })
    expect(portOut(indicator, "bearish")).toEqual({ x: 380, y: 114 })
    expect(portIn(indicator)).toEqual({ x: 100, y: 94 })
  })

  const dcaNode = {
    id: "dca",
    kind: "dca",
    rungs: [{ deviation: 5 }],
    maxPositionPct: 25,
    sizeMultiplier: 2,
    compound: true,
    rungEntry: "market",
    requireTwoGreen: false,
    trendFilterEnabled: false,
    trendMaBars: 200,
    exitOnTrendBreak: false,
    x: 0,
    y: 0,
  } satisfies AutomationNode

  it("allows a Trend input into the DCA ladder", () => {
    expect(canConnectNodes(indicator, "trend", dcaNode)).toBe(true)
  })

  it("connects Market Scanner only to the DCA ladder", () => {
    const scanner = {
      id: "scanner",
      kind: "marketScanner",
      ...DEFAULT_MARKET_SCANNER_SETTINGS,
      x: 0,
      y: 0,
    } satisfies AutomationNode
    expect(canConnectNodes(scanner, "markets", dcaNode)).toBe(true)
    expect(canConnectNodes(scanner, "markets", longNode)).toBe(false)
  })

  it("builds a curved path and fits nodes from the top-left at 90% zoom", () => {
    const action: AutomationNode = {
      id: "buy",
      kind: "action",
      action: "buy",
      targetEquityPct: 25,
      x: 500,
      y: 250,
    }
    expect(edgePath(portOut(indicator, "bullish"), portIn(action))).toContain(
      "C"
    )
    expect(flowBounds([indicator, action])).toEqual({
      minX: 100,
      minY: 50,
      maxX: 780,
      maxY: 338,
    })

    const viewport = fitViewport([indicator, action], 1000, 600)
    expect(viewport).toEqual({ x: -42, y: 3, zoom: 0.9 })
  })

  it("places new nodes on a visible non-overlapping grid", () => {
    const viewport = { x: -100, y: -50, zoom: 1 }
    const first = nextNodePosition(0, viewport, 700)
    const second = nextNodePosition(1, viewport, 700)
    const third = nextNodePosition(2, viewport, 700)

    expect(second.x - first.x).toBeGreaterThan(NODE_WIDTH)
    expect(third.x).toBe(first.x)
    expect(third.y - first.y).toBeGreaterThan(NODE_HEIGHT)
  })
})
