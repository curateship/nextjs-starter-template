import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { tradeDcaNode } from "@/lib/automations/nodes/trade-dca"
import {
  defaultTradeGridSettings,
  tradeGridNode,
} from "@/lib/automations/nodes/trade-grid"
import { tradeMarketsNode } from "@/lib/automations/nodes/trade-markets"
import { tradeSignalsNode } from "@/lib/automations/nodes/trade-signals"
import { tradeWalletNode } from "@/lib/automations/nodes/trade-wallet"
import type { CustomShellDb } from "@/server/db"
import {
  customShellAutomations,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { tradeBacktestGroups } from "@/server/trade/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  flowNodesOf,
  flowStrategyProblem,
  runTradeFlow,
} from "@/server/trade/flow-start"

const NOW = 1_700_000_000_000

function compiled(gridSettings = tradeGridNode.createSettings()): {
  nodes: Record<string, { kind: string; settings: unknown }>
} {
  return {
    nodes: {
      wallet: {
        kind: tradeWalletNode.kind,
        settings: tradeWalletNode.createSettings(),
      },
      markets: {
        kind: tradeMarketsNode.kind,
        settings: {
          ...tradeMarketsNode.createSettings(),
          protocol: "hyperliquid",
          marketKeys: ["hyperliquid:mainnet:BTC"],
        },
      },
      strategy: {
        kind: tradeGridNode.kind,
        settings: gridSettings,
      },
    },
  }
}

describe("reading the Grid strategy from a flow", () => {
  let client: PGlite
  let database: CustomShellDb

  beforeEach(async () => {
    ;({ client, db: database } = await createTestDatabase())
  })

  afterEach(async () => {
    await client.close()
  })

  it("reads Grid as the flow's one strategy", () => {
    expect(flowNodesOf(compiled())).toMatchObject({
      strategy: {
        kind: "emaGrid",
        settings: tradeGridNode.createSettings(),
      },
    })
  })

  it("refuses a second strategy in the same drawing", () => {
    const config = compiled()
    config.nodes = {
      ...config.nodes,
      dca: {
        kind: tradeDcaNode.kind,
        settings: tradeDcaNode.createSettings(),
      },
      signals: {
        kind: tradeSignalsNode.kind,
        settings: tradeSignalsNode.createSettings(),
      },
    }

    expect(flowNodesOf(config)).toBeNull()
    expect(flowStrategyProblem(config)).toBe(
      "This flow has more than one strategy step. A flow trades one strategy, so delete the extra strategy step."
    )
  })

  it("starts a Grid backtest when the Wallet step uses pretend money", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    const defaults = defaultTradeGridSettings()
    const settings = {
      ...defaults,
      grid: {
        ...defaults.grid,
        levels: 3,
        manualSizing: true,
        manualRungPcts: [50, 30, 20],
        follow: true,
        followDown: true,
      },
    }
    await database.insert(customShellAutomations).values({
      id: "grid-flow",
      userId: user.id,
      workspaceId: workspace.id,
      name: "EMA Grid",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: compiled(settings) as never,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    })

    const outcome = await runTradeFlow(
      {
        id: "00000000-0000-4000-8000-000000000002",
        userId: user.id,
        automationId: "grid-flow",
        triggerKind: null,
      } as CustomShellAutomationRun,
      NOW
    )

    expect(outcome.summary).toContain("Backtest started over 1 coin")
    const [saved] = await database
      .select({ spec: tradeBacktestGroups.spec })
      .from(tradeBacktestGroups)
    expect(saved.spec).toMatchObject({
      interval: "4h",
      strategy: {
        kind: "emaGrid",
        settings: {
          grid: {
            levels: 3,
            manualSizing: true,
            manualRungPcts: [50, 30, 20],
            follow: true,
            followDown: true,
          },
        },
      },
    })
  })
})
