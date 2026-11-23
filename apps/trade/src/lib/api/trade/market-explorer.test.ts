import { describe, expect, it, vi } from "vitest"
import type { MarketCatalog, ProtocolId } from "@/lib/protocols/contracts"
import { defaultExplorerPrefs } from "@/lib/trade/market-explorer"

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  selected: ["aster", "phemex"] as ProtocolId[],
}))
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler:
        <T>(
          fn: (input: {
            data: { protocol?: ProtocolId }
            context: { user: { id: string } }
          }) => T
        ) =>
        (input: { data: { protocol?: ProtocolId } }) =>
          fn({ ...input, context: { user: { id: "account" } } }),
    }
    return builder
  },
}))
vi.mock("@/server/guards", () => ({ userGet: {}, userPost: {} }))
vi.mock("@/server/protocols/market-catalog", () => ({
  loadRawMarketCatalog: mocks.fetch,
}))
vi.mock("@/server/protocols/registry", () => ({
  listProtocols: () => [
    {
      id: "aster",
      label: "Aster",
      networks: ["mainnet"],
      capabilities: { markets: true, orders: true },
    },
    {
      id: "phemex",
      label: "Phemex",
      networks: ["mainnet"],
      capabilities: { markets: true, orders: true },
    },
    {
      id: "lighter",
      label: "Lighter",
      networks: ["testnet"],
      capabilities: { markets: true, orders: false },
    },
  ],
}))
vi.mock("@/server/trade/market-explorer", () => ({
  loadExplorerPrefs: async () => ({
    prefs: {
      ...defaultExplorerPrefs(),
      current: { ...defaultExplorerPrefs().current, exchanges: mocks.selected },
    },
    minimumVolume: 100,
  }),
  saveExplorerPrefs: vi.fn(),
}))
vi.mock("@/lib/api/trade/markets", () => ({
  getMarketsErrorMessage: () => "The exchange did not answer.",
}))

import { loadMarketExplorer } from "./market-explorer"

describe("the mainnet market fan-out", () => {
  it("streams a fast venue before a slow failure and omits venues without mainnet", async () => {
    let reject!: (error: Error) => void
    const slow = new Promise<MarketCatalog>((_, fail) => {
      reject = fail
    })
    mocks.fetch
      .mockImplementationOnce(() =>
        Promise.resolve({
          protocol: "aster",
          protocolLabel: "Aster",
          network: "mainnet",
          rows: [],
        })
      )
      .mockImplementationOnce(() => slow)
    const result = await loadMarketExplorer()
    expect(result.venues.map((venue) => venue.protocol)).toEqual([
      "aster",
      "phemex",
    ])
    expect((await result.venues[0].answer).catalog?.protocol).toBe("aster")
    reject(new Error("down"))
    expect(await result.venues[1].answer).toMatchObject({
      protocolLabel: "Phemex",
      catalog: null,
      message: "The exchange did not answer.",
    })
    expect(mocks.fetch).not.toHaveBeenCalledWith("lighter", expect.anything())
  })
  it("retries only the requested venue", async () => {
    mocks.fetch.mockClear().mockResolvedValue({
      protocol: "aster",
      protocolLabel: "Aster",
      network: "mainnet",
      rows: [],
    })
    const result = await loadMarketExplorer("aster")
    await result.venues[0].answer
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("aster", "mainnet")
  })
})

it("omits switched-off exchanges from initial requests while retaining their picker choices", async () => {
  mocks.selected = ["aster"]
  mocks.fetch.mockClear().mockResolvedValue({ protocol: "aster", rows: [] })
  const result = await loadMarketExplorer()
  await Promise.all(result.venues.map((venue) => venue.answer))
  expect(result.availableVenues.map((venue) => venue.protocol)).toEqual([
    "aster",
    "phemex",
  ])
  expect(result.venues.map((venue) => venue.protocol)).toEqual(["aster"])
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("aster", "mainnet")
  mocks.selected = []
  mocks.fetch.mockClear()
  expect((await loadMarketExplorer()).venues).toEqual([])
  expect(mocks.fetch).not.toHaveBeenCalled()
  // Explicitly enabling a venue can fetch before the debounced preference save finishes.
  const enabled = await loadMarketExplorer("phemex")
  await enabled.venues[0].answer
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("phemex", "mainnet")
  mocks.selected = ["aster", "phemex"]
})
