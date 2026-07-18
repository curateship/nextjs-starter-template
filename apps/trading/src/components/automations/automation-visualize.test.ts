import { describe, expect, it } from "vitest"

import type { AutomationNode } from "@/lib/automations/automation"
import { DEFAULT_QFL_SETTINGS } from "@/lib/automations/qfl"

import {
  nodeAfterLineDrag,
  nodeAfterTuneDrag,
} from "./automation-visualize-panel"

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

describe("nodeAfterTuneDrag", () => {
  it("maps long-side stop/TP drags against the entry anchor", () => {
    expect(
      nodeAfterTuneDrag(nodes, { kind: "tp", price: 105, anchor: 100, side: "long" })
    ).toEqual({ ...tp, pct: 5 })
    expect(
      nodeAfterTuneDrag(nodes, { kind: "sl", price: 95, anchor: 100, side: "long" })
    ).toEqual({ ...sl, pct: 5 })
  })

  it("inverts the math for short positions", () => {
    // A short takes profit BELOW entry and stops out ABOVE it.
    expect(
      nodeAfterTuneDrag(nodes, { kind: "tp", price: 95, anchor: 100, side: "short" })
    ).toEqual({ ...tp, pct: 5 })
    expect(
      nodeAfterTuneDrag(nodes, { kind: "sl", price: 103, anchor: 100, side: "short" })
    ).toEqual({ ...sl, pct: 3 })
  })

  it("maps a first-ladder drag back to the crack percentage", () => {
    expect(
      nodeAfterTuneDrag(nodes, { kind: "qflCrack", price: 190, base: 200 })
    ).toEqual({ ...qfl, crackPct: 5 })
  })

  it("clamps to each setting's schema bounds", () => {
    // Dragging the stop to the wrong side of entry clamps at the 0.1 floor.
    expect(
      nodeAfterTuneDrag(nodes, { kind: "sl", price: 150, anchor: 100, side: "long" })
    ).toEqual({ ...sl, pct: 0.1 })
    expect(
      nodeAfterTuneDrag(nodes, { kind: "qflCrack", price: 10, base: 200 })
    ).toEqual({ ...qfl, crackPct: 50 })
  })

  it("returns null without a matching node, anchor, or valid price", () => {
    expect(
      nodeAfterTuneDrag([qfl], { kind: "tp", price: 105, anchor: 100, side: "long" })
    ).toBeNull()
    expect(
      nodeAfterTuneDrag(nodes, { kind: "tp", price: 105, anchor: 0, side: "long" })
    ).toBeNull()
    expect(
      nodeAfterTuneDrag(nodes, { kind: "qflCrack", price: 0, base: 200 })
    ).toBeNull()
    expect(
      nodeAfterTuneDrag([tp, sl], { kind: "qflCrack", price: 190, base: 200 })
    ).toBeNull()
  })
})
