import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { JsonValue } from "@/lib/api/audit"
import type { GuardianStatus } from "@/lib/api/guardian"
import { hyperliquidMarketSchema } from "@/lib/hl/market-symbol"
import {
  normalizeAutomationConfig,
  automationConfigSchema,
  type AutomationConfig,
} from "@/lib/strategies/strategy-config"

export type BotListPosition = {
  market: string
  szi: number
  entry_px: number
}

export type BotListItem = {
  id: string
  name: string
  markets: string[]
  exchange: string
  mode: "paper" | "live"
  desired_state: string
  status: string
  status_reason: string | null
  wallet_label: string
  network: string
  realized_pnl: number
  /** Realized P&L for the current UTC day, summed across the bot's markets. */
  daily_realized_pnl: number
  /** Open per-market positions; persisted for paper brokers only. */
  positions: BotListPosition[]
  trade_count: number
  created_at: string
  updated_at: string
}

export type BotListResponse = {
  bots: BotListItem[]
  workerOnline: boolean
  /** Account-level kill-switch state, shown as the bots-page banner. */
  guardian: GuardianStatus
}

export type BotMarketState = {
  market: string
  status: string | null
  status_reason: string | null
  strategy_state: JsonValue
  paper_position: { szi: number; entryPx: number } | null
  paper_cash: number | null
  daily_realized_pnl: number
  consecutive_losses: number
  cooldown_until: string | null
  peak_equity: number | null
  last_eval_at: string | null
}

export type BotDetailResponse = {
  bot: BotListItem & {
    params: AutomationConfig
    paper_starting_equity: number | null
    source_name: string | null
    automation_id: string | null
  }
  states: BotMarketState[]
  trades: {
    id: string
    market: string
    side: string
    px: string
    sz: string
    notional: string
    fee: string
    closed_pnl: string | null
    fill_time: string
  }[]
  open_orders: {
    id: string
    market: string
    side: string
    px: string | null
    sz: string
    purpose: string
    status: string
  }[]
  events: {
    id: string
    level: string
    type: string
    message: string
    created_at: string
  }[]
  stats: {
    realized_pnl: number
    trade_count: number
    wins: number
    losses: number
  }
  workerOnline: boolean
}

const createBotSchema = z.object({
  name: z.string().min(1).max(255),
  walletId: z.string().min(1),
  markets: z.array(hyperliquidMarketSchema).min(1).max(200),
  exchange: z.string().min(1).max(20).default("hyperliquid"),
  mode: z.enum(["paper", "live"]),
  /** The bot's config is the Automation's server-compiled snapshot. */
  automationId: z.string().uuid(),
  paperStartingEquity: z.number().positive().max(100_000_000).optional(),
})

const updateBotSchema = z.object({
  botId: z.string().min(1),
  name: z.string().min(1).max(255),
  markets: z.array(hyperliquidMarketSchema).min(1).max(200),
  params: automationConfigSchema,
})

const botCommandSchema = z.object({
  botId: z.string().min(1),
  command: z.enum([
    "start",
    "stop",
    "pause",
    "resume",
    "flatten",
    "update_params",
  ]),
})

const botIdSchema = z.object({ botId: z.string().min(1) })

const globalCommandSchema = z.object({
  command: z.enum(["pause_all", "flatten_all"]),
})

export function getBotErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Bot request failed."
}

const loadBotsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BotListResponse> => {
    const user = await requireUser()
    return botListForUser(user.id)
  }
)

const loadBotDetailFn = createServerFn({ method: "POST" })
  .inputValidator(botIdSchema)
  .handler(async ({ data }): Promise<BotDetailResponse> => {
    const user = await requireUser()
    const { getBotDetail } = await import("@/server/bots")
    const [detail, workerOnline] = await Promise.all([
      getBotDetail(user.id, data.botId),
      botWorkerOnline(),
    ])

    return {
      bot: {
        ...serializeBotRow(
          detail.bot,
          detail.wallet?.label ?? "",
          detail.wallet?.network ?? ""
        ),
        // Normalized so `params.kind` is always set (pre-kind configs lack
        // it in the DB); archived legacy params pass through untouched.
        params:
          normalizeAutomationConfig(detail.bot.params) ??
          (detail.bot.params as AutomationConfig),
        paper_starting_equity: detail.bot.paperStartingEquity
          ? Number(detail.bot.paperStartingEquity)
          : null,
        source_name: detail.sourceName,
        automation_id: detail.bot.automationId,
        realized_pnl: Number(detail.aggregates?.realizedPnl ?? 0),
        trade_count: Number(detail.aggregates?.tradeCount ?? 0),
        ...aggregateBotStates(detail.states),
      },
      states: detail.states.map((state) => ({
        market: state.market,
        status: state.status,
        status_reason: state.statusReason,
        strategy_state: state.strategyState as JsonValue,
        paper_position: state.paperPosition as {
          szi: number
          entryPx: number
        } | null,
        paper_cash: state.paperCash ? Number(state.paperCash) : null,
        daily_realized_pnl: Number(state.dailyRealizedPnl),
        consecutive_losses: state.consecutiveLosses,
        cooldown_until: state.cooldownUntil?.toISOString() ?? null,
        peak_equity: state.peakEquity ? Number(state.peakEquity) : null,
        last_eval_at: state.lastEvalAt?.toISOString() ?? null,
      })),
      trades: detail.trades.map((trade) => ({
        id: trade.id,
        market: trade.market,
        side: trade.side,
        px: trade.px,
        sz: trade.sz,
        notional: trade.notional,
        fee: trade.fee,
        closed_pnl: trade.closedPnl,
        fill_time: trade.fillTime.toISOString(),
      })),
      open_orders: detail.openOrders.map((order) => ({
        id: order.id,
        market: order.market,
        side: order.side,
        px: order.px,
        sz: order.sz,
        purpose: order.purpose,
        status: order.status,
      })),
      events: detail.events.map((event) => ({
        id: event.id,
        level: event.level,
        type: event.type,
        message: event.message,
        created_at: event.createdAt.toISOString(),
      })),
      stats: {
        realized_pnl: Number(detail.aggregates?.realizedPnl ?? 0),
        trade_count: Number(detail.aggregates?.tradeCount ?? 0),
        wins: Number(detail.aggregates?.wins ?? 0),
        losses: Number(detail.aggregates?.losses ?? 0),
      },
      workerOnline,
    }
  })

const createBotFn = createServerFn({ method: "POST" })
  .inputValidator(createBotSchema)
  .handler(async ({ data }): Promise<{ botId: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { createUserBot } = await import("@/server/bots")
    requireAppOrigin()
    const user = await requireUser()
    const bot = await createUserBot(user.id, data)
    return { botId: bot.id }
  })

const updateBotFn = createServerFn({ method: "POST" })
  .inputValidator(updateBotSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { updateUserBot } = await import("@/server/bots")
    requireAppOrigin()
    const user = await requireUser()
    await updateUserBot(user.id, data.botId, {
      name: data.name,
      markets: data.markets,
      params: data.params,
    })
    return { ok: true }
  })

const botCommandFn = createServerFn({ method: "POST" })
  .inputValidator(botCommandSchema)
  .handler(async ({ data }): Promise<BotListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { sendBotCommand } = await import("@/server/bots")
    requireAppOrigin()
    const user = await requireUser()
    await sendBotCommand(user.id, data.botId, data.command)
    return botListForUser(user.id)
  })

const globalCommandFn = createServerFn({ method: "POST" })
  .inputValidator(globalCommandSchema)
  .handler(async ({ data }): Promise<BotListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { sendGlobalBotCommand } = await import("@/server/bots")
    requireAppOrigin()
    const user = await requireUser()
    await sendGlobalBotCommand(user.id, data.command)
    return botListForUser(user.id)
  })

const deleteBotFn = createServerFn({ method: "POST" })
  .inputValidator(botIdSchema)
  .handler(async ({ data }): Promise<BotListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { deleteUserBot } = await import("@/server/bots")
    requireAppOrigin()
    const user = await requireUser()
    await deleteUserBot(user.id, data.botId)
    return botListForUser(user.id)
  })

export function loadBots() {
  return loadBotsFn()
}

export function loadBotDetail(botId: string) {
  return loadBotDetailFn({ data: { botId } })
}

export function createBot(input: z.infer<typeof createBotSchema>) {
  return createBotFn({ data: input })
}

export function updateBot(input: z.infer<typeof updateBotSchema>) {
  return updateBotFn({ data: input })
}

export function sendCommand(
  botId: string,
  command: z.infer<typeof botCommandSchema>["command"]
) {
  return botCommandFn({ data: { botId, command } })
}

export function sendGlobalCommand(command: "pause_all" | "flatten_all") {
  return globalCommandFn({ data: { command } })
}

export function deleteBot(botId: string) {
  return deleteBotFn({ data: { botId } })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

/**
 * Folds a bot's per-market state rows into what the fleet list needs: open
 * positions (paper brokers only — live brokers persist null) and realized
 * P&L for the current UTC day (the worker keys dailyPnlDate to UTC).
 */
function aggregateBotStates(
  rows: {
    market: string
    paperPosition: unknown
    dailyRealizedPnl: string | number | null
    dailyPnlDate: string | null
  }[]
): { positions: BotListPosition[]; daily_realized_pnl: number } {
  const today = new Date().toISOString().slice(0, 10)
  const positions: BotListPosition[] = []
  let daily = 0
  for (const row of rows) {
    const raw = row.paperPosition as {
      szi?: unknown
      entryPx?: unknown
    } | null
    const szi = raw ? Number(raw.szi ?? 0) : 0
    if (szi !== 0) {
      positions.push({
        market: row.market,
        szi,
        entry_px: Number(raw?.entryPx ?? 0),
      })
    }
    if (row.dailyPnlDate === today) daily += Number(row.dailyRealizedPnl ?? 0)
  }
  return { positions, daily_realized_pnl: daily }
}

/** True while the bot worker's newest heartbeat is fresh (last 30s). */
async function botWorkerOnline(): Promise<boolean> {
  const { desc, sql } = await import("drizzle-orm")
  const { db } = await import("@/server/db")
  const { tradingWorkerHeartbeats } = await import("@/server/schema")
  const [heartbeat] = await db
    .select({ lastSeenAt: tradingWorkerHeartbeats.lastSeenAt })
    .from(tradingWorkerHeartbeats)
    .where(sql`${tradingWorkerHeartbeats.meta}->>'workerKind' = 'bot'`)
    .orderBy(desc(tradingWorkerHeartbeats.lastSeenAt))
    .limit(1)
  return heartbeat
    ? Date.now() - heartbeat.lastSeenAt.getTime() < 30_000
    : false
}

async function botListForUser(userId: string): Promise<BotListResponse> {
  const { listUserBots, listUserBotStates } = await import("@/server/bots")
  const { getGuardianStatus } = await import("@/server/guardian")

  const [rows, stateRows, workerOnline, guardian] = await Promise.all([
    listUserBots(userId),
    listUserBotStates(userId),
    botWorkerOnline(),
    getGuardianStatus(userId),
  ])

  const statesByBot = new Map<string, typeof stateRows>()
  for (const state of stateRows) {
    const list = statesByBot.get(state.botId)
    if (list) list.push(state)
    else statesByBot.set(state.botId, [state])
  }

  return {
    bots: rows.map((row) => ({
      ...serializeBotRow(row.bot, row.walletLabel, row.network),
      realized_pnl: Number(row.realizedPnl),
      trade_count: row.tradeCount,
      ...aggregateBotStates(statesByBot.get(row.bot.id) ?? []),
    })),
    workerOnline,
    guardian,
  }
}

type BotRow = {
  id: string
  name: string
  strategyType: string
  markets: string[]
  exchange: string
  mode: string
  desiredState: string
  status: string
  statusReason: string | null
  createdAt: Date
  updatedAt: Date
}

function serializeBotRow(bot: BotRow, walletLabel: string, network: string) {
  return {
    id: bot.id,
    name: bot.name,
    markets: bot.markets,
    exchange: bot.exchange,
    mode: bot.mode as "paper" | "live",
    desired_state: bot.desiredState,
    status: bot.status,
    status_reason: bot.statusReason,
    wallet_label: walletLabel,
    network,
    realized_pnl: 0,
    trade_count: 0,
    created_at: bot.createdAt.toISOString(),
    updated_at: bot.updatedAt.toISOString(),
  }
}
