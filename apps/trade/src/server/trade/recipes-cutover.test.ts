import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { defaultDcaParams } from "@/lib/trade/dca"
import type { CustomShellDb } from "@/server/db"
import * as schema from "@/server/schema"
import { insertUser, insertWorkspace } from "@/server/test-support"
import {
  tradeFlowRuns,
  tradeRecipes,
  tradeWallets,
} from "@/server/trade/schema"

const NOW = 1_700_000_000_000

describe("the recipe cutover", () => {
  let client: PGlite
  let database: CustomShellDb

  beforeEach(async () => {
    client = new PGlite()
    const folder = new URL("../../../drizzle/", import.meta.url)
    const migrations = (await readdir(folder))
      .filter(
        (file) => file.endsWith(".sql") && file.localeCompare("0156_") < 0
      )
      .sort()
    for (const migration of migrations) {
      await client.exec(await readFile(new URL(migration, folder), "utf8"))
    }
    database = drizzle(client, { schema }) as unknown as CustomShellDb
  })

  afterEach(async () => {
    await client.close()
  })

  it("moves an invalid Trade draft and keeps its live run", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    await client.query(
      `insert into automations
        (id, user_id, workspace_id, name, graph, compiled_config, created_at, updated_at)
       values ($1, $2, $3, $4, $5, null, $6, $6)`,
      [
        "trade-draft",
        user.id,
        workspace.id,
        "Trade draft",
        {
          nodes: [{ id: "dca", kind: "tradeDca", x: 0, y: 0, settings: {} }],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        new Date(NOW),
      ]
    )
    await client.query(
      `insert into automations
        (id, user_id, workspace_id, name, graph, compiled_config, created_at, updated_at)
       values ($1, $2, $3, $4, $5, null, $6, $6)`,
      [
        "email-flow",
        user.id,
        workspace.id,
        "Email flow",
        {
          nodes: [{ id: "email", kind: "sendEmail", x: 0, y: 0, settings: {} }],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        new Date(NOW),
      ]
    )
    await database.insert(tradeWallets).values({
      id: "wallet-1",
      userId: user.id,
      label: "Practice",
      kind: "paper",
      status: "active",
      protocol: "hyperliquid",
      network: "mainnet",
      startingBalance: 10_000,
    })
    await database.insert(tradeFlowRuns).values({
      id: "live-run",
      userId: user.id,
      walletId: "wallet-1",
      automationId: "trade-draft",
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

    await client.exec(
      await readFile(
        new URL(
          "../../../drizzle/0156_trade_recipes_cutover.sql",
          import.meta.url
        ),
        "utf8"
      )
    )

    expect(
      await database
        .select({ id: tradeRecipes.id, compiled: tradeRecipes.compiledConfig })
        .from(tradeRecipes)
        .where(eq(tradeRecipes.id, "trade-draft"))
    ).toEqual([{ id: "trade-draft", compiled: null }])
    expect(
      (await client.query("select id from automations order by id")).rows
    ).toEqual([{ id: "email-flow" }])
    expect(
      await database
        .select({ id: tradeFlowRuns.id })
        .from(tradeFlowRuns)
        .where(eq(tradeFlowRuns.id, "live-run"))
    ).toEqual([{ id: "live-run" }])
  })
})
