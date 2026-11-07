import { describe, expect, it } from "vitest"

import { cleanNoteBody } from "@/lib/trade/note-blocks"
import {
  defaultExchangePage,
  pageKindOf,
  defaultTradePage,
  readPageBody,
  storedTradePage,
} from "@/lib/trade/trade-pages"

describe("a trade page", () => {
  it("starts the exchange's page with all seven blocks, in order", () => {
    expect(
      defaultTradePage("exchange")
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

  it("starts the All markets page empty", () => {
    expect(defaultTradePage("shared")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    })
  })

  it("names its two pages by their stored keys", () => {
    expect(pageKindOf("")).toBe("exchange")
    expect(pageKindOf("*")).toBe("shared")
  })

  it("keeps a page emptied on purpose empty", () => {
    expect(readPageBody("").content ?? []).toEqual([])
  })

  it("drops the Market info block, which became a tooltip", () => {
    expect(
      cleanNoteBody({
        type: "doc",
        content: [{ type: "noteRules" }, { type: "noteMarketInfo" }],
      }).content
    ).toEqual([{ type: "noteRules" }])
  })

  it("stores a page of blocks alone, and nothing for an empty page", () => {
    expect(
      JSON.parse(storedTradePage(JSON.stringify(defaultExchangePage()))).content
        .length
    ).toBeGreaterThanOrEqual(7)
    expect(storedTradePage(JSON.stringify({ type: "doc", content: [] }))).toBe(
      ""
    )
  })

  it("keeps the values Trade's blocks never had out of the saved page", () => {
    expect(
      cleanNoteBody({
        type: "doc",
        content: [{ type: "noteGridTrades", attrs: { anything: 1 } }],
      }).content
    ).toEqual([{ type: "noteGridTrades" }])
  })
})
