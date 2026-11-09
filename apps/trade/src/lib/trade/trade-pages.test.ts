import { describe, expect, it } from "vitest"

import { cleanNoteBody } from "@/lib/trade/note-blocks"
import {
  defaultTradePage,
  openedPageBody,
  PROTOCOLS_BLOCK_NODE,
  readPageBody,
  storedTradePage,
} from "@/lib/trade/trade-pages"

describe("the Trade dashboard's page", () => {
  it("starts with the Protocols block, then the six trading blocks, in order", () => {
    expect(
      defaultTradePage()
        .content?.map((node) => node.type)
        .slice(0, 7)
    ).toEqual([
      PROTOCOLS_BLOCK_NODE,
      "noteRules",
      "noteManualTrades",
      "noteGridTrades",
      "noteDcaTrades",
      "noteScanner",
      "noteFolders",
    ])
  })

  it("keeps a page emptied on purpose empty when it is read back", () => {
    expect(readPageBody("").content ?? []).toEqual([])
  })

  it("opens a page that lost its Protocols block with the block back at the top", () => {
    const opened = JSON.parse(
      openedPageBody(JSON.stringify({ type: "doc", content: [{ type: "noteRules" }] }))
    )
    expect(opened.content.map((node: { type: string }) => node.type)).toEqual([
      PROTOCOLS_BLOCK_NODE,
      "noteRules",
    ])
    // An emptied page still gets it, so the dashboard can always switch.
    expect(JSON.parse(openedPageBody("")).content).toEqual([{ type: PROTOCOLS_BLOCK_NODE }])
  })

  it("leaves the Protocols block where it was moved to, and drops a second one", () => {
    const moved = JSON.stringify({
      type: "doc",
      content: [{ type: "noteRules" }, { type: PROTOCOLS_BLOCK_NODE }, { type: PROTOCOLS_BLOCK_NODE }],
    })
    expect(JSON.parse(openedPageBody(moved)).content).toEqual([
      { type: "noteRules" },
      { type: PROTOCOLS_BLOCK_NODE },
    ])
  })

  it("drops the Market info block and the Alerts block, which moved elsewhere", () => {
    expect(
      cleanNoteBody({
        type: "doc",
        content: [{ type: "noteRules" }, { type: "noteMarketInfo" }, { type: "noteAlerts" }],
      }).content
    ).toEqual([{ type: "noteRules" }])
  })

  it("stores a page of blocks alone, and nothing for an empty page", () => {
    expect(
      JSON.parse(storedTradePage(JSON.stringify(defaultTradePage()))).content.length
    ).toBeGreaterThanOrEqual(7)
    expect(storedTradePage(JSON.stringify({ type: "doc", content: [] }))).toBe("")
  })

  it("keeps the values Trade's blocks never had out of the saved page", () => {
    expect(
      cleanNoteBody({
        type: "doc",
        content: [
          { type: "noteGridTrades", attrs: { anything: 1 } },
          { type: PROTOCOLS_BLOCK_NODE, attrs: { picked: "phemex" } },
        ],
      }).content
    ).toEqual([{ type: "noteGridTrades" }, { type: PROTOCOLS_BLOCK_NODE }])
  })
})
