import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

export const customShellUsers = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const customShellSessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_sessions_user_id").on(table.userId),
    index("ix_sessions_token_hash").on(table.tokenHash),
    index("ix_sessions_expires_at").on(table.expiresAt),
  ]
)

export const customShellSettings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    settings: jsonb("settings").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("settings_default_key", sql`${table.key} = 'default'`),
  ]
)

export const customShellWorkspaces = pgTable(
  "workspaces",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    settings: jsonb("settings").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_workspaces_user_id").on(table.userId),
  ]
)

export const customShellFeedback = pgTable(
  "feedback",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "feedback_type_check",
      sql`${table.type} in ('suggestion', 'bug_report', 'question', 'praise')`
    ),
    index("ix_feedback_user_id").on(table.userId),
    index("ix_feedback_type").on(table.type),
  ]
)

export const customShellFeedbackVotes = pgTable(
  "feedback_votes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => customShellFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("feedback_votes_unique_user").on(
      table.feedbackId,
      table.userId
    ),
    index("ix_feedback_votes_feedback_id").on(table.feedbackId),
    index("ix_feedback_votes_user_id").on(table.userId),
  ]
)

export const customShellFeedbackComments = pgTable(
  "feedback_comments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => customShellFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_feedback_comments_feedback_id").on(table.feedbackId),
    index("ix_feedback_comments_user_id").on(table.userId),
    index("ix_feedback_comments_created_at").on(table.createdAt),
  ]
)

export const customShellNotifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    recipientUserId: varchar("recipient_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => customShellFeedback.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    feedbackVoteId: varchar("feedback_vote_id", { length: 36 }).references(
      () => customShellFeedbackVotes.id,
      { onDelete: "cascade" }
    ),
    feedbackCommentId: varchar("feedback_comment_id", {
      length: 36,
    }).references(() => customShellFeedbackComments.id, {
      onDelete: "cascade",
    }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "notifications_type_check",
      sql`${table.type} in ('feedback_vote', 'feedback_comment')`
    ),
    index("ix_notifications_recipient_created").on(
      table.recipientUserId,
      table.createdAt
    ),
    index("ix_notifications_feedback_id").on(table.feedbackId),
    index("ix_notifications_vote_id").on(table.feedbackVoteId),
    index("ix_notifications_comment_id").on(
      table.feedbackCommentId
    ),
  ]
)

export const customShellMedia = pgTable(
  "media",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    altText: text("alt_text"),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 20 }).notNull(),
    storagePath: text("storage_path").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "media_file_type_check",
      sql`${table.fileType} in ('image', 'video')`
    ),
    index("ix_media_user_id").on(table.userId),
    index("ix_media_file_type").on(table.fileType),
    index("ix_media_created_at").on(table.createdAt),
    index("ix_media_user_type_created").on(
      table.userId,
      table.fileType,
      table.createdAt
    ),
  ]
)

export const tradingWallets = pgTable(
  "wallets",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 255 }).notNull(),
    network: varchar("network", { length: 10 }).notNull(),
    accountAddress: varchar("account_address", { length: 42 }).notNull(),
    agentAddress: varchar("agent_address", { length: 42 }).notNull(),
    vaultAddress: varchar("vault_address", { length: 42 }),
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "wallets_network_check",
      sql`${table.network} in ('testnet', 'mainnet')`
    ),
    unique("wallets_unique_user_agent_network").on(
      table.userId,
      table.agentAddress,
      table.network
    ),
    index("ix_wallets_user_id").on(table.userId),
  ]
)

export const tradingWalletNonces = pgTable(
  "wallet_nonces",
  {
    agentAddress: varchar("agent_address", { length: 42 }).notNull(),
    network: varchar("network", { length: 10 }).notNull(),
    lastNonce: bigint("last_nonce", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "wallet_nonces_pkey",
      columns: [table.agentAddress, table.network],
    }),
  ]
)

export const tradingBots = pgTable(
  "bots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    strategyType: varchar("strategy_type", { length: 20 }).notNull(),
    walletId: varchar("wallet_id", { length: 36 })
      .notNull()
      .references(() => tradingWallets.id, { onDelete: "restrict" }),
    market: varchar("market", { length: 20 }).notNull(),
    mode: varchar("mode", { length: 10 }).notNull(),
    desiredState: varchar("desired_state", { length: 10 })
      .notNull()
      .default("stopped"),
    status: varchar("status", { length: 10 }).notNull().default("stopped"),
    statusReason: text("status_reason"),
    params: jsonb("params").notNull(),
    riskParams: jsonb("risk_params").notNull(),
    cloidPrefix: varchar("cloid_prefix", { length: 10 }).notNull().unique(),
    paperStartingEquity: numeric("paper_starting_equity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "bots_strategy_type_check",
      sql`${table.strategyType} in ('grid', 'dca', 'momentum', 'copy')`
    ),
    check("bots_mode_check", sql`${table.mode} in ('paper', 'live')`),
    check(
      "bots_desired_state_check",
      sql`${table.desiredState} in ('running', 'paused', 'stopped')`
    ),
    check(
      "bots_status_check",
      sql`${table.status} in ('stopped', 'starting', 'running', 'paused', 'error', 'killed')`
    ),
    index("ix_bots_user_id").on(table.userId),
    index("ix_bots_wallet_id").on(table.walletId),
  ]
)

export const tradingBotState = pgTable("bot_state", {
  botId: varchar("bot_id", { length: 36 })
    .primaryKey()
    .references(() => tradingBots.id, { onDelete: "cascade" }),
  strategyState: jsonb("strategy_state").notNull().default({}),
  paperPosition: jsonb("paper_position"),
  paperCash: numeric("paper_cash"),
  dailyRealizedPnl: numeric("daily_realized_pnl").notNull().default("0"),
  dailyPnlDate: date("daily_pnl_date"),
  consecutiveLosses: integer("consecutive_losses").notNull().default(0),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  peakEquity: numeric("peak_equity"),
  lastEvalAt: timestamp("last_eval_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const tradingBotOrders = pgTable(
  "bot_orders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    botId: varchar("bot_id", { length: 36 })
      .notNull()
      .references(() => tradingBots.id, { onDelete: "cascade" }),
    cloid: varchar("cloid", { length: 66 }).notNull().unique(),
    oid: bigint("oid", { mode: "number" }),
    market: varchar("market", { length: 20 }).notNull(),
    side: varchar("side", { length: 4 }).notNull(),
    px: numeric("px"),
    sz: numeric("sz").notNull(),
    remainingSz: numeric("remaining_sz").notNull(),
    orderType: varchar("order_type", { length: 10 }).notNull(),
    tif: varchar("tif", { length: 3 }).notNull(),
    reduceOnly: boolean("reduce_only").notNull().default(false),
    purpose: varchar("purpose", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("bot_orders_side_check", sql`${table.side} in ('buy', 'sell')`),
    check(
      "bot_orders_order_type_check",
      sql`${table.orderType} in ('market', 'limit')`
    ),
    check("bot_orders_tif_check", sql`${table.tif} in ('Gtc', 'Ioc', 'Alo')`),
    check(
      "bot_orders_status_check",
      sql`${table.status} in ('pending', 'resting', 'partially_filled', 'filled', 'cancelled', 'rejected')`
    ),
    index("ix_bot_orders_bot_id_status").on(table.botId, table.status),
  ]
)

export const tradingBotTrades = pgTable(
  "bot_trades",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    botId: varchar("bot_id", { length: 36 })
      .notNull()
      .references(() => tradingBots.id, { onDelete: "cascade" }),
    walletId: varchar("wallet_id", { length: 36 }).references(
      () => tradingWallets.id,
      { onDelete: "set null" }
    ),
    mode: varchar("mode", { length: 10 }).notNull(),
    market: varchar("market", { length: 20 }).notNull(),
    side: varchar("side", { length: 4 }).notNull(),
    px: numeric("px").notNull(),
    sz: numeric("sz").notNull(),
    notional: numeric("notional").notNull(),
    fee: numeric("fee").notNull().default("0"),
    closedPnl: numeric("closed_pnl"),
    cloid: varchar("cloid", { length: 66 }),
    oid: bigint("oid", { mode: "number" }),
    hlTid: bigint("hl_tid", { mode: "number" }),
    fillTime: timestamp("fill_time", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("bot_trades_mode_check", sql`${table.mode} in ('paper', 'live')`),
    check("bot_trades_side_check", sql`${table.side} in ('buy', 'sell')`),
    uniqueIndex("ux_bot_trades_bot_id_hl_tid")
      .on(table.botId, table.hlTid)
      .where(sql`${table.hlTid} is not null`),
    index("ix_bot_trades_bot_id_fill_time").on(table.botId, table.fillTime),
  ]
)

export const tradingBotEvents = pgTable(
  "bot_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    botId: varchar("bot_id", { length: 36 })
      .notNull()
      .references(() => tradingBots.id, { onDelete: "cascade" }),
    level: varchar("level", { length: 5 }).notNull(),
    type: varchar("type", { length: 40 }).notNull(),
    message: text("message").notNull(),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "bot_events_level_check",
      sql`${table.level} in ('info', 'warn', 'error')`
    ),
    index("ix_bot_events_bot_id_created_at").on(table.botId, table.createdAt),
  ]
)

export const tradingBotCommands = pgTable(
  "bot_commands",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    botId: varchar("bot_id", { length: 36 }).references(() => tradingBots.id, {
      onDelete: "cascade",
    }),
    command: varchar("command", { length: 20 }).notNull(),
    payload: jsonb("payload"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    error: text("error"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "bot_commands_command_check",
      sql`${table.command} in ('start', 'stop', 'pause', 'resume', 'flatten', 'update_params', 'pause_all', 'flatten_all')`
    ),
    check(
      "bot_commands_status_check",
      sql`${table.status} in ('pending', 'processing', 'done', 'error')`
    ),
    index("ix_bot_commands_status_created_at").on(
      table.status,
      table.createdAt
    ),
  ]
)

export const tradingAuditLog = pgTable(
  "audit_log",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    walletId: varchar("wallet_id", { length: 36 }).references(
      () => tradingWallets.id,
      { onDelete: "set null" }
    ),
    botId: varchar("bot_id", { length: 36 }).references(() => tradingBots.id, {
      onDelete: "set null",
    }),
    actor: varchar("actor", { length: 10 }).notNull(),
    actionType: varchar("action_type", { length: 40 }).notNull(),
    network: varchar("network", { length: 10 }).notNull(),
    market: varchar("market", { length: 20 }),
    nonce: bigint("nonce", { mode: "number" }),
    cloid: varchar("cloid", { length: 66 }),
    request: jsonb("request").notNull(),
    response: jsonb("response"),
    status: varchar("status", { length: 20 }).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "audit_log_actor_check",
      sql`${table.actor} in ('user', 'bot', 'system')`
    ),
    check(
      "audit_log_status_check",
      sql`${table.status} in ('ok', 'error', 'rejected_risk')`
    ),
    index("ix_audit_log_wallet_id_created_at").on(
      table.walletId,
      table.createdAt
    ),
    index("ix_audit_log_bot_id_created_at").on(table.botId, table.createdAt),
    index("ix_audit_log_created_at").on(table.createdAt),
  ]
)

export const tradingAccountSnapshots = pgTable(
  "account_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    walletId: varchar("wallet_id", { length: 36 })
      .notNull()
      .references(() => tradingWallets.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    equity: numeric("equity").notNull(),
    marginUsed: numeric("margin_used").notNull(),
    unrealizedPnl: numeric("unrealized_pnl").notNull(),
    withdrawable: numeric("withdrawable").notNull(),
    positions: jsonb("positions").notNull(),
  },
  (table) => [
    index("ix_account_snapshots_wallet_id_captured_at").on(
      table.walletId,
      table.capturedAt
    ),
  ]
)

export const tradingPaperWallets = pgTable(
  "paper_wallets",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 255 }).notNull(),
    startingEquity: numeric("starting_equity").notNull(),
    cash: numeric("cash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_paper_wallets_user_id").on(table.userId)]
)

export const tradingPaperPositions = pgTable(
  "paper_positions",
  {
    paperWalletId: varchar("paper_wallet_id", { length: 36 })
      .notNull()
      .references(() => tradingPaperWallets.id, { onDelete: "cascade" }),
    coin: varchar("coin", { length: 20 }).notNull(),
    szi: numeric("szi").notNull(),
    entryPx: numeric("entry_px").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "paper_positions_pkey",
      columns: [table.paperWalletId, table.coin],
    }),
  ]
)

export const tradingPaperOrders = pgTable(
  "paper_orders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    paperWalletId: varchar("paper_wallet_id", { length: 36 })
      .notNull()
      .references(() => tradingPaperWallets.id, { onDelete: "cascade" }),
    coin: varchar("coin", { length: 20 }).notNull(),
    side: varchar("side", { length: 4 }).notNull(),
    orderType: varchar("order_type", { length: 10 }).notNull(),
    px: numeric("px"),
    sz: numeric("sz").notNull(),
    remainingSz: numeric("remaining_sz").notNull(),
    tif: varchar("tif", { length: 3 }).notNull(),
    reduceOnly: boolean("reduce_only").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("paper_orders_side_check", sql`${table.side} in ('buy', 'sell')`),
    check(
      "paper_orders_order_type_check",
      sql`${table.orderType} in ('market', 'limit')`
    ),
    check("paper_orders_tif_check", sql`${table.tif} in ('Gtc', 'Ioc', 'Alo')`),
    check(
      "paper_orders_status_check",
      sql`${table.status} in ('pending', 'resting', 'filled', 'cancelled', 'cancelling', 'rejected')`
    ),
    index("ix_paper_orders_wallet_status").on(
      table.paperWalletId,
      table.status
    ),
  ]
)

export const tradingPaperFills = pgTable(
  "paper_fills",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    paperWalletId: varchar("paper_wallet_id", { length: 36 })
      .notNull()
      .references(() => tradingPaperWallets.id, { onDelete: "cascade" }),
    coin: varchar("coin", { length: 20 }).notNull(),
    side: varchar("side", { length: 4 }).notNull(),
    px: numeric("px").notNull(),
    sz: numeric("sz").notNull(),
    fee: numeric("fee").notNull(),
    closedPnl: numeric("closed_pnl").notNull(),
    fillTime: timestamp("fill_time", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("paper_fills_side_check", sql`${table.side} in ('buy', 'sell')`),
    index("ix_paper_fills_wallet_fill_time").on(
      table.paperWalletId,
      table.fillTime
    ),
  ]
)

export const tradingWorkerHeartbeats = pgTable("worker_heartbeats", {
  id: varchar("id", { length: 36 }).primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  version: varchar("version", { length: 40 }),
  meta: jsonb("meta"),
})

export type CustomShellUser = typeof customShellUsers.$inferSelect
export type CustomShellWorkspace = typeof customShellWorkspaces.$inferSelect
export type CustomShellMedia = typeof customShellMedia.$inferSelect
export type CustomShellFeedback = typeof customShellFeedback.$inferSelect
export type CustomShellFeedbackComment =
  typeof customShellFeedbackComments.$inferSelect
export type CustomShellNotification =
  typeof customShellNotifications.$inferSelect
export type TradingWallet = typeof tradingWallets.$inferSelect
export type TradingBot = typeof tradingBots.$inferSelect
export type TradingBotState = typeof tradingBotState.$inferSelect
export type TradingBotOrder = typeof tradingBotOrders.$inferSelect
export type TradingBotTrade = typeof tradingBotTrades.$inferSelect
export type TradingBotEvent = typeof tradingBotEvents.$inferSelect
export type TradingBotCommand = typeof tradingBotCommands.$inferSelect
export type TradingAuditLogEntry = typeof tradingAuditLog.$inferSelect
export type TradingAccountSnapshot =
  typeof tradingAccountSnapshots.$inferSelect
export type TradingWorkerHeartbeat =
  typeof tradingWorkerHeartbeats.$inferSelect
export type TradingPaperWallet = typeof tradingPaperWallets.$inferSelect
export type TradingPaperPosition = typeof tradingPaperPositions.$inferSelect
export type TradingPaperOrder = typeof tradingPaperOrders.$inferSelect
export type TradingPaperFill = typeof tradingPaperFills.$inferSelect
