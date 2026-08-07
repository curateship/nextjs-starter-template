import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import type { ChartView } from "@/lib/trade/chart-view"
import type { DrawingShape } from "@/lib/trade/drawings"
import type { PaperFillReason, PaperSide } from "@/lib/trade/paper"
import type { WalletKind } from "@/lib/trade/wallets"
import { customShellUsers } from "@/server/schema"

/**
 * This app's own tables. The shell's `schema.ts` is a shell file and can
 * never be edited here, so anything Trade itself stores is declared in this
 * file and created by a migration the app added — `drizzle/0100_...` up.
 *
 * App migrations are numbered from 0100 on purpose: the shell keeps adding
 * its own under 00xx, the runner applies the folder in filename order, and
 * the gap means a future shell merge can never collide with or run after an
 * app migration it should have preceded.
 */

/**
 * Which markets each person has starred, as market keys —
 * `"hyperliquid:mainnet:BTC"` — never bare symbols, so favourites stay tied
 * to the right exchange when a second one exists.
 *
 * Server-side rather than in the browser's storage: favourites follow the
 * account, not the machine it happened to be starred on.
 */
export const tradeMarketFavorites = pgTable("trade_market_favorites", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  marketKeys: jsonb("market_keys").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * Each person's small trading preferences — one row per person, one column
 * per remembered thing, starting with the market they were last looking at.
 * Server-side so the memory follows the account, not the machine.
 */
export const tradePrefs = pgTable("trade_prefs", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  lastMarketKey: varchar("last_market_key", { length: 120 }),
  // How far the chart is zoomed and scrolled, in candles counted from the
  // newest one — the one form of it that means the same thing on every
  // market. `chartViewSchema` is the only way in or out.
  chartView: jsonb("chart_view").$type<ChartView>(),
  // The wallet the account panel had active. An id and nothing more: a
  // remembered choice, resolved against the wallets that exist at read time,
  // so a deleted wallet leaves a memory that simply matches nothing.
  lastWalletId: varchar("last_wallet_id", { length: 36 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * The wallets a person trades from — practice ones with pretend cash, and
 * live Hyperliquid accounts added by address.
 *
 * There is deliberately no balance column. A paper wallet's worth is derived
 * from what it started with plus what its orders did (the engine that folds
 * that returns in a later task); a live wallet's worth is whatever the
 * exchange says when asked. A stored balance would be a second copy of one of
 * those, and second copies drift.
 *
 * `agent_key_encrypted` is the one secret this app keeps: the trading key of
 * a live wallet, stored only as `encryptSecret` ciphertext (`iv.tag.data`),
 * decrypted only at the moment an order needs signing — which no code in this
 * task does yet. It never leaves the server; list reads say `hasKey: true`.
 *
 * The key is the person and the wallet together, same as the drawings table:
 * every write is scoped by it, so a request carrying somebody else's wallet
 * id can only ever touch a row of its own.
 */
export const tradeWallets = pgTable(
  "trade_wallets",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 36 }).notNull(),
    label: varchar("label", { length: 40 }).notNull(),
    kind: varchar("kind", { length: 8 }).$type<WalletKind>().notNull(),
    protocol: varchar("protocol", { length: 20 }).$type<ProtocolId>().notNull(),
    network: varchar("network", { length: 10 }).$type<NetworkId>().notNull(),
    // Paper: the pretend cash it began with. Live: the account's value the
    // moment it was added — the baseline "Since it started" measures from.
    startingBalance: doublePrecision("starting_balance").notNull(),
    // Live wallets only: the public account address, 0x + 40 hex.
    address: varchar("address", { length: 42 }),
    agentKeyEncrypted: text("agent_key_encrypted"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })]
)

/**
 * The lines people draw on the chart, one row each, tied to the market they
 * were drawn on — `"hyperliquid:mainnet:BTC"` — so a base marked on BTC never
 * turns up on ETH.
 *
 * The shape itself is one jsonb column rather than a column per kind: a level
 * and a trendline hold different things, and a third kind later should be a
 * new shape to validate, not a migration. `drawingShapeSchema` is the only way
 * in or out, so a row that cannot be read is dropped rather than drawn wrong.
 *
 * The key is the person and the drawing together. That is not decoration: a
 * save is an upsert keyed on it, so a request carrying somebody else's
 * drawing id can only ever write a row of its own.
 */
export const tradeChartDrawings = pgTable(
  "trade_chart_drawings",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 36 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    shape: jsonb("shape").$type<DrawingShape>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("trade_chart_drawings_market_idx").on(table.userId, table.marketKey),
  ]
)

/**
 * The practice trading engine's four tables.
 *
 * They share one shape: keyed by the person, hung off `trade_wallets` by the
 * pair (user_id, wallet_id) so a deleted wallet takes its whole history with
 * it, and holding only facts. Cash, margin, liquidation prices and open profit
 * are all arithmetic on these rows plus today's price — worked out on read by
 * `@/lib/trade/paper`, never stored, because a stored copy of a derived figure
 * is a second answer that drifts from the first.
 */

/** Everything each engine table needs to name its owner and its wallet. */
function paperOwner() {
  return {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    walletId: varchar("wallet_id", { length: 36 }).notNull(),
  }
}

/**
 * What a paper wallet is holding, one row per market. `szi` is signed —
 * positive is long, negative is short — because every sum built from it wants
 * the direction anyway.
 */
export const tradePaperPositions = pgTable(
  "trade_paper_positions",
  {
    ...paperOwner(),
    id: varchar("id", { length: 36 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    szi: doublePrecision("szi").notNull(),
    entryPx: doublePrecision("entry_px").notNull(),
    // Fixed when the position opened; anything added to it inherits this.
    leverage: doublePrecision("leverage").notNull(),
    // The market's own limit, copied at that moment — the liquidation estimate
    // is built from it and the exchange's answer can change underneath.
    maxLeverage: doublePrecision("max_leverage").notNull(),
    tpPx: doublePrecision("tp_px"),
    slPx: doublePrecision("sl_px"),
    feesPaid: doublePrecision("fees_paid").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    uniqueIndex("trade_paper_positions_market_idx").on(
      table.userId,
      table.walletId,
      table.marketKey
    ),
    foreignKey({
      columns: [table.userId, table.walletId],
      foreignColumns: [tradeWallets.userId, tradeWallets.id],
    }).onDelete("cascade"),
  ]
)

/**
 * Orders still waiting to fill, and only those: filling or cancelling one
 * deletes the row. The journal is where history lives, and a second history
 * would drift from it.
 */
export const tradePaperOrders = pgTable(
  "trade_paper_orders",
  {
    ...paperOwner(),
    id: varchar("id", { length: 36 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    side: varchar("side", { length: 4 }).$type<PaperSide>().notNull(),
    px: doublePrecision("px").notNull(),
    sz: doublePrecision("sz").notNull(),
    leverage: doublePrecision("leverage").notNull(),
    maxLeverage: doublePrecision("max_leverage").notNull(),
    reduceOnly: boolean("reduce_only").notNull().default(false),
    // The brackets to hand the position this order opens, once it fills.
    tpPx: doublePrecision("tp_px"),
    slPx: doublePrecision("sl_px"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("trade_paper_orders_wallet_idx").on(table.userId, table.walletId),
    foreignKey({
      columns: [table.userId, table.walletId],
      foreignColumns: [tradeWallets.userId, tradeWallets.id],
    }).onDelete("cascade"),
  ]
)

/**
 * Every fill that ever happened, and why it happened. Both the trade history
 * the Journal tab shows and the ledger the wallet's cash is added up from,
 * which is why nothing is ever removed from it.
 */
export const tradePaperJournal = pgTable(
  "trade_paper_journal",
  {
    ...paperOwner(),
    id: varchar("id", { length: 36 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    side: varchar("side", { length: 4 }).$type<PaperSide>().notNull(),
    px: doublePrecision("px").notNull(),
    sz: doublePrecision("sz").notNull(),
    fee: doublePrecision("fee").notNull(),
    closedPnl: doublePrecision("closed_pnl").notNull().default(0),
    reason: varchar("reason", { length: 16 })
      .$type<PaperFillReason>()
      .notNull(),
    fillTime: timestamp("fill_time", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("trade_paper_journal_wallet_idx").on(
      table.userId,
      table.walletId,
      table.fillTime
    ),
    foreignKey({
      columns: [table.userId, table.walletId],
      foreignColumns: [tradeWallets.userId, tradeWallets.id],
    }).onDelete("cascade"),
  ]
)

/**
 * How far the engine has replayed each wallet. Nothing runs in the background:
 * reading an account replays the candles since this moment first, so a wallet
 * left alone for a day catches up the moment somebody looks at it.
 */
export const tradePaperState = pgTable(
  "trade_paper_state",
  {
    ...paperOwner(),
    settledTo: timestamp("settled_to", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.walletId] }),
    foreignKey({
      columns: [table.userId, table.walletId],
      foreignColumns: [tradeWallets.userId, tradeWallets.id],
    }).onDelete("cascade"),
  ]
)
