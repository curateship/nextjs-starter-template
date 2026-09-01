import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AutomationGraph } from "@/lib/automations/graph"
import { tradeDcaNode } from "@/lib/recipes/trade-dca"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import { tradeWalletNode } from "@/lib/recipes/trade-wallet"
import { defaultDcaParams } from "@/lib/trade/dca"
import type { CustomShellDb } from "@/server/db"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  createWorkspaceRecipe,
  deleteWorkspaceRecipes,
  duplicateWorkspaceRecipe,
  getWorkspaceRecipe,
  listWorkspaceRecipes,
  saveWorkspaceRecipe,
} from "@/server/trade/recipes"
import {
  tradeFlowRuns,
  tradeRecipes,
  tradeWallets,
} from "@/server/trade/schema"

let client: PGlite
let database: CustomShellDb
let workspaceId: string
let userId: string

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  database = created.db
  workspaceId = (await insertWorkspace(database)).id
  userId = (await insertUser(database, { role: "admin" })).id
})

afterEach(async () => {
  await client.close()
})

function validGraph(): AutomationGraph {
  return {
    nodes: [
      {
        id: "wallet",
        kind: tradeWalletNode.kind,
        x: 0,
        y: 0,
        settings: tradeWalletNode.createSettings(),
      },
      {
        id: "markets",
        kind: tradeMarketsNode.kind,
        x: 240,
        y: 0,
        settings: tradeMarketsNode.createSettings(),
      },
      {
        id: "dca",
        kind: tradeDcaNode.kind,
        x: 480,
        y: 0,
        settings: tradeDcaNode.createSettings(),
      },
    ],
    edges: [
      { id: "one", from: "wallet", sourcePort: "then", to: "markets" },
      { id: "two", from: "markets", sourcePort: "then", to: "dca" },
    ],
    viewport: { x: 0, y: 0, zoom: 0.9 },
  }
}

describe("recipe storage", () => {
  it("compiles on save and lists the saved result", async () => {
    const created = await createWorkspaceRecipe(
      workspaceId,
      userId,
      "First recipe",
      database
    )
    expect(created.compiledConfig).toBeNull()

    const saved = await saveWorkspaceRecipe(
      workspaceId,
      { id: created.id, name: created.name, graph: validGraph() },
      database
    )
    expect(saved?.compiledConfig).not.toBeNull()
    await expect(listWorkspaceRecipes(workspaceId, database)).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        summary: "3 steps",
        isValid: true,
      }),
    ])
  })

  it("never reads a recipe from another workspace", async () => {
    const other = await insertWorkspace(database)
    const recipe = await createWorkspaceRecipe(
      other.id,
      userId,
      "Other site",
      database
    )
    await expect(
      getWorkspaceRecipe(workspaceId, recipe.id, database)
    ).resolves.toBeNull()
  })

  it("finds a free copy name without changing the drawing", async () => {
    const source = await createWorkspaceRecipe(
      workspaceId,
      userId,
      "Recipe",
      database,
      validGraph()
    )
    const first = await duplicateWorkspaceRecipe(
      workspaceId,
      userId,
      source.id,
      database
    )
    const second = await duplicateWorkspaceRecipe(
      workspaceId,
      userId,
      source.id,
      database
    )
    expect(first?.name).toBe("Recipe copy")
    expect(second?.name).toBe("Recipe copy 2")
    expect(first?.graph).toEqual(source.graph)
  })

  it("refuses deletion while the recipe has a live run", async () => {
    const recipe = await createWorkspaceRecipe(
      workspaceId,
      userId,
      "Running recipe",
      database,
      validGraph()
    )
    await database.insert(tradeWallets).values({
      userId,
      id: "wallet-1",
      label: "Practice",
      kind: "paper",
      status: "active",
      protocol: "hyperliquid",
      network: "mainnet",
      startingBalance: 10_000,
    })
    await database.insert(tradeFlowRuns).values({
      userId,
      id: "run-1",
      walletId: "wallet-1",
      automationId: recipe.id,
      status: "running",
      spec: {
        protocol: "hyperliquid",
        network: "mainnet",
        folderId: null,
        marketKeys: ["hyperliquid:mainnet:BTC"],
        strategy: {
          kind: "dca",
          params: defaultDcaParams(),
          interval: "4h",
        },
        capUsd: 1_000,
        walletLabel: "Practice",
        real: false,
      },
    })

    await expect(
      deleteWorkspaceRecipes(workspaceId, [recipe.id], database)
    ).rejects.toThrow("RECIPE_RUNNING")
    expect(
      await database
        .select({ id: tradeRecipes.id })
        .from(tradeRecipes)
        .where(eq(tradeRecipes.id, recipe.id))
    ).toHaveLength(1)
  })
})
