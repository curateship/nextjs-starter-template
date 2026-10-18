import { describe, expect, it } from "vitest"

import type { AutomationNode } from "@/lib/automations/graph"

import {
  clampZoom,
  edgePath,
  fitViewport,
  flowBounds,
  MAX_ZOOM,
  MIN_ZOOM,
  nextNodePosition,
  NODE_HEIGHT,
  NODE_WIDTH,
  portIn,
  portOut,
  SNAP_DISTANCE,
  snapNodePosition,
} from "./canvas-model"

function node(id: string, x: number, y: number): AutomationNode {
  return { id, kind: "placeholder", x, y, settings: { note: "" } }
}

describe("canvas-model", () => {
  it("clamps zoom to the allowed range", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(50)).toBe(MAX_ZOOM)
    expect(clampZoom(1)).toBe(1)
  })

  it("computes flow bounds around every node", () => {
    const bounds = flowBounds([node("a", 10, 20), node("b", 200, 300)])
    expect(bounds).toEqual({
      minX: 10,
      minY: 20,
      maxX: 200 + NODE_WIDTH,
      maxY: 300 + NODE_HEIGHT,
    })
    expect(flowBounds([])).toBeNull()
  })

  describe("fitViewport", () => {
    // Every corner of every node, in screen coordinates.
    function screenBox(nodes: AutomationNode[], width: number, height: number) {
      const viewport = fitViewport(nodes, width, height)
      const bounds = flowBounds(nodes)!
      return {
        viewport,
        left: bounds.minX * viewport.zoom + viewport.x,
        top: bounds.minY * viewport.zoom + viewport.y,
        right: bounds.maxX * viewport.zoom + viewport.x,
        bottom: bounds.maxY * viewport.zoom + viewport.y,
      }
    }

    it("keeps a single node at 100% and centres it", () => {
      const { viewport, left, top, right, bottom } = screenBox(
        [node("a", 100, 50)],
        800,
        600
      )
      expect(viewport.zoom).toBe(1)
      expect(left + right).toBeCloseTo(800)
      expect(top + bottom).toBeCloseTo(600)
    })

    it("shrinks a wide flow until it fits the width", () => {
      const nodes = [node("a", 0, 0), node("b", 1200, 0)]
      const { viewport, left, right, top, bottom } = screenBox(nodes, 800, 600)
      expect(viewport.zoom).toBeLessThan(1)
      expect(left).toBeGreaterThanOrEqual(48 - 0.001)
      expect(right).toBeLessThanOrEqual(800 - 48 + 0.001)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(bottom).toBeLessThanOrEqual(600)
    })

    it("shrinks a tall flow until it fits the height", () => {
      const nodes = [node("a", 0, 0), node("b", 0, 1000)]
      const { viewport, left, right, top, bottom } = screenBox(nodes, 800, 600)
      expect(viewport.zoom).toBeLessThan(1)
      expect(top).toBeGreaterThanOrEqual(48 - 0.001)
      expect(bottom).toBeLessThanOrEqual(600 - 48 + 0.001)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(right).toBeLessThanOrEqual(800)
    })

    it("puts thirty nodes on screen in a narrow window", () => {
      const nodes = Array.from({ length: 30 }, (_, index) =>
        node(`n${index}`, (index % 3) * 320, Math.floor(index / 3) * 200)
      )
      const { viewport, left, right, top, bottom } = screenBox(nodes, 420, 700)
      expect(viewport.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
      expect(viewport.zoom).toBeLessThanOrEqual(MAX_ZOOM)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(right).toBeLessThanOrEqual(420)
      expect(bottom).toBeLessThanOrEqual(700)
    })

    it("never zooms past the limits, however cramped the window", () => {
      const nodes = [node("a", 0, 0), node("b", 40000, 40000)]
      expect(fitViewport(nodes, 200, 120).zoom).toBe(MIN_ZOOM)
    })

    it("parks at the padding origin with no nodes", () => {
      expect(fitViewport([], 800, 600)).toEqual({ x: 48, y: 48, zoom: 1 })
    })
  })

  it("anchors ports on the node edges", () => {
    const subject = node("a", 100, 100)
    expect(portIn(subject)).toEqual({ x: 100, y: 100 + NODE_HEIGHT / 2 })
    // A single "then" output sits at the vertical middle of the right edge.
    expect(portOut(subject, "then")).toEqual({
      x: 100 + NODE_WIDTH,
      y: 100 + NODE_HEIGHT / 2,
    })
    // Unknown ports fall back to the first port position instead of crashing.
    expect(portOut(subject, "nope").x).toBe(100 + NODE_WIDTH)
  })

  it("builds a cubic bezier between two points", () => {
    const path = edgePath({ x: 0, y: 0 }, { x: 100, y: 50 })
    expect(path.startsWith("M 0 0 C ")).toBe(true)
    expect(path.endsWith("100 50")).toBe(true)
  })

  describe("snapNodePosition", () => {
    const neighbour = node("a", 400, 200)

    it("lines a nearly-level node up on both axes", () => {
      const result = snapNodePosition(
        { x: 400 + SNAP_DISTANCE - 1, y: 200 - SNAP_DISTANCE + 1 },
        [neighbour],
        1
      )
      expect(result).toEqual({ x: 400, y: 200, guideX: 400, guideY: 200 })
    })

    it("leaves a node alone once it is past the pull distance", () => {
      const loose = { x: 400 + SNAP_DISTANCE + 1, y: 200 + SNAP_DISTANCE + 1 }
      expect(snapNodePosition(loose, [neighbour], 1)).toEqual({
        ...loose,
        guideX: null,
        guideY: null,
      })
    })

    it("snaps one axis without touching the other", () => {
      const result = snapNodePosition({ x: 402, y: 900 }, [neighbour], 1)
      expect(result).toEqual({ x: 400, y: 900, guideX: 400, guideY: null })
    })

    it("has nothing to line up against with no other nodes", () => {
      expect(snapNodePosition({ x: 12, y: 34 }, [], 1)).toEqual({
        x: 12,
        y: 34,
        guideX: null,
        guideY: null,
      })
    })

    it("picks the nearest of several neighbours", () => {
      const result = snapNodePosition(
        { x: 404, y: 0 },
        [node("a", 400, 0), node("b", 405, 0), node("c", 398, 0)],
        1
      )
      expect(result.x).toBe(405)
    })

    it("holds the pull at eight screen pixels however far the canvas is zoomed", () => {
      // Zoomed out to a quarter, eight screen pixels reach 32 canvas units.
      expect(
        snapNodePosition({ x: 424, y: 0 }, [node("a", 400, 0)], 0.25).x
      ).toBe(400)
      // Zoomed in to double, the same eight pixels reach only four units.
      expect(snapNodePosition({ x: 406, y: 0 }, [node("a", 400, 0)], 2).x).toBe(
        406
      )
    })

    it("survives a zoom of zero instead of dividing by it", () => {
      const result = snapNodePosition({ x: 401, y: 0 }, [node("a", 400, 0)], 0)
      expect(Number.isFinite(result.x)).toBe(true)
      expect(result.x).toBe(400)
    })
  })

  it("lays out new nodes in columns inside the visible viewport", () => {
    const viewport = { x: 0, y: 0, zoom: 1 }
    const first = nextNodePosition(0, viewport, 800)
    const second = nextNodePosition(1, viewport, 800)
    expect(first).toEqual({ x: 32, y: 32 })
    expect(second.y).toBe(first.y)
    expect(second.x).toBeGreaterThan(first.x)
    // A narrow canvas still yields at least one column.
    expect(nextNodePosition(3, viewport, 100).x).toBe(32)
  })
})
