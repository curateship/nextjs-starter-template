import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { JsonValue } from "@/lib/api/audit"
import {
  riskParamsSchema,
  strategyParamsSchema,
  type RiskParams,
  type StrategyParams,
  type StrategyType,
} from "@/lib/strategies/params"

export type BotListItem = {
  id: string
  name: string
  strategy_type: StrategyType
  market: string
  mode: "paper" | "live"
  desired_state: string
  status: string
  status_reason: string | null
  wallet_label: string
  network: string
  realized_pnl: number
  trade_count: number
  created_at: string
  updated_at: string
}

export type BotListResponse = {
  bots: BotListItem[]
  workerOnline: boolean
}

export type BotDetailResponse = {
  bot: BotListItem & {
    params: StrategyParams
    risk_params: RiskParams
    paper_starting_equity: number | null
  }
  state: {
    strategy_state: JsonValue
    paper_position: { szi: number; entryPx: number } | null
    paper_cash: number | null
    daily_realized_pnl: number
    consecutive_losses: number
    cooldown_until: string | null
    peak_equity: number | null
    last_eval_at: string | null
  } | null
  trades: {
    id: string
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
}

const createBotSchema = z.object({
  name: z.string().min(1).max(255),
  walletId: z.string().min(1),
  market: z.string().min(1).max(20),
  mode: z.enum(["paper", "live"]),
  params: strategyParamsSchema,
  riskParams: riskParamsSchema,
  paperStartingEquity: z.number().positive().max(100_000_000).optional(),
})

const updateBotSchema = z.object({
  botId: z.string().min(1),
  name: z.string().min(1).max(255),
  params: strategyParamsSchema,
  riskParams: riskParamsSchema,
})

const botCommandSchema = z.object({
  botId: z.string().min(1),
  command: z.enum(["start", "stop", "pause", "resume", "flatten", "update_params"]),
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
    const detail = await getBotDetail(user.id, data.botId)

    return {
      bot: {
        ...serializeBotRow(detail.bot, detail.wallet?.label ?? "", detail.wallet?.network ?? ""),
        params: detail.bot.params as StrategyParams,
        risk_params: detail.bot.riskParams as RiskParams,
        paper_starting_equity: detail.bot.paperStartingEquity
          ? Number(detail.bot.paperStartingEquity)
          : null,
        realized_pnl: Number(detail.aggregates?.realizedPnl ?? 0),
        trade_count: Number(detail.aggregates?.tradeCount ?? 0),
      },
      state: detail.state
        ? {
            strategy_state: detail.state.strategyState as JsonValue,
            paper_position: detail.state.paperPosition as {
              szi: number
              entryPx: number
            } | null,
            paper_cash: detail.state.paperCash
              ? Number(detail.state.paperCash)
              : null,
            daily_realized_pnl: Number(detail.state.dailyRealizedPnl),
            consecutive_losses: detail.state.consecutiveLosses,
            cooldown_until: detail.state.cooldownUntil?.toISOString() ?? null,
            peak_equity: detail.state.peakEquity
              ? Number(detail.state.peakEquity)
              : null,
            last_eval_at: detail.state.lastEvalAt?.toISOString() ?? null,
          }
        : null,
      trades: detail.trades.map((trade) => ({
        id: trade.id,
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
      params: data.params,
      riskParams: data.riskParams,
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

async function botListForUser(userId: string): Promise<BotListResponse> {
  const { listUserBots } = await import("@/server/bots")
  const { desc } = await import("drizzle-orm")
  const { db } = await import("@/server/db")
  const { tradingWorkerHeartbeats } = await import("@/server/schema")

  const [rows, [heartbeat]] = await Promise.all([
    listUserBots(userId),
    db
      .select({ lastSeenAt: tradingWorkerHeartbeats.lastSeenAt })
      .from(tradingWorkerHeartbeats)
      .orderBy(desc(tradingWorkerHeartbeats.lastSeenAt))
      .limit(1),
  ])

  return {
    bots: rows.map((row) => ({
      ...serializeBotRow(row.bot, row.walletLabel, row.network),
      realized_pnl: Number(row.realizedPnl),
      trade_count: row.tradeCount,
    })),
    workerOnline: heartbeat
      ? Date.now() - heartbeat.lastSeenAt.getTime() < 30_000
      : false,
  }
}

type BotRow = {
  id: string
  name: string
  strategyType: string
  market: string
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
    strategy_type: bot.strategyType as StrategyType,
    market: bot.market,
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
