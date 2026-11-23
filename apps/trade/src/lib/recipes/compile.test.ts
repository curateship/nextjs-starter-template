import { describe, expect, it } from "vitest"

import type { AutomationGraph } from "@/lib/automations/graph"
import { tradeDcaNode } from "@/lib/recipes/trade-dca"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import { tradeWalletNode } from "@/lib/recipes/trade-wallet"
import {
  compileRecipeGraph,
  recipeCompiledConfigSchema,
} from "@/lib/recipes/compile"
import {
  RECIPE_NODE_DESCRIPTORS,
  RECIPE_PALETTE_ITEMS,
} from "@/lib/recipes/registry"

function recipeGraph(): AutomationGraph {
  return {
    nodes: [
      {
        id: "wallet",
        kind: tradeWalletNode.kind,
        x: 0,
        y: 0,
        settings: tradeWalletNode.createSettings(),
      },
      {
        id: "markets",
        kind: tradeMarketsNode.kind,
        x: 240,
        y: 0,
        settings: tradeMarketsNode.createSettings(),
      },
      {
        id: "dca",
        kind: tradeDcaNode.kind,
        x: 480,
        y: 0,
        settings: tradeDcaNode.createSettings(),
      },
    ],
    edges: [
      { id: "one", from: "wallet", sourcePort: "then", to: "markets" },
      { id: "two", from: "markets", sourcePort: "then", to: "dca" },
    ],
    viewport: { x: 0, y: 0, zoom: 0.9 },
  }
}

describe("the recipe registry", () => {
  it("contains only the five trade steps", () => {
    expect(RECIPE_NODE_DESCRIPTORS.map((node) => node.kind)).toEqual([
      "tradeWallet",
      "tradeMarkets",
      "tradeDca",
      "tradeSignals",
      "tradeGrid",
    ])
    expect(RECIPE_PALETTE_ITEMS).toHaveLength(5)
  })
})

describe("recipe compilation", () => {
  it("rejects a stored shell step", () => {
    expect(
      recipeCompiledConfigSchema.safeParse({
        v: 1,
        kind: "automation",
        nodes: { shell: { kind: "sendEmail", settings: {} } },
        edges: [],
      }).success
    ).toBe(false)
  })

  it("compiles a wallet, markets and DCA drawing", () => {
    const result = compileRecipeGraph(recipeGraph())
    expect(result.errors).toEqual([])
    expect(result.config?.nodes).toHaveProperty("wallet.kind", "tradeWallet")
    expect(result.config?.nodes).toHaveProperty("dca.kind", "tradeDca")
  })

  it("refuses two strategy steps of the same kind", () => {
    const graph = recipeGraph()
    graph.nodes.push({
      id: "second-dca",
      kind: tradeDcaNode.kind,
      x: 720,
      y: 0,
      settings: tradeDcaNode.createSettings(),
    })

    const result = compileRecipeGraph(graph)

    expect(result.config).toBeNull()
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "invalid_settings",
        nodeId: "second-dca",
        message: expect.stringContaining("one strategy"),
      })
    )
  })

  it("refuses Trade steps that are not connected in order", () => {
    const graph = recipeGraph()
    graph.edges = graph.edges.filter((edge) => edge.to !== "dca")

    const result = compileRecipeGraph(graph)

    expect(result.config).toBeNull()
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "invalid_edge",
        nodeId: "dca",
        message: expect.stringContaining("Markets"),
      })
    )
  })

  it("refuses a shell automation step", () => {
    const graph = recipeGraph()
    graph.nodes[2] = {
      id: "email",
      kind: "sendEmail",
      x: 480,
      y: 0,
      settings: {},
    }
    const result = compileRecipeGraph(graph)
    expect(result.config).toBeNull()
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "unknown_node", nodeId: "email" })
    )
  })
})
