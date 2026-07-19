import { randomBytes } from "node:crypto"

import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm"

import { PREVIOUS_RUN_NAME_PREFIX } from "@/lib/backtest/types"
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

function validateBotMarketCount(params: AutomationConfig, marketCount: number) {
  if (marketCount === 0) throw new Error("Pick at least one market.")
  // QFL is one shared portfolio with a real history-size ceiling; every other
  // strategy runs one independent runner per market and isn't capped.
  if (params.qfl && marketCount > 200) {
    throw new Error("Pick no more than 200 markets.")
  }
  validateQflPortfolioSize(params, marketCount)
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

/**
 * Per-market runtime rows for every bot the user owns, aggregated into the
 * run list. Positions are only persisted for paper brokers (live brokers read
 * theirs from the exchange and store null).
 */
export async function listUserBotStates(
  userId: string,
  database: CustomShellDb = db
) {
  return database
    .select({
      botId: tradingBotState.botId,
      market: tradingBotState.market,
      paperPosition: tradingBotState.paperPosition,
      dailyRealizedPnl: tradingBotState.dailyRealizedPnl,
      dailyPnlDate: tradingBotState.dailyPnlDate,
    })
    .from(tradingBotState)
    .innerJoin(tradingBots, eq(tradingBotState.botId, tradingBots.id))
    .where(eq(tradingBots.userId, userId))
}

/**
 * The automation's CURRENT run — its latest unnamed ("Previous run …") bot.
 * Named runs are history (they live on /bots), so the editor's Bot mode never
 * resumes one; naming the current run empties this slot.
 */
export async function getAutomationBotId(
  userId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<string | null> {
  const [row] = await database
    .select({ id: tradingBots.id })
    .from(tradingBots)
    .where(
      and(
        eq(tradingBots.userId, userId),
        eq(tradingBots.automationId, automationId),
        sql`${tradingBots.name} like ${`${PREVIOUS_RUN_NAME_PREFIX} ·%`}`
      )
    )
    .orderBy(desc(tradingBots.createdAt))
    .limit(1)
  return row?.id ?? null
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
  validateBotMarketCount(params, markets.length)

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

export type DeployBotInput = {
  automationId: string
  markets: string[]
  walletId: string
  mode: "paper" | "live"
  paperStartingEquity?: number
}

/**
 * Retires the automation's replaceable bot runs — unnamed ("Previous run …")
 * bots, mirroring the backtest's save-override lifecycle. Stopped ones are
 * deleted outright; running ones are flattened + stopped now and deleted by a
 * later deploy once the worker has wound them down (deleting a live row out
 * from under its runners would orphan them, so teardown is two-phase).
 */
async function retireReplaceableAutomationBots(
  userId: string,
  automationId: string,
  database: CustomShellDb = db
) {
  const priors = await database
    .select()
    .from(tradingBots)
    .where(
      and(
        eq(tradingBots.userId, userId),
        eq(tradingBots.automationId, automationId),
        sql`${tradingBots.name} like ${`${PREVIOUS_RUN_NAME_PREFIX} ·%`}`
      )
    )
  for (const prior of priors) {
    const settled =
      ["stopped", "killed", "error"].includes(prior.status) &&
      prior.desiredState === "stopped"
    if (settled) {
      await deleteUserBot(userId, prior.id, database)
    } else {
      // Close any open position, then stop — the next deploy deletes the row.
      await sendBotCommand(userId, prior.id, "flatten", database)
      await sendBotCommand(userId, prior.id, "stop", database)
    }
  }
}

/**
 * Deploys an automation as a live run — the editor's Bot mode. The new bot is
 * auto-named "Previous run · …" so the next deploy replaces it unless the
 * user names it (renameUserBot). Config is the automation's server-compiled
 * snapshot (createUserBot), kept in sync on every automation save.
 */
export async function deployAutomationBot(
  userId: string,
  input: DeployBotInput,
  database: CustomShellDb = db
): Promise<{ botId: string }> {
  const { getUserAutomation } = await import("@/server/automations")
  const automation = await getUserAutomation(
    userId,
    input.automationId,
    database
  )
  if (!automation) throw new Error("Automation not found")

  await retireReplaceableAutomationBots(userId, input.automationId, database)

  const markets = [
    ...new Set(input.markets.map((market) => market.trim()).filter(Boolean)),
  ]
  const name =
    `${PREVIOUS_RUN_NAME_PREFIX} · ${automation.name} · ${markets.join(", ")}`.slice(
      0,
      255
    )
  const bot = await createUserBot(
    userId,
    {
      name,
      walletId: input.walletId,
      markets,
      exchange: "hyperliquid",
      mode: input.mode,
      automationId: input.automationId,
      paperStartingEquity: input.paperStartingEquity,
    },
    database
  )
  await sendBotCommand(userId, bot.id, "start", database)
  return { botId: bot.id }
}

/** Key-sorted JSON so a fresh compile and a pg jsonb round-trip compare equal. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/**
 * The canvas is the CURRENT run's config: pushes the automation's freshly
 * compiled config to its unnamed ("Previous run …") bot and restarts its
 * runners (update_params keeps positions). Named runs are filed records and
 * stopped runs are frozen — neither ever changes after the fact. Called from
 * saveUserAutomation on every successful save.
 */
export async function syncAutomationBots(
  userId: string,
  automationId: string,
  config: AutomationConfig,
  database: CustomShellDb = db
) {
  const bots = await database
    .select()
    .from(tradingBots)
    .where(
      and(
        eq(tradingBots.userId, userId),
        eq(tradingBots.automationId, automationId),
        sql`${tradingBots.name} like ${`${PREVIOUS_RUN_NAME_PREFIX} ·%`}`
      )
    )
  const next = stableStringify(config)
  for (const bot of bots) {
    if (bot.desiredState === "stopped") continue
    if (stableStringify(bot.params) === next) continue
    await database
      .update(tradingBots)
      .set({ params: config, updatedAt: now() })
      .where(eq(tradingBots.id, bot.id))
    await enqueueCommand(database, bot.id, "update_params", userId)
  }
}

/**
 * Keeps a bot run — exactly the backtest's "name this run to keep it": the
 * run is FINISHED and filed under its name. Finishing a live run means
 * closing its position and stopping it (flatten + stop through the worker's
 * normal command path); the renamed row then freezes as the permanent record
 * the next deploy won't touch.
 */
export async function renameUserBot(
  userId: string,
  botId: string,
  name: string,
  database: CustomShellDb = db
) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Name is required")
  const bot = await getUserBot(userId, botId, database)
  if (!bot) throw new Error("Bot not found")
  await database
    .update(tradingBots)
    .set({ name: trimmed.slice(0, 255), updatedAt: now() })
    .where(eq(tradingBots.id, botId))
  const settled =
    ["stopped", "killed", "error"].includes(bot.status) &&
    bot.desiredState === "stopped"
  if (!settled) {
    await sendBotCommand(userId, botId, "flatten", database)
    await sendBotCommand(userId, botId, "stop", database)
  }
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

  // Start/resume flip status to "starting" — an honest in-flight status the
  // worker converges from (running or error). Pause/flatten/stop leave status
  // untouched: the worker writes the real "paused"/"stopped" when it actually
  // happens, and the UI shows "pausing…"/"stopping…" from desired_state until
  // then. Writing "paused" here would claim the command landed before it did.
  const optimisticStatus =
    command === "start" || command === "resume" ? "starting" : null

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
  database: CustomShellDb = db,
  // Shown verbatim as each affected bot's pause reason and event message —
  // how a guardian trip stays distinguishable from a manual "Pause all".
  reason: string | null = null
) {
  await enqueueCommand(database, null, command, userId, reason)
}

async function enqueueCommand(
  database: CustomShellDb,
  botId: string | null,
  command: string,
  userId: string,
  reason: string | null = null
) {
  await database.insert(tradingBotCommands).values({
    id: uuid(),
    botId,
    command,
    payload: reason ? { reason } : null,
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
