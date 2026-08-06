import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

import type { ChartView } from "@/lib/trade/chart-view"
import type { DrawingShape } from "@/lib/trade/drawings"
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
  // The wallet the account panel was last showing. Just a memory: a wallet
  // that has since been deleted resolves to "none picked", never to somebody
  // else's.
  lastWalletId: varchar("last_wallet_id", { length: 36 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

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
 * Paper wallets: a name, a starting balance, and which exchange's prices they
 * trade at. Pretend money, so there is no address here and no secret of any
 * kind — a paper wallet cannot spend anything by construction.
 *
 * The balance itself is deliberately not a column. It is the starting figure
 * folded through every fill (`foldPaperAccount`), so there is one number that
 * can be wrong rather than two that drift apart and no way to tell which one
 * lied. Resetting a wallet is simply throwing its orders away.
 *
 * `kind` is here for the wallets that come next — watching a real address, and
 * later a testnet one. They are the same idea with a different source of
 * truth, and they belong in this table rather than a parallel one.
 */
export const tradeWallets = pgTable(
  "trade_wallets",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 36 }).notNull(),
    label: varchar("label", { length: 60 }).notNull(),
    /** "paper" today. */
    kind: varchar("kind", { length: 16 }).notNull(),
    protocol: varchar("protocol", { length: 32 }).notNull(),
    network: varchar("network", { length: 16 }).notNull(),
    startingBalance: doublePrecision("starting_balance").notNull(),
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
 * Every paper order ever placed: the ones still waiting and the ones that
 * traded, in one table, because a filled order *is* the trade. A separate
 * fills table would be the same rows written twice.
 *
 * Money is stored as plain double precision rather than an exact decimal.
 * This is pretend money whose whole job is to be read on a screen, and every
 * figure it produces is a fold of prices that arrived as decimal strings from
 * an exchange anyway — exactness here would be a costume, not a guarantee.
 *
 * Keyed on the person and the order together, so a request carrying somebody
 * else's order id can only ever touch a row of its own.
 */
export const tradePaperOrders = pgTable(
  "trade_paper_orders",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 36 }).notNull(),
    walletId: varchar("wallet_id", { length: 36 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    /** "buy" or "sell". */
    side: varchar("side", { length: 4 }).notNull(),
    /** "market" or "limit". */
    kind: varchar("kind", { length: 8 }).notNull(),
    /** In coins. */
    size: doublePrecision("size").notNull(),
    /** What a limit is waiting for; null on a market order. */
    limitPrice: doublePrecision("limit_price"),
    leverage: doublePrecision("leverage").notNull(),
    /** "resting", "filled" or "cancelled". */
    status: varchar("status", { length: 10 }).notNull(),
    placedAt: timestamp("placed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** When it actually traded — the candle's own time, not the sweep's. */
    filledAt: timestamp("filled_at", { withTimezone: true }),
    fillPrice: doublePrecision("fill_price"),
    /** The rate charged as a fraction; the dollars are worked out from it. */
    feeRate: doublePrecision("fee_rate"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("trade_paper_orders_wallet_idx").on(table.userId, table.walletId),
  ]
)
