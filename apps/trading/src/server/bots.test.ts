import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AutomationStrategyConfig } from "@/lib/automations/automation"
import type { StrategyConfig } from "@/lib/strategies/strategy-config"
import {
  createUserBot,
  getBotDetail,
  sendBotCommand,
  updateUserBot,
} from "@/server/bots"
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
  getAssetInfo: vi.fn(async () => ({ assetId: 0, szDecimals: 4 })),
}))

const SIGNAL_CONFIG: StrategyConfig = {
  v: 2,
  kind: "signal",
  interval: "15m",
  indicator: { type: "ema_cross", params: { fast: 20, slow: 50 } },
  settings: {
    direction: "both",
    orderSizeUsd: 250,
    compounding: false,
    flipOnOppositeSignal: true,
  },
}

const AUTOMATION_CONFIG: AutomationStrategyConfig = {
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
  compiledConfig: AutomationStrategyConfig | null = AUTOMATION_CONFIG,
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
      protection: {},
    },
    compiledConfig,
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

function botInput(walletId: string) {
  return {
    name: "Test bot",
    walletId,
    markets: ["BTC"],
    exchange: "hyperliquid",
    mode: "paper" as const,
    params: SIGNAL_CONFIG,
    paperStartingEquity: 10_000,
  }
}

describe("Automation bot creation", () => {
  it("snapshots the owner's compiled config and ignores client-supplied params", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId)

    const bot = await createUserBot(userId, {
      ...botInput(walletId),
      automationId,
      params: SIGNAL_CONFIG,
    })

    expect(bot.strategyType).toBe("automation")
    expect(bot.strategyId).toBeNull()
    expect(bot.automationId).toBe(automationId)
    expect(bot.params).toEqual(AUTOMATION_CONFIG)
    expect((await getBotDetail(userId, bot.id)).sourceName).toBe(
      "Authoritative Automation"
    )
  })

  it("does not reveal or use another user's Automation", async () => {
    const ownerId = await createUser()
    const attackerId = await createUser()
    const walletId = await createWallet(attackerId)
    const automationId = await createAutomation(ownerId)

    await expect(
      createUserBot(attackerId, {
        ...botInput(walletId),
        automationId,
      })
    ).rejects.toThrow("Automation not found")
  })

  it("rejects an Automation whose current draft has no compiled config", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId, null)

    await expect(
      createUserBot(userId, {
        ...botInput(walletId),
        automationId,
      })
    ).rejects.toThrow("Automation is incomplete")
  })

  it("limits Automation bots to one market while Signal bots remain multi-market", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId)

    await expect(
      createUserBot(userId, {
        ...botInput(walletId),
        automationId,
        markets: ["BTC", "ETH"],
      })
    ).rejects.toThrow("one market")

    const signalBot = await createUserBot(userId, {
      ...botInput(walletId),
      markets: ["BTC", "ETH"],
    })
    expect(signalBot.markets).toEqual(["BTC", "ETH"])
  })
})

describe("Automation bot updates and commands", () => {
  it("updates protection without accepting replacement rules", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId)
    const bot = await createUserBot(userId, {
      ...botInput(walletId),
      automationId,
    })
    const untrusted: AutomationStrategyConfig = {
      ...AUTOMATION_CONFIG,
      protection: { takeProfitPct: 3 },
      rules: [{ ...AUTOMATION_CONFIG.rules[0], targetEquityPct: 90 }],
    }

    const updated = await updateUserBot(userId, bot.id, {
      name: bot.name,
      markets: ["BTC"],
      params: untrusted,
    })

    expect(updated.params).toEqual({
      ...AUTOMATION_CONFIG,
      protection: { takeProfitPct: 3 },
    })
  })

  it("allows an Automation bot to start", async () => {
    const userId = await createUser()
    const walletId = await createWallet(userId)
    const automationId = await createAutomation(userId)
    const bot = await createUserBot(userId, {
      ...botInput(walletId),
      automationId,
    })

    await sendBotCommand(userId, bot.id, "start")

    const [command] = await database.select().from(tradingBotCommands)
    expect(command?.botId).toBe(bot.id)
    expect(command?.command).toBe("start")
  })
})
