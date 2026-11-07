import { describe, expect, it } from "vitest"

import { cleanNoteBody } from "@/lib/trade/note-blocks"
import {
  defaultExchangePage,
  defaultMarketPage,
  readTradePage,
  storedTradePage,
} from "@/lib/trade/trade-pages"

describe("a trade page", () => {
  it("starts the exchange's page with all seven blocks, in order", () => {
    expect(
      readTradePage(null, "exchange")
        .content?.map((node) => node.type)
        .slice(0, 7)
    ).toEqual([
      "noteRules",
      "noteManualTrades",
      "noteGridTrades",
      "noteDcaTrades",
      "noteAlerts",
      "noteScanner",
      "noteFolders",
    ])
  })

  it("starts a market's page with its Market info block", () => {
    expect(readTradePage(null, "market")).toEqual(defaultMarketPage())
  })

  it("keeps a page emptied on purpose empty", () => {
    expect(readTradePage("", "exchange").content ?? []).toEqual([])
  })

  it("keeps each page's own blocks and drops the other page's", () => {
    const both = {
      type: "doc",
      content: [{ type: "noteRules" }, { type: "noteMarketInfo" }],
    }
    expect(cleanNoteBody(both, "exchange").content).toEqual([
      { type: "noteRules" },
    ])
    expect(cleanNoteBody(both, "market").content).toEqual([
      { type: "noteMarketInfo" },
    ])
  })

  it("stores a page of blocks alone, and nothing for an empty page", () => {
    expect(
      JSON.parse(
        storedTradePage(JSON.stringify(defaultExchangePage()), "exchange")
      ).content.length
    ).toBeGreaterThanOrEqual(7)
    expect(
      storedTradePage(JSON.stringify({ type: "doc", content: [] }), "market")
    ).toBe("")
  })

  it("keeps the values Trade's blocks never had out of the saved page", () => {
    expect(
      cleanNoteBody(
        {
          type: "doc",
          content: [{ type: "noteGridTrades", attrs: { anything: 1 } }],
        },
        "exchange"
      ).content
    ).toEqual([{ type: "noteGridTrades" }])
  })
})
