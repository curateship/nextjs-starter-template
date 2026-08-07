import {
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
