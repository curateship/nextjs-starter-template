import { randomBytes } from "node:crypto"

import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm"

import {
  riskParamsSchema,
  strategyParamsSchema,
  type RiskParams,
  type StrategyParams,
} from "@/lib/strategies/params"
import { db, type CustomShellDb } from "@/server/db"
import { getAssetInfo } from "@/server/hyperliquid/info"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import {
  tradingBotCommands,
  tradingBotEvents,
  tradingBotOrders,
  tradingBotState,
  tradingBotTrades,
  tradingBots,
  tradingWallets,
  type TradingBot,
} from "@/server/schema"
import { now, uuid } from "@/server/util"
import { findUserWallet } from "@/server/wallets"

export type CreateBotInput = {
  name: string
  walletId: string
  market: string
  mode: "paper" | "live"
  params: StrategyParams
  riskParams: RiskParams
  paperStartingEquity?: number
}

export type BotCommandName =
  | "start"
  | "stop"
  | "pause"
  | "resume"
  | "flatten"
  | "update_params"

const MANUAL_PREFIX = "ffffffff"

export async function listUserBots(userId: string, database: CustomShellDb = db) {
  const rows = await database
    .select({
      bot: tradingBots,
      walletLabel: tradingWallets.label,
      network: tradingWallets.network,
      realizedPnl: sql<string>`coalesce((select sum(coalesce(${tradingBotTrades.closedPnl}, 0) - ${tradingBotTrades.fee}) from ${tradingBotTrades} where ${tradingBotTrades.botId} = ${tradingBots.id}), 0)`,
      tradeCount: sql<number>`(select count(*)::int from ${tradingBotTrades} where ${tradingBotTrades.botId} = ${tradingBots.id})`,
    })
    .from(tradingBots)
    .innerJoin(tradingWallets, eq(tradingBots.walletId, tradingWallets.id))
    .where(eq(tradingBots.userId, userId))
    .orderBy(desc(tradingBots.createdAt))
  return rows
}

export async function getUserBot(
  userId: string,
  botId: string,
  database: CustomShellDb = db
): Promise<TradingBot | null> {
  const [bot] = await database
    .select()
    .from(tradingBots)
    .where(and(eq(tradingBots.id, botId), eq(tradingBots.userId, userId)))
    .limit(1)
  return bot ?? null
}

export async function getBotDetail(
  userId: string,
  botId: string,
  database: CustomShellDb = db
) {
  const bot = await getUserBot(userId, botId, database)
  if (!bot) throw new Error("Bot not found")

  const [wallet] = await database
    .select()
    .from(tradingWallets)
    .where(eq(tradingWallets.id, bot.walletId))
    .limit(1)

  const [state] = await database
    .select()
    .from(tradingBotState)
    .where(eq(tradingBotState.botId, botId))
    .limit(1)

  const trades = await database
    .select()
    .from(tradingBotTrades)
    .where(eq(tradingBotTrades.botId, botId))
    .orderBy(desc(tradingBotTrades.fillTime))
    .limit(200)

  const openOrders = await database
    .select()
    .from(tradingBotOrders)
    .where(
      and(
        eq(tradingBotOrders.botId, botId),
        inArray(tradingBotOrders.status, [
          "pending",
          "resting",
          "partially_filled",
        ])
      )
    )
    .orderBy(desc(tradingBotOrders.px))

  const events = await database
    .select()
    .from(tradingBotEvents)
    .where(eq(tradingBotEvents.botId, botId))
    .orderBy(desc(tradingBotEvents.createdAt))
    .limit(50)

  const [aggregates] = await database
    .select({
      realizedPnl: sum(
        sql`coalesce(${tradingBotTrades.closedPnl}, 0) - ${tradingBotTrades.fee}`
      ),
      tradeCount: count(),
      wins: count(
        sql`case when ${tradingBotTrades.closedPnl} > 0 then 1 end`
      ),
      losses: count(
        sql`case when ${tradingBotTrades.closedPnl} < 0 then 1 end`
      ),
    })
    .from(tradingBotTrades)
    .where(eq(tradingBotTrades.botId, botId))

  return {
    bot,
    wallet: wallet ?? null,
    state: state ?? null,
    trades,
    openOrders,
    events,
    aggregates,
  }
}

export type UpdateBotInput = {
  name: string
  params: StrategyParams
  riskParams: RiskParams
}

/**
 * Edits a bot's name/params/risk. Strategy, market, wallet, and mode are
 * fixed at creation. A running bot is restarted by the worker via the
 * update_params command, keeping its position and re-deriving orders.
 */
export async function updateUserBot(
  userId: string,
  botId: string,
  input: UpdateBotInput,
  database: CustomShellDb = db
): Promise<TradingBot> {
  const bot = await getUserBot(userId, botId, database)
  if (!bot) throw new Error("Bot not found")

  const name = input.name.trim()
  if (!name) throw new Error("Bot name is required")

  const params = strategyParamsSchema.parse(input.params)
  const riskParams = riskParamsSchema.parse(input.riskParams)
  if (params.strategyType !== bot.strategyType) {
    throw new Error(
      "Strategy type cannot be changed — create a new bot instead."
    )
  }

  const [updated] = await database
    .update(tradingBots)
    .set({
      name: name.slice(0, 255),
      params,
      riskParams,
      updatedAt: now(),
    })
    .where(eq(tradingBots.id, botId))
    .returning()
  if (!updated) throw new Error("Bot was not updated")

  await enqueueCommand(database, botId, "update_params", userId)
  return updated
}

export async function createUserBot(
  userId: string,
  input: CreateBotInput,
  database: CustomShellDb = db
): Promise<TradingBot> {
  const name = input.name.trim()
  if (!name) throw new Error("Bot name is required")

  const wallet = await findUserWallet(userId, input.walletId, database)
  if (!wallet) throw new Error("Wallet not found")
  if (!wallet.isActive) throw new Error("Wallet is disabled")

  const params = strategyParamsSchema.parse(input.params)
  const riskParams = riskParamsSchema.parse(input.riskParams)

  // Validates the market exists on the wallet's network.
  await getAssetInfo(wallet.network as TradingNetwork, input.market)

  const createdAt = now()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const cloidPrefix = randomBytes(4).toString("hex")
    if (cloidPrefix === MANUAL_PREFIX) continue
    try {
      const [bot] = await database
        .insert(tradingBots)
        .values({
          id: uuid(),
          userId,
          name: name.slice(0, 255),
          strategyType: params.strategyType,
          walletId: wallet.id,
          market: input.market,
          mode: input.mode,
          desiredState: "stopped",
          status: "stopped",
          params,
          riskParams,
          cloidPrefix,
          paperStartingEquity:
            input.mode === "paper"
              ? String(input.paperStartingEquity ?? 10_000)
              : null,
          createdAt,
          updatedAt: createdAt,
        })
        .returning()
      if (!bot) throw new Error("Bot was not created")

      await database.insert(tradingBotState).values({
        botId: bot.id,
        strategyState: {},
        updatedAt: createdAt,
      })
      return bot
    } catch (error) {
      if (isUniqueViolation(error)) continue
      throw error
    }
  }
  throw new Error("Could not allocate a unique bot id prefix")
}

export async function deleteUserBot(
  userId: string,
  botId: string,
  database: CustomShellDb = db
) {
  const bot = await getUserBot(userId, botId, database)
  if (!bot) throw new Error("Bot not found")
  if (!["stopped", "killed", "error"].includes(bot.status)) {
    throw new Error("Stop the bot before deleting it.")
  }
  await database.delete(tradingBots).where(eq(tradingBots.id, botId))
  return { botId }
}

export async function sendBotCommand(
  userId: string,
  botId: string,
  command: BotCommandName,
  database: CustomShellDb = db
) {
  const bot = await getUserBot(userId, botId, database)
  if (!bot) throw new Error("Bot not found")

  const desiredState =
    command === "start" || command === "resume"
      ? "running"
      : command === "pause"
        ? "paused"
        : command === "stop"
          ? "stopped"
          : null
  if (desiredState) {
    await database
      .update(tradingBots)
      .set({ desiredState, updatedAt: now() })
      .where(eq(tradingBots.id, botId))
  }

  await enqueueCommand(database, botId, command, userId)
}

export async function sendGlobalBotCommand(
  userId: string,
  command: "pause_all" | "flatten_all",
  database: CustomShellDb = db
) {
  await enqueueCommand(database, null, command, userId)
}

async function enqueueCommand(
  database: CustomShellDb,
  botId: string | null,
  command: string,
  userId: string
) {
  await database.insert(tradingBotCommands).values({
    id: uuid(),
    botId,
    command,
    payload: null,
    status: "pending",
    createdByUserId: userId,
    createdAt: now(),
  })
  await database.execute(sql`notify bot_commands`)
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true
    }
    current =
      typeof current === "object"
        ? (current as { cause?: unknown }).cause
        : undefined
  }
  return false
}
