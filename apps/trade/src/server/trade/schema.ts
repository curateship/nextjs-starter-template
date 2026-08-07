import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import type { ChartView } from "@/lib/trade/chart-view"
import type { DrawingShape } from "@/lib/trade/drawings"
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
