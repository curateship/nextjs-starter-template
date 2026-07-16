import { randomBytes } from "node:crypto"

import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm"

import {
  automationConfigSchema,
  type AutomationConfig,
} from "@/lib/strategies/strategy-config"
import {
  MAX_QFL_PORTFOLIO_HISTORY_BARS,
  qflPortfolioHistoryBars,
} from "@/lib/automations/qfl"
import { db, type CustomShellDb } from "@/server/db"
import { getActivePerpMarkets } from "@/server/hyperliquid/info"
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
  markets: string[]
  exchange: string
  mode: "paper" | "live"
  /** Saved Automation whose server-compiled config is snapshotted. */
  automationId?: string
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
const RUNNABLE_BOT_TYPES = new Set(["automation"])

function isRunnableBotType(type: string): type is "automation" {
  return RUNNABLE_BOT_TYPES.has(type)
}

async function validateMarkets(network: TradingNetwork, markets: string[]) {
  const active = new Set(
    (await getActivePerpMarkets(network)).map((market) => market.coin)
  )
  for (const market of markets) {
    if (!active.has(market)) {
      throw new Error(`Unknown Hyperliquid market: ${market}`)
    }
  }
}

function validateQflPortfolioSize(
  params: AutomationConfig,
  marketCount: number
) {
  if (!params.qfl) return
  const historyBars = qflPortfolioHistoryBars(
    params.qfl,
    params.interval,
    params.marketScanner,
    marketCount
  )
  if (historyBars > MAX_QFL_PORTFOLIO_HISTORY_BARS) {
    throw new Error(
      `This QFL bot needs about ${historyBars.toLocaleString()} history candles across its markets. Use fewer markets, less history, or a coarser timeframe.`
    )
  }
}

export async function listUserBots(
  userId: string,
  database: CustomShellDb = db
) {
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

  const states = await database
    .select()
    .from(tradingBotState)
    .where(eq(tradingBotState.botId, botId))

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
      wins: count(sql`case when ${tradingBotTrades.closedPnl} > 0 then 1 end`),
      losses: count(
        sql`case when ${tradingBotTrades.closedPnl} < 0 then 1 end`
      ),
    })
    .from(tradingBotTrades)
    .where(eq(tradingBotTrades.botId, botId))

  let sourceName: string | null = null
  if (bot.automationId) {
    const { getUserAutomation } = await import("@/server/automations")
    sourceName =
      (await getUserAutomation(userId, bot.automationId, database))?.name ??
      null
  }

  return {
    bot,
    wallet: wallet ?? null,
    states,
    trades,
    openOrders,
    events,
    aggregates,
    sourceName,
  }
}

export type UpdateBotInput = {
  name: string
  markets: string[]
  params: AutomationConfig
}

/**
 * Edits a bot's name, markets, params, and risk. Strategy, wallet, and mode are
 * fixed at creation. Markets can change: added markets get a fresh state row and
 * a runner on restart; removed markets have their state dropped and (by the
 * worker) their position closed. A running bot is restarted by the worker via
 * the update_params command, keeping surviving positions and re-deriving orders.
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

  // Archived legacy bots are read-only history — fail fast, no dual path.
  if (!isRunnableBotType(bot.strategyType)) {
    throw new Error(
      "This bot uses a retired strategy and is archived — it can't be edited."
    )
  }
  const requestedParams = automationConfigSchema.parse(input.params)
  if (requestedParams.kind !== bot.strategyType) {
    throw new Error("A bot's Automation source cannot be changed.")
  }

  const stored = automationConfigSchema.safeParse(bot.params)
  if (!stored.success) {
    throw new Error("This Automation bot has an invalid saved configuration.")
  }
  // The graph snapshot is immutable on a bot. Only its protective levels are
  // editable here; replacement rules must come from a newly created bot.
  const params: AutomationConfig = {
    ...stored.data,
    protection: requestedParams.protection,
  }

  const markets = [
    ...new Set(input.markets.map((m) => m.trim()).filter(Boolean)),
  ]
  if (markets.length === 0) throw new Error("Pick at least one market")
  if (!stored.data.qfl && markets.length !== 1) {
    throw new Error("Automation bots can trade exactly one market.")
  }
  if (markets.length > 200) throw new Error("Pick no more than 200 markets.")
  validateQflPortfolioSize(stored.data, markets.length)

  // Validate each market on the wallet's network (rejects typos / delisted).
  const wallet = await findUserWallet(userId, bot.walletId, database)
  if (!wallet) throw new Error("Wallet not found")
  await validateMarkets(wallet.network as TradingNetwork, markets)

  const current = new Set(bot.markets)
  const next = new Set(markets)
  const added = markets.filter((market) => !current.has(market))
  const removed = bot.markets.filter((market) => !next.has(market))

  const [updated] = await database
    .update(tradingBots)
    .set({
      name: name.slice(0, 255),
      markets,
      params,
      updatedAt: now(),
    })
    .where(eq(tradingBots.id, botId))
    .returning()
  if (!updated) throw new Error("Bot was not updated")

  if (added.length > 0) {
    await database
      .insert(tradingBotState)
      .values(
        added.map((market) => ({
          botId,
          market,
          strategyState: {},
          updatedAt: now(),
        }))
      )
      .onConflictDoNothing()
  }
  if (removed.length > 0) {
    await database
      .delete(tradingBotState)
      .where(
        and(
          eq(tradingBotState.botId, botId),
          inArray(tradingBotState.market, removed)
        )
      )
  }

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
  if (wallet.status !== "active") {
    throw new Error(
      "This wallet is still awaiting approval on Hyperliquid — finish the Connect Wallet flow first."
    )
  }
  // Paper bots never sign real orders, so the wallet's enable toggle only
  // gates live trading.
  if (input.mode === "live" && !wallet.isActive) {
    throw new Error("Wallet is disabled")
  }

  if (!input.automationId) {
    throw new Error("Choose a saved Automation before creating this bot.")
  }
  const { getUserAutomation } = await import("@/server/automations")
  const owned = await getUserAutomation(userId, input.automationId, database)
  if (!owned) throw new Error("Automation not found")

  const compiled = automationConfigSchema.safeParse(owned.compiledConfig)
  if (!compiled.success) {
    throw new Error(
      "Automation is incomplete. Save a valid canvas before creating a bot."
    )
  }
  // Never trust a client copy of an Automation graph. The saved, server-
  // compiled config is the only configuration allowed to reach execution.
  const params: AutomationConfig = compiled.data
  const automationId = owned.id

  // Dedupe while preserving order; a bot needs at least one market.
  const requestedMarkets = [
    ...new Set(input.markets.map((m) => m.trim()).filter(Boolean)),
  ]
  const markets = requestedMarkets
  if (markets.length === 0) {
    throw new Error("Pick at least one market.")
  }
  if (!params.qfl && markets.length !== 1) {
    throw new Error("Pick exactly one market for this Automation.")
  }
  if (markets.length > 200) throw new Error("Pick no more than 200 markets.")
  validateQflPortfolioSize(params, markets.length)

  // Validates each market exists on the wallet's network.
  await validateMarkets(wallet.network as TradingNetwork, markets)

  const createdAt = now()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const cloidPrefix = randomBytes(4).toString("hex")
    if (cloidPrefix === MANUAL_PREFIX) continue
    try {
      return await database.transaction(async (tx) => {
        const [bot] = await tx
          .insert(tradingBots)
          .values({
            id: uuid(),
            userId,
            name: name.slice(0, 255),
            strategyType: params.kind,
            automationId,
            walletId: wallet.id,
            markets,
            exchange: input.exchange || "hyperliquid",
            mode: input.mode,
            desiredState: "stopped",
            status: "stopped",
            params,
            riskParams: {},
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

        // Keep the bot and every per-market state row atomic: either all
        // selected markets are runnable or no partial bot is saved.
        await tx.insert(tradingBotState).values(
          markets.map((market) => ({
            botId: bot.id,
            market,
            strategyState: {},
            updatedAt: createdAt,
          }))
        )
        return bot
      })
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
  // Deleting is idempotent: if the row is already gone (e.g. a double-click or a
  // concurrent delete), treat it as success instead of surfacing "Bot not found".
  if (!bot) return { botId }
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

  // Archived legacy bots stay readable (and can still be stopped/flattened)
  // but can never trade again — their strategies were retired.
  if (
    !isRunnableBotType(bot.strategyType) &&
    (command === "start" || command === "resume")
  ) {
    throw new Error(
      "This bot uses a retired strategy and is archived. Create a new bot from a saved strategy instead."
    )
  }

  const desiredState =
    command === "start" || command === "resume"
      ? "running"
      : command === "pause" || command === "flatten"
        ? "paused"
        : command === "stop"
          ? "stopped"
          : null

  // Optimistically flip the visible status so the UI reacts the instant a
  // lifecycle button is clicked; the worker (async, via notify) then converges
  // to the real status a moment later. Flatten pauses, so it reads as "paused".
  const optimisticStatus =
    command === "start" || command === "resume"
      ? "starting"
      : command === "pause" || command === "flatten"
        ? "paused"
        : null

  if (desiredState) {
    await database
      .update(tradingBots)
      .set({
        desiredState,
        ...(optimisticStatus
          ? { status: optimisticStatus, statusReason: null }
          : {}),
        updatedAt: now(),
      })
      .where(eq(tradingBots.id, botId))
  }
  if (optimisticStatus) {
    await database
      .update(tradingBotState)
      .set({ status: optimisticStatus, statusReason: null, updatedAt: now() })
      .where(eq(tradingBotState.botId, botId))
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
