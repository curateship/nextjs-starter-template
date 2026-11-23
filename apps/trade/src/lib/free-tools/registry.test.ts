import { describe, expect, it } from "vitest"

import { pageForPath } from "@/lib/pages/page-registry"

import {
  FREE_TOOLS,
  filterFreeToolsByName,
  groupFreeTools,
  shippedFreeTools,
  type FreeTool,
} from "./registry"

function tool(overrides: Partial<FreeTool>): FreeTool {
  return {
    id: "leverage",
    name: "Leverage calculator",
    summary: "One line.",
    group: "calculators",
    path: "/tools/leverage",
    shipped: true,
    ...overrides,
  }
}

describe("the free tools list", () => {
  it("gives every tool its own id and its own address", () => {
    const ids = FREE_TOOLS.map((entry) => entry.id)
    const paths = FREE_TOOLS.map((entry) => entry.path)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(paths).size).toBe(paths.length)
    for (const entry of FREE_TOOLS) {
      expect(entry.path.startsWith("/")).toBe(true)
      expect(entry.name).not.toBe("")
      expect(entry.summary).not.toBe("")
    }
  })

  // The sitemap lists every declared public page, so a declared page for an
  // unshipped tool would reach search engines; a shipped tool with no page
  // would be a card that opens a 404.
  it("declares a public page for a tool exactly when it has shipped", () => {
    for (const entry of FREE_TOOLS) {
      expect(
        pageForPath(entry.path) !== null,
        `${entry.id} is shipped: ${entry.shipped}`
      ).toBe(entry.shipped)
    }
  })

  it("leaves a tool that has not shipped off the page", () => {
    const shown = shippedFreeTools([
      tool({ id: "leverage", shipped: true }),
      tool({ id: "grid-bot", path: "/tools/grid-bot", shipped: false }),
    ])
    expect(shown.map((entry) => entry.id)).toEqual(["leverage"])
  })
})

describe("searching the tools", () => {
  const tools = [
    tool({ id: "leverage", name: "Leverage calculator" }),
    tool({ id: "whales", name: "Whale trades", group: "market" }),
  ]

  it("matches part of a name, ignoring case and outer spaces", () => {
    expect(
      filterFreeToolsByName(tools, "  WHALE ").map((entry) => entry.id)
    ).toEqual(["whales"])
  })

  it("keeps every tool when the box is empty", () => {
    expect(filterFreeToolsByName(tools, "   ")).toEqual(tools)
  })

  it("matches the name only, not the summary", () => {
    expect(filterFreeToolsByName(tools, "one line")).toEqual([])
  })
})

describe("grouping the tools", () => {
  it("keeps the page's group order and drops a group with no tools", () => {
    const groups = groupFreeTools([
      tool({ id: "alert", group: "alerts" }),
      tool({ id: "leverage", group: "calculators" }),
    ])
    expect(groups.map((group) => group.label)).toEqual([
      "Calculators",
      "Alerts",
    ])
  })
})
