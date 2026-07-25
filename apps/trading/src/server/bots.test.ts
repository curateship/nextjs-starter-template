import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AutomationConfig } from "@/lib/automations/automation"
import { createUserBot, getBotDetail, sendBotCommand } from "@/server/bots"
import { setDbForTests, type CustomShellDb } from "@/server/db"
import {
  customShellUsers,
  tradingAutomations,
  tradingBotCommands,
  tradingWallets,
} from "@/server/schema"
import { now, uuid } from "@/server/util"
import * as schema from "@/server/schema"

vi.mock("@/server/hyperliquid/info", () => ({
  getActivePerpMarkets: vi.fn(async () =>
    ["BTC", "ETH", "SOL"].map((coin, assetId) => ({ coin, assetId }))
  ),
}))

const AUTOMATION_CONFIG: AutomationConfig = {
  v: 2,
  kind: "automation",
  interval: "15m",
  protection: {},
  rules: [
    {
      id: "buy",
      action: "buy",
      targetEquityPct: 25,
      condition: {
        kind: "trigger",
        nodeId: "ema",
        indicator: { type: "ema_cross", params: { fast: 20, slow: 50 } },
        side: "buy",
      },
    },
  ],
}

const WALL_CONFIG: AutomationConfig = {
  v: 2,
  kind: "automation",
  interval: "15m",
  protection: {},
  rules: [
    {
      id: "long",
      action: "buy",
      targetEquityPct: 10,
      condition: {
        kind: "liveWall",
        nodeId: "wall",
        side: "bid",
        minUsd: 500_000,
        relativeSize: 5,
        maxDistancePct: 0.5,
        confirmationMs: 2_000,
      },
    },
  ],
}

const SHARED_WALLET_CONFIG: AutomationConfig = {
  v: 2,
  kind: "automation",
  interval: "15m",
  protection: {},
  rules: [],
  dca: {
    nodeId: "dca",
    rungs: [{ deviation: 5 }, { deviation: 8 }],
    maxPositionPct: 25,
    sizeMultiplier: 2,
    compound: true,
    rungEntry: "market" as const,
    requireTwoGreen: false,
    basePeriods: 36,
    pumpPeriods: 8,
    crackPct: 2.5,
    maxCrackBars: 4,
    respectFilterEnabled: false,
    respectLookbackMonths: 6,
    minRespectPct: 80,
    recoveryTargetPct: -2,
  },
}

async function applyMigration(target: PGlite, file: string) {
  const migration = await readFile(new URL(file, import.meta.url), "utf8")
  await target.exec(migration)
}

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0003_custom_shell_workspaces.sql",
    "../../drizzle/0004_trading.sql",
    "../../drizzle/0008_backtests.sql",
    "../../drizzle/0013_multi_market_bots.sql",
    "../../drizzle/0014_strategy_rebuild.sql",
    "../../drizzle/0017_remove_legacy_strategies.sql",
    "../../drizzle/0020_trading_automations.sql",
    "../../drizzle/0021_wallet_onboarding.sql",
    "../../drizzle/0024_remove_strategies.sql",
    "../../drizzle/0025_automation_type.sql",
  ]) {
    await applyMigration(client, file)
  }
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CustomShellDb)
})

afterEach(async () => {
  await client.close()
})

async function createUser() {
  const userId = uuid()
  const createdAt = now()
  await database.insert(customShellUsers).values({
    id: userId,
    email: `${userId}@internal.dev`,
    name: "Trader",
    role: "admin",
    passwordHash: "not-a-real-hash",
    createdAt,
    updatedAt: createdAt,
  })
  return userId
}

async function createWallet(userId: string) {
  const createdAt = now()
  const id = uuid()
  await database.insert(tradingWallets).values({
    id,
    userId,
    label: "Paper test",
    network: "testnet",
    accountAddress: "0x1111111111111111111111111111111111111111",
    agentAddress: `0x${id.replaceAll("-", "").padEnd(40, "0").slice(0, 40)}`,
    encryptedPrivateKey: "test-only",
    isActive: true,
    status: "active",
    createdVia: "imported",
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

async function createAutomation(
  userId: string,
  compiledConfig: AutomationConfig | null = AUTOMATION_CONFIG,
  name = "Authoritative Automation"
) {
  const createdAt = now()
  const id = uuid()
  await database.insert(tradingAutomations).values({
    id,
    userId,
    name,
    interval: "15m",
    graph: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    compiledConfig,
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

function botInput(walletId: string, automationId: string) {
  return {
    name: "Test bot",
    walletId,
    markets: ["BTC"],
    exchange: "hyperliquid",
    mode: "paper" as const,
    automationId,
    paperStartingEquity: 10_000,
  }
}

describe("Automation bot creation", () => {
  it("snapshots the owner's compiled config", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId)

    const bot = await createUserBot(userId, botInput(walletId, automationId))

    expect(bot.strategyType).toBe("automation")
    expect(bot.automationId).toBe(automationId)
    expect(bot.params).toEqual(AUTOMATION_CONFIG)
    expect((await getBotDetail(userId, bot.id)).sourceName).toBe(
      "Authoritative Automation"
    )
  })

  it("allows Whale Wall bots in paper and live modes", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId, WALL_CONFIG, "Wall")

    const paper = await createUserBot(userId, botInput(walletId, automationId))
    const live = await createUserBot(userId, {
      ...botInput(walletId, automationId),
      name: "Live wall",
      mode: "live",
    })

    expect(paper.params).toEqual(WALL_CONFIG)
    expect(paper.mode).toBe("paper")
    expect(live.params).toEqual(WALL_CONFIG)
    expect(live.mode).toBe("live")
  })

  it("creates selected shared-wallet markets and their runtime state together", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId, SHARED_WALLET_CONFIG, "Ladder")

    const bot = await createUserBot(userId, {
      ...botInput(walletId, automationId),
      markets: ["BTC", "ETH"],
    })
    const detail = await getBotDetail(userId, bot.id)

    expect(bot.markets).toEqual(["BTC", "ETH"])
    expect(detail.states.map((state) => state.market).sort()).toEqual([
      "BTC",
      "ETH",
    ])
  })

  it("rejects a shared-wallet market basket whose required history would exhaust the worker", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(
      userId,
      {
        ...SHARED_WALLET_CONFIG,
        interval: "1m",
        dca: {
          ...SHARED_WALLET_CONFIG.dca!,
          respectFilterEnabled: true,
          respectLookbackMonths: 60,
        },
      },
      "Large shared-wallet ladder"
    )

    await expect(
      createUserBot(userId, {
        ...botInput(walletId, automationId),
        markets: ["BTC", "ETH", "SOL"],
      })
    ).rejects.toThrow("history candles")
  })

  it("does not reveal or use another user's Automation", async () => {
    const ownerId = await createUser()
    const attackerId = await createUser()
    const walletId = await createWallet(attackerId)
    const automationId = await createAutomation(ownerId)

    await expect(
      createUserBot(attackerId, botInput(walletId, automationId))
    ).rejects.toThrow("Automation not found")
  })

  it("rejects an Automation whose current draft has no compiled config", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId, null)

    await expect(
      createUserBot(userId, botInput(walletId, automationId))
    ).rejects.toThrow("Automation is incomplete")
  })

  it("requires a saved Automation and runs one runner per market", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId)

    // A single-market Automation runs one independent runner per market — many
    // markets are allowed, not capped to one.
    const bot = await createUserBot(userId, {
      ...botInput(walletId, automationId),
      markets: ["BTC", "ETH"],
    })
    expect(bot.markets).toEqual(["BTC", "ETH"])

    await expect(
      createUserBot(userId, {
        ...botInput(walletId, automationId),
        automationId: undefined,
      })
    ).rejects.toThrow("Choose a saved Automation")
  })
})

describe("Automation bot commands", () => {
  it("allows an Automation bot to start", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId)
    const bot = await createUserBot(userId, botInput(walletId, automationId))

    await sendBotCommand(userId, bot.id, "start")

    const [command] = await database.select().from(tradingBotCommands)
    expect(command?.botId).toBe(bot.id)
    expect(command?.command).toBe("start")
  })
})
