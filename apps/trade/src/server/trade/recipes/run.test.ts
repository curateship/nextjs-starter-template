import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { tradeDcaNode } from "@/lib/recipes/trade-dca"
import {
  defaultTradeGridSettings,
  tradeGridNode,
} from "@/lib/recipes/trade-grid"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import { tradeSignalsNode } from "@/lib/recipes/trade-signals"
import { tradeWalletNode } from "@/lib/recipes/trade-wallet"
import type { RecipeCompiledConfig } from "@/lib/recipes/compile"
import type { CustomShellDb } from "@/server/db"
import {
  tradeBacktestGroups,
  tradeFlowRuns,
  tradeRecipes,
  tradeWallets,
} from "@/server/trade/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  flowNodesOf,
  flowStrategyProblem,
  runWorkspaceRecipe,
} from "@/server/trade/recipes/run"

const NOW = 1_700_000_000_000

function compiled(
  gridSettings = tradeGridNode.createSettings()
): RecipeCompiledConfig {
  return {
    v: 1,
    kind: "automation",
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
    edges: [
      { from: "wallet", sourcePort: "then", to: "markets" },
      { from: "markets", sourcePort: "then", to: "strategy" },
    ],
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
      "This recipe has more than one strategy step. A recipe trades one strategy, so delete the extra strategy step."
    )
  })

  it("refuses a duplicate strategy even when both steps have the same kind", () => {
    const config = compiled()
    config.nodes.secondStrategy = {
      kind: tradeGridNode.kind,
      settings: tradeGridNode.createSettings(),
    }

    expect(flowNodesOf(config)).toBeNull()
    expect(flowStrategyProblem(config)).toBe(
      "This recipe has more than one strategy step. A recipe trades one strategy, so delete the extra strategy step."
    )
  })

  it("refuses stored steps that are not connected in order", () => {
    const config = compiled()
    config.edges = config.edges.filter((edge) => edge.to !== "strategy")

    expect(flowNodesOf(config)).toBeNull()
  })

  it("refuses a stored shell step before the recipe can run", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    const config = compiled()
    config.nodes.shell = { kind: "sendEmail", settings: {} }
    await database.insert(tradeRecipes).values({
      id: "mixed-recipe",
      userId: user.id,
      workspaceId: workspace.id,
      name: "Mixed recipe",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: config,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    })

    const outcome = await runWorkspaceRecipe(
      user.id,
      {
        workspaceId: workspace.id,
        recipeId: "mixed-recipe",
        pressId: "00000000-0000-4000-8000-000000000006",
        now: NOW,
      },
      database
    )

    expect(outcome.started).toBe(false)
    expect(outcome.summary).toContain("nothing to run")
    expect(await database.select().from(tradeBacktestGroups)).toHaveLength(0)
    expect(await database.select().from(tradeFlowRuns)).toHaveLength(0)
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
    await database.insert(tradeRecipes).values({
      id: "grid-flow",
      userId: user.id,
      workspaceId: workspace.id,
      name: "EMA Grid",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: compiled(settings),
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    })

    const outcome = await runWorkspaceRecipe(
      user.id,
      {
        workspaceId: workspace.id,
        recipeId: "grid-flow",
        pressId: "00000000-0000-4000-8000-000000000002",
        now: NOW,
      },
      database
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

  it("creates one backtest when the same press is retried", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    await database.insert(tradeRecipes).values({
      id: "one-press",
      userId: user.id,
      workspaceId: workspace.id,
      name: "One press",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: compiled(),
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    })
    const input = {
      workspaceId: workspace.id,
      recipeId: "one-press",
      pressId: "00000000-0000-4000-8000-000000000003",
      now: NOW,
    }

    await runWorkspaceRecipe(user.id, input, database)
    const retried = await runWorkspaceRecipe(user.id, input, database)

    expect(await database.select().from(tradeBacktestGroups)).toHaveLength(1)
    expect(retried.summary).toBe("That backtest already started.")
  })

  it("switches on a saved practice-wallet recipe", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    await database.insert(tradeWallets).values({
      id: "practice-wallet",
      userId: user.id,
      label: "Practice",
      kind: "paper",
      status: "active",
      protocol: "hyperliquid",
      network: "mainnet",
      startingBalance: 10_000,
    })
    const config = compiled()
    config.nodes.wallet.settings = {
      ...tradeWalletNode.createSettings(),
      walletId: "practice-wallet",
      walletLabel: "Practice",
      walletKind: "paper",
      walletProtocol: "hyperliquid",
      walletNetwork: "mainnet",
    }
    await database.insert(tradeRecipes).values({
      id: "practice-recipe",
      userId: user.id,
      workspaceId: workspace.id,
      name: "Practice recipe",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: config,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    })

    const outcome = await runWorkspaceRecipe(
      user.id,
      {
        workspaceId: workspace.id,
        recipeId: "practice-recipe",
        pressId: "00000000-0000-4000-8000-000000000004",
        now: NOW,
      },
      database
    )

    expect(outcome).toMatchObject({ started: true, mode: "trades" })
    expect(await database.select().from(tradeFlowRuns)).toHaveLength(1)
  })

  it("does not run a recipe from another workspace", async () => {
    const user = await insertUser(database)
    const ownWorkspace = await insertWorkspace(database, { userId: user.id })
    const otherWorkspace = await insertWorkspace(database)
    await database.insert(tradeRecipes).values({
      id: "other-recipe",
      userId: user.id,
      workspaceId: otherWorkspace.id,
      name: "Other recipe",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: compiled(),
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    })

    await expect(
      runWorkspaceRecipe(
        user.id,
        {
          workspaceId: ownWorkspace.id,
          recipeId: "other-recipe",
          pressId: "00000000-0000-4000-8000-000000000005",
          now: NOW,
        },
        database
      )
    ).rejects.toThrow("NOT_FOUND")
    expect(await database.select().from(tradeBacktestGroups)).toHaveLength(0)
  })
})
