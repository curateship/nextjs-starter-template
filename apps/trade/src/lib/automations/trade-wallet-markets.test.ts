import { describe, expect, it } from "vitest"

import type { AutomationGraph } from "@/lib/automations/graph"
import { tradeMarketsNode } from "@/lib/automations/nodes/trade-markets"
import { marketsStepFollowingWallet } from "@/lib/automations/trade-wallet-markets"

function graph(settings: Record<string, unknown>): AutomationGraph {
  return {
    nodes: [
      {
        id: "markets-1",
        kind: tradeMarketsNode.kind,
        x: 0,
        y: 0,
        settings: {
          ...tradeMarketsNode.createSettings(),
          ...settings,
        } as AutomationGraph["nodes"][number]["settings"],
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

describe("the Markets step following a picked wallet", () => {
  it("moves to Aster and clears coins from the old exchange", () => {
    const moved = marketsStepFollowingWallet({
      graph: graph({
        protocol: "binance",
        marketKeys: ["binance:mainnet:BTC", "binance:mainnet:ETH"],
      }),
      protocol: "aster",
      network: "mainnet",
      previousWallet: null,
    })

    expect(moved?.cleared).toBe(2)
    expect(moved?.node.settings).toMatchObject({
      protocol: "aster",
      folderId: null,
      folderName: null,
      folderCount: null,
      marketKeys: [],
    })
  })

  it("clears Aster testnet markets when a mainnet wallet is picked", () => {
    const moved = marketsStepFollowingWallet({
      graph: graph({
        protocol: "aster",
        marketKeys: ["aster:testnet:BTC"],
      }),
      protocol: "aster",
      network: "mainnet",
      previousWallet: {
        protocol: "aster",
        network: "testnet",
      },
    })

    expect(moved?.cleared).toBe(1)
    expect(moved?.node.settings.marketKeys).toEqual([])
  })

  it("clears an Aster folder when the picked wallet changes network", () => {
    const moved = marketsStepFollowingWallet({
      graph: graph({
        protocol: "aster",
        folderId: "testnet-folder",
        folderName: "Testnet coins",
        folderCount: 3,
        marketKeys: [],
      }),
      protocol: "aster",
      network: "mainnet",
      previousWallet: {
        protocol: "aster",
        network: "testnet",
      },
    })

    expect(moved?.cleared).toBe(3)
    expect(moved?.node.settings).toMatchObject({
      folderId: null,
      folderName: null,
      folderCount: null,
    })
  })

  it("keeps markets when the wallet venue already agrees", () => {
    expect(
      marketsStepFollowingWallet({
        graph: graph({
          protocol: "aster",
          marketKeys: ["aster:mainnet:BTC"],
        }),
        protocol: "aster",
        network: "mainnet",
        previousWallet: {
          protocol: "aster",
          network: "mainnet",
        },
      })
    ).toBeNull()
  })
})
