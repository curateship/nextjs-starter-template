import { describe, expect, it } from "vitest"

import { pageWithBlockMoved } from "./page-body"

const page = JSON.stringify({
  type: "doc",
  content: [{ type: "dashboards" }, { type: "paragraph" }, { type: "plans" }],
})
const order = (stored: string) =>
  (JSON.parse(stored) as { content: { type: string }[] }).content.map((node) => node.type)

describe("pageWithBlockMoved", () => {
  it("swaps a block with the line above it", () => {
    expect(order(pageWithBlockMoved(page, "plans", -1))).toEqual(["dashboards", "plans", "paragraph"])
  })

  it("swaps a block with the line below it", () => {
    expect(order(pageWithBlockMoved(page, "dashboards", 1))).toEqual(["paragraph", "dashboards", "plans"])
  })

  it("leaves the page alone when nothing is on that side", () => {
    expect(pageWithBlockMoved(page, "dashboards", -1)).toBe(page)
    expect(pageWithBlockMoved(page, "plans", 1)).toBe(page)
  })

  it("leaves the page alone when the block is not on it", () => {
    expect(pageWithBlockMoved(page, "inbox", 1)).toBe(page)
  })
})
