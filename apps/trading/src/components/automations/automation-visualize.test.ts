import { describe, expect, it } from "vitest"

import type { AutomationNode } from "@/lib/automations/automation"
import { DEFAULT_QFL_SETTINGS } from "@/lib/automations/qfl"

import { nodeAfterLineDrag } from "./automation-visualize-panel"

const tp: AutomationNode = { id: "tp1", kind: "takeProfit", pct: 2, x: 0, y: 0 }
const sl: AutomationNode = { id: "sl1", kind: "stopLoss", pct: 1.5, x: 0, y: 0 }
const qfl: AutomationNode = {
  id: "q1",
  kind: "qfl",
  ...DEFAULT_QFL_SETTINGS,
  x: 0,
  y: 0,
}
const nodes = [tp, sl, qfl]
const bases = new Map([["q1", 200]])

describe("nodeAfterLineDrag", () => {
  it("maps a dropped TP line to the % above the entry anchor", () => {
    const next = nodeAfterLineDrag(nodes, "viz:tp:tp1", 103, 100, bases)
    expect(next).toEqual({ ...tp, pct: 3 })
  })

  it("maps a dropped SL line to the % below the entry anchor", () => {
    const next = nodeAfterLineDrag(nodes, "viz:sl:sl1", 97.5, 100, bases)
    expect(next).toEqual({ ...sl, pct: 2.5 })
  })

  it("maps the QFL crack line to the % below the current base", () => {
    const next = nodeAfterLineDrag(nodes, "viz:qfl-crack:q1", 190, 100, bases)
    expect(next).toEqual({ ...qfl, crackPct: 5 })
  })

  it("clamps drops past a setting's schema bounds", () => {
    // TP dragged BELOW entry would be a negative target: clamp to the minimum.
    expect(nodeAfterLineDrag(nodes, "viz:tp:tp1", 90, 100, bases)).toEqual({
      ...tp,
      pct: 0.1,
    })
    // SL dragged to a fraction of entry: 99.9% loss clamps to 95.
    expect(nodeAfterLineDrag(nodes, "viz:sl:sl1", 0.1, 100, bases)).toEqual({
      ...sl,
      pct: 95,
    })
    // Crack dragged far below the base clamps to the schema's 50% max.
    expect(nodeAfterLineDrag(nodes, "viz:qfl-crack:q1", 10, 100, bases)).toEqual(
      { ...qfl, crackPct: 50 }
    )
  })

  it("rounds to 2 decimals", () => {
    const next = nodeAfterLineDrag(nodes, "viz:tp:tp1", 102.4567, 100, bases)
    expect(next).toEqual({ ...tp, pct: 2.46 })
  })

  it("ignores unknown lines, missing anchors, and bad prices", () => {
    expect(nodeAfterLineDrag(nodes, "viz:entry", 100, 100, bases)).toBeNull()
    expect(nodeAfterLineDrag(nodes, "viz:tp:nope", 103, 100, bases)).toBeNull()
    expect(nodeAfterLineDrag(nodes, "viz:tp:tp1", 103, null, bases)).toBeNull()
    expect(nodeAfterLineDrag(nodes, "viz:tp:tp1", 0, 100, bases)).toBeNull()
    // The non-draggable ladder lines never map to a node update.
    expect(nodeAfterLineDrag(nodes, "viz:qfl-1:q1", 150, 100, bases)).toBeNull()
    expect(
      nodeAfterLineDrag(nodes, "viz:qfl-crack:q1", 190, 100, new Map())
    ).toBeNull()
  })
})
