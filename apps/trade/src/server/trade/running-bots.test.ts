import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { defaultDcaParams } from "@/lib/trade/dca"
import type { TradeFlowRunSpec } from "@/lib/trade/flow-run"
import { customShellAutomations } from "@/server/schema"
import type { CustomShellDb } from "@/server/db"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { listRunningBots } from "@/server/trade/running-bots"
import { tradeFlowRuns, tradeWallets } from "@/server/trade/schema"

const NOW = 1_700_000_000_000

function spec(
  protocol: TradeFlowRunSpec["protocol"],
  markets: string[]
): TradeFlowRunSpec {
  return {
    protocol,
    network: "mainnet",
    folderId: null,
    marketKeys: markets,
    strategy: { kind: "dca", params: defaultDcaParams(), interval: "4h" },
    capUsd: 500,
    walletLabel: "Practice",
    real: false,
  }
}

describe("the exchange dashboard's running bots", () => {
  let client: PGlite
  let database: CustomShellDb

  beforeEach(async () => {
    ;({ client, db: database } = await createTestDatabase())
  })

  afterEach(async () => {
    await client.close()
  })

  it("returns only this person's switched-on bots for the chosen protocol", async () => {
    const person = await insertUser(database)
    const stranger = await insertUser(database)
    const workspace = await insertWorkspace(database)
    const strangerWorkspace = await insertWorkspace(database)

    await database.insert(customShellAutomations).values([
      {
        id: "flow-hyperliquid",
        userId: person.id,
        workspaceId: workspace.id,
        name: "Buy the dip",
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        compiledConfig: null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      },
      {
        id: "flow-aster",
        userId: person.id,
        workspaceId: workspace.id,
        name: "Trade Aster",
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        compiledConfig: null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      },
      {
        id: "flow-stopped",
        userId: person.id,
        workspaceId: workspace.id,
        name: "Stopped bot",
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        compiledConfig: null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      },
      {
        id: "flow-stranger",
        userId: stranger.id,
        workspaceId: strangerWorkspace.id,
        name: "Somebody else's bot",
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        compiledConfig: null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      },
    ])

    await database.insert(tradeWallets).values([
      {
        userId: person.id,
        id: "hyper-wallet",
        label: "Practice",
        kind: "paper",
        status: "active",
        protocol: "hyperliquid",
        network: "mainnet",
        startingBalance: 10_000,
      },
      {
        userId: person.id,
        id: "aster-wallet",
        label: "Aster",
        kind: "paper",
        status: "active",
        protocol: "aster",
        network: "mainnet",
        startingBalance: 10_000,
      },
      {
        userId: person.id,
        id: "cross-user-name-wallet",
        label: "Second practice wallet",
        kind: "paper",
        status: "active",
        protocol: "hyperliquid",
        network: "mainnet",
        startingBalance: 10_000,
      },
      {
        userId: stranger.id,
        id: "stranger-wallet",
        label: "Stranger",
        kind: "paper",
        status: "active",
        protocol: "hyperliquid",
        network: "mainnet",
        startingBalance: 10_000,
      },
    ])

    await database.insert(tradeFlowRuns).values([
      {
        userId: person.id,
        id: "run-hyperliquid",
        walletId: "hyper-wallet",
        automationId: "flow-hyperliquid",
        status: "running",
        spec: spec("hyperliquid", [
          "hyperliquid:mainnet:BTC",
          "hyperliquid:mainnet:ETH",
        ]),
        startedAt: new Date(NOW),
        updatedAt: new Date(NOW),
      },
      {
        userId: person.id,
        id: "run-aster",
        walletId: "aster-wallet",
        automationId: "flow-aster",
        status: "running",
        spec: spec("aster", ["aster:mainnet:BTCUSDT"]),
        startedAt: new Date(NOW + 1),
        updatedAt: new Date(NOW + 1),
      },
      {
        userId: person.id,
        id: "run-stopped",
        walletId: "hyper-wallet",
        automationId: "flow-stopped",
        status: "stopped",
        spec: spec("hyperliquid", ["hyperliquid:mainnet:SOL"]),
        startedAt: new Date(NOW - 1),
        stoppedAt: new Date(NOW),
        updatedAt: new Date(NOW),
      },
      {
        userId: stranger.id,
        id: "run-stranger",
        walletId: "stranger-wallet",
        automationId: "flow-stranger",
        status: "running",
        spec: spec("hyperliquid", ["hyperliquid:mainnet:XMR"]),
        startedAt: new Date(NOW),
        updatedAt: new Date(NOW),
      },
      {
        userId: person.id,
        id: "run-cross-user-name",
        walletId: "cross-user-name-wallet",
        automationId: "flow-stranger",
        status: "running",
        spec: spec("hyperliquid", ["hyperliquid:mainnet:SOL"]),
        startedAt: new Date(NOW + 2),
        updatedAt: new Date(NOW + 2),
      },
    ])

    await expect(
      listRunningBots(person.id, "hyperliquid", database)
    ).resolves.toEqual([
      {
        runId: "run-cross-user-name",
        automationId: "flow-stranger",
        name: "This flow has been deleted",
        strategy: "DCA ladder",
        marketCount: 1,
        workingCount: 0,
        holdingCount: 0,
        netUsd: 0,
        tradesClosed: 0,
        walletLabel: "Second practice wallet",
        real: false,
        startedAt: NOW + 2,
        paused: false,
        stopping: false,
      },
      {
        runId: "run-hyperliquid",
        automationId: "flow-hyperliquid",
        name: "Buy the dip",
        strategy: "DCA ladder",
        marketCount: 2,
        workingCount: 0,
        holdingCount: 0,
        netUsd: 0,
        tradesClosed: 0,
        walletLabel: "Practice",
        real: false,
        startedAt: NOW,
        paused: false,
        stopping: false,
      },
    ])
  })
})
