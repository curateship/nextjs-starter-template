import {
  bigint,
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

import type {
  CandleInterval,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import type { CardFolds } from "@/lib/trade/card-folds"
import type { ChartOptions } from "@/lib/trade/chart-options"
import type { ChartView } from "@/lib/trade/chart-view"
import type { DcaParams, LadderStatus } from "@/lib/trade/dca"
import type { TradingDashboardWidgetLayout } from "@/lib/trade/dashboard/widgets"
import type { DrawingShape } from "@/lib/trade/drawings"
import type { TradeFlowRunSpec, TradeFlowRunStatus } from "@/lib/trade/flow-run"
import type { FlowHold, FlowWaitReason } from "@/lib/trade/flow-waiting"
import type { GridParams } from "@/lib/trade/grid"
import type { OrderStyle } from "@/lib/trade/order-style"
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
import type { SmartOrderKind, SmartPlan } from "@/lib/trade/smart-plan"
import type { IndicatorSettings } from "@/lib/trade/indicators/registry"
import type { LiveJournalAction } from "@/lib/trade/live"
import type { LiveTriggerRecord } from "@/lib/trade/live-trades"
import type { PaperFillReason, PaperSide } from "@/lib/trade/paper"
import type {
  BacktestCoinSummary,
  BacktestFill,
  BacktestResult,
  BacktestSpecSnapshot,
  BacktestStatus,
  BacktestSummary,
  BacktestTrade,
} from "@/lib/trade/backtest/result"
import type { WalletKind, WalletStatus } from "@/lib/trade/wallets"
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
  /**
   * The market last looked at on each exchange, keyed by protocol id —
   * `{"hyperliquid":"hyperliquid:mainnet:BTC"}`.
   *
   * One per exchange, not one for the app. Every exchange has its own
   * dashboard, and a single memory meant only the most recently used one
   * reopened on a chart while the others opened blank and read as broken.
   */
  lastMarketKeys: jsonb("last_market_keys")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  // How far the chart is zoomed and scrolled, in candles counted from the
  // newest one — the one form of it that means the same thing on every
  // market. `chartViewSchema` is the only way in or out.
  chartView: jsonb("chart_view").$type<ChartView>(),
  // Which supporting parts of the chart are visible. Kept apart from the
  // numeric zoom and position because switching one does not move the chart.
  chartOptions: jsonb("chart_options").$type<ChartOptions>(),
  /**
   * The wallet the account panel had active on each exchange, keyed by
   * protocol id — `{"phemex":"9f201f21-…"}`.
   *
   * Ids and nothing more: remembered choices, resolved against the wallets
   * that exist at read time, so a deleted wallet leaves a memory that simply
   * matches nothing.
   *
   * One per exchange for the same reason the market above is. A dashboard
   * only lists its own exchange's wallets, so a single memory holding another
   * exchange's wallet matched nothing here — and every dashboard asked which
   * wallet to trade with on every single load, each choice wiping the last.
   */
  lastWalletIds: jsonb("last_wallet_ids")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  /**
   * The cards on this app's trading overview. Kept here per account and never
   * in the shell's dashboard setting, so moving one cannot move the platform
   * Overview for the same person.
   */
  dashboardWidgets:
    jsonb("dashboard_widgets").$type<TradingDashboardWidgetLayout>(),
  // The DCA window's last-used settings. `dcaParamsSchema` is the only way in
  // or out, so a value written by an older build falls back to the defaults.
  smartDca: jsonb("smart_dca").$type<DcaParams>(),
  // The grid window's last-used settings. A sibling of `smart_dca` and
  // deliberately not folded into it: the two windows ask for different things,
  // and each column is validated by its own schema on the way in and out.
  smartGrid: jsonb("smart_grid").$type<GridParams>(),
  // Which indicators are switched on, what each is set to, and how each one's
  // part of the menu was left folded — against the account rather than the
  // market, the same choice as the zoom above and for the same reason: however
  // you set the chart up is how every chart opens. `readIndicatorSettings` is
  // the only way in or out, so an indicator this build no longer has is
  // dropped rather than half-drawn.
  indicators: jsonb("indicators").$type<IndicatorSettings>(),
  // Which settings cards on the trading windows were left folded away. Layout
  // and nothing else — deliberately not inside `smart_dca` above, which is the
  // shape the placement endpoint validates, and has no business carrying an
  // answer about what somebody could be bothered to look at.
  cardFolds: jsonb("card_folds").$type<CardFolds>(),
  // The right-click order window's last-used settings: how much, in what, at
  // what leverage, and where it gets out. `quickOrderPrefsSchema` is the only
  // way in or out. Deliberately not carrying "only reduce what I hold", which
  // is about the position in front of you and must not follow you around.
  quickOrder: jsonb("quick_order").$type<QuickOrderPrefs>(),
  /**
   * What a plain order does while it waits: rest on the exchange, or be
   * watched here and sent when the price is reached. See `order-style.ts`;
   * resting is what every order did before the choice existed.
   */
  orderStyle: varchar("order_style", { length: 8 })
    .$type<OrderStyle>()
    .notNull()
    .default("rest"),
  // The smallest daily dollar volume shown on any exchange dashboard. One
  // account-wide number so changing exchange cannot quietly change the list.
  minimumMarketVolumeUsd: doublePrecision("minimum_market_volume_usd")
    .notNull()
    .default(0),
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
    status: varchar("status", { length: 8 })
      .$type<WalletStatus>()
      .notNull()
      .default("active"),
    protocol: varchar("protocol", { length: 20 }).$type<ProtocolId>().notNull(),
    network: varchar("network", { length: 10 }).$type<NetworkId>().notNull(),
    // Paper: the pretend cash it began with. Live: the account value saved as
    // its fixed sizing baseline for orders that do not compound.
    startingBalance: doublePrecision("starting_balance").notNull(),
    // Live wallets only: the public account address, 0x + 40 hex.
    address: varchar("address", { length: 42 }),
    agentKeyEncrypted: text("agent_key_encrypted"),
    // When the exchange says the trading key's approval runs out, recorded at
    // save time so the wallet card can warn BEFORE orders start being refused.
    // Null: paper wallets, and approvals the exchange gave no expiry for.
    agentValidUntil: timestamp("agent_valid_until", { withTimezone: true }),
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
 * The order-number counter for real orders, one row per signing address and
 * network. The exchange requires every signed action's number to be higher
 * than the last; this row is bumped in ONE atomic statement
 * (`greatest(last + 1, now)`), so two tabs — or a future background worker —
 * can never hand the exchange the same number twice. Keyed by the signing
 * address rather than the wallet because that is what the exchange keys on:
 * the same key added as two wallets still shares one counter.
 */
export const tradeWalletNonces = pgTable(
  "trade_wallet_nonces",
  {
    address: varchar("address", { length: 42 }).notNull(),
    network: varchar("network", { length: 10 }).$type<NetworkId>().notNull(),
    lastNonce: bigint("last_nonce", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.address, table.network] })]
)

/**
 * Everything ever asked of the exchange with real money, and what it said
 * back — orders, cancels, closes, protection changes, and refusals alike.
 * Facts only, in plain figures, and NEVER a secret: every note written here
 * has already been through the scrubber. Nothing is ever removed.
 *
 * **The refusals are read; the rest is the record.** The Journal tab is built
 * from fills, not from here, and most of what this table holds is never drawn.
 * The exception is the last refusal on each market, which `loadLiveRefusals`
 * reads and the Watched tab and Open orders show under the level that did not
 * fire — the background engine trades with nobody watching and no press to
 * throw an error back to, so without that a refused level and a patient one
 * look identical. For a long time nothing here was read at all, on the
 * reasoning that a person could go digging; digging needs a database client,
 * so in practice the answer was invisible.
 */
export const tradeLiveJournal = pgTable(
  "trade_live_journal",
  {
    ...paperOwner(),
    id: varchar("id", { length: 36 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    // What was done: fill | placed | cancelled | close | brackets | refused.
    action: varchar("action", { length: 16 })
      .$type<LiveJournalAction>()
      .notNull(),
    // Null on the refusals that never got as far as having a side.
    side: varchar("side", { length: 4 }).$type<PaperSide>(),
    px: doublePrecision("px").notNull().default(0),
    sz: doublePrecision("sz").notNull().default(0),
    // The plain-word sentence — what the exchange answered, or why it refused.
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("trade_live_journal_wallet_idx").on(
      table.userId,
      table.walletId,
      table.createdAt
    ),
    foreignKey({
      columns: [table.userId, table.walletId],
      foreignColumns: [tradeWallets.userId, tradeWallets.id],
    }).onDelete("cascade"),
  ]
)

/**
 * Every real fill the exchange has told us about, kept.
 *
 * This is not a second copy of `trade_live_journal`. That table records what
 * this app **asked for**; this one records what the **exchange did**, in the
 * exchange's own figures — including trades placed from somewhere else
 * entirely, and stops that fired at three in the morning with nobody watching.
 * The Journal tab is built from these rows and from nothing else.
 *
 * `closed_pnl` and `fee` are the venue's own accounting, copied rather than
 * computed. Working the money out from prices would disagree with the account
 * the moment funding or a partial close is involved, and the row whose number
 * disagrees with the exchange is the wrong one.
 *
 * Keyed by the person, the wallet and the exchange's own fill id, so a sweep
 * that overlaps the one before it writes nothing twice.
 */
export const tradeLiveFills = pgTable(
  "trade_live_fills",
  {
    ...paperOwner(),
    /** The exchange's trade id — unique per wallet, and never ours to make up. */
    fillId: varchar("fill_id", { length: 40 }).notNull(),
    /** The order it came from, which is how a stop is told from a close. */
    orderId: varchar("order_id", { length: 40 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    side: varchar("side", { length: 4 }).$type<PaperSide>().notNull(),
    px: doublePrecision("px").notNull(),
    sz: doublePrecision("sz").notNull(),
    /** When it happened, in milliseconds — the exchange's clock, not ours. */
    at: bigint("at", { mode: "number" }).notNull(),
    closedPnl: doublePrecision("closed_pnl").notNull().default(0),
    fee: doublePrecision("fee").notNull().default(0),
    /** The venue's own words: "Close Long", "Open Short", and the rest. */
    dir: varchar("dir", { length: 24 }).notNull().default(""),
    liquidation: boolean("liquidation").notNull().default(false),
    /**
     * Binned from the Journal. Kept rather than deleted because a deleted row
     * would come straight back: the sweep asks the exchange for everything
     * since the newest fill it holds.
     */
    hidden: boolean("hidden").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.walletId, table.fillId] }),
    index("trade_live_fills_market_idx").on(
      table.userId,
      table.walletId,
      table.marketKey,
      table.at
    ),
    foreignKey({
      columns: [table.userId, table.walletId],
      foreignColumns: [tradeWallets.userId, tradeWallets.id],
    }).onDelete("cascade"),
  ]
)

/**
 * The stop and take-profit orders that have been seen sitting on a position,
 * written down once each so that later — when the position is long gone — a
 * fill can be matched to the order that caused it.
 *
 * This is the only honest way to say "stopped out". The exchange reports a
 * stop firing as an ordinary sell; what makes it a stop is which order it came
 * from, and that order has been cancelled and forgotten by the time anybody
 * opens the Journal. So it is recorded while it is still visible, on the poll
 * the app already makes.
 *
 * Written with "do nothing if it is already there", so the poll writes each
 * trigger exactly once no matter how often it runs. Brackets set from the
 * exchange's own site are picked up the same way as this app's.
 */
export const tradeLiveTriggers = pgTable(
  "trade_live_triggers",
  {
    ...paperOwner(),
    /** The exchange's order id for the waiting stop or target. */
    orderId: varchar("order_id", { length: 40 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    /**
     * stop | target | none — the last of those meaning "asked, and it was an
     * ordinary order". Stored so the exchange is never asked twice.
     */
    kind: varchar("kind", { length: 8 }).$type<LiveTriggerRecord>().notNull(),
    /**
     * The price it was set to fire at, for the line drawn on the chart. Zero
     * where it is no longer knowable: the exchange clears a trigger price once
     * it has fired, so an order recovered after the fact can say it WAS a stop
     * without inventing where.
     */
    px: doublePrecision("px").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.walletId, table.orderId] }),
    foreignKey({
      columns: [table.userId, table.walletId],
      foreignColumns: [tradeWallets.userId, tradeWallets.id],
    }).onDelete("cascade"),
  ]
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
    // How many coins the target sells when it fires; empty sells them all.
    tpSz: doublePrecision("tp_sz"),
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
 *
 * The bin on a row sets `hidden` instead. The wallet's cash is the sum of
 * these rows, so a real delete would move the balance — bin a losing fill and
 * the wallet invents the money back — and nobody tidying a list means that.
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
    /**
     * The order this fill came from, when one placed it.
     *
     * Null for a stop, a liquidation or a position closed by hand — nothing
     * placed those. It is what ties a practice trade back to the flow that
     * made it, through `tradeFlowRunOrders`, exactly as a real fill's exchange
     * order id does.
     */
    orderId: varchar("order_id", { length: 40 }),
    /** Binned from the list. The row still counts towards the wallet's cash. */
    hidden: boolean("hidden").notNull().default(false),
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
 * The smart orders the engine keeps working on — one row per placed order,
 * whether it is a DCA ladder or a grid. The percentages from the window die at
 * placement; what lives here is concrete prices and sizes in one jsonb plan,
 * read only through `readSmartPlan(kind, …)` so a row an older build wrote is
 * ignored, never half-obeyed. Finished orders flip to `done` and stay for the
 * record.
 *
 * Both kinds share this table because there is exactly ONE position per coin
 * per wallet and both of them write its stop — so two on the same coin would
 * fight over it, and sharing the table is what makes the "one live smart order
 * per coin per wallet" check block that on its own.
 */
export const tradeSmartLadders = pgTable(
  "trade_smart_ladders",
  {
    ...paperOwner(),
    id: varchar("id", { length: 36 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    /** Which kind of smart order this row is. Rows written before grids say "dca". */
    kind: varchar("kind", { length: 8 })
      .$type<SmartOrderKind>()
      .notNull()
      .default("dca"),
    status: varchar("status", { length: 8 }).$type<LadderStatus>().notNull(),
    plan: jsonb("plan").$type<SmartPlan>().notNull(),
    /**
     * The switched-on flow that placed this, when a flow did.
     *
     * Null for anything placed by hand, which is most of them. It is the stamp
     * a run's dashboard reads: without it a flow's figures would silently
     * include a trade somebody put on the same wallet themselves, and there
     * would be no telling afterwards which was which.
     *
     * Deliberately not a foreign key. These rows outlive the run — a ladder
     * flips to `done` and stays for the record — and the record must not be
     * quietly rewritten by anything that happens to the run row.
     */
    flowRunId: varchar("flow_run_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("trade_smart_ladders_wallet_idx").on(
      table.userId,
      table.walletId,
      table.status
    ),
    index("trade_smart_ladders_flow_idx").on(table.userId, table.flowRunId),
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

/**
 * Stored price history — the same bars the exchange serves, kept so a backtest
 * can walk months of them without asking twenty times for the same week.
 *
 * Shared, with no owner. A candle is a public fact about a market: two people
 * testing the same coin over the same days are asking the same question, and a
 * copy each would be the same rows twice and twice the fetching.
 *
 * The market key carries the network — `"hyperliquid:testnet:BTC"` is not
 * `"hyperliquid:mainnet:BTC"` and their prices have nothing to do with each
 * other, so the key keeps them apart without a column saying so.
 *
 * Open time is the bar's own identity, so writing the same bar again changes
 * nothing. That is what makes asking twice cost nothing the second time.
 */
export const tradeCandles = pgTable(
  "trade_candles",
  {
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    interval: varchar("interval", { length: 8 })
      .$type<CandleInterval>()
      .notNull(),
    openTime: bigint("open_time", { mode: "number" }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.marketKey, table.interval, table.openTime],
    }),
  ]
)

/**
 * How much history is already stored for one market and timeframe — the span
 * that has been **asked for**, not the span that came back.
 *
 * Those are different on purpose. Asking again for a stretch the exchange has
 * no bars for would fetch nothing, slowly, forever; recording the ask means the
 * second run reads straight from the table. What was missing is not forgotten,
 * it is written down in `trade_candle_gaps` instead.
 */
export const tradeCandleCoverage = pgTable(
  "trade_candle_coverage",
  {
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    interval: varchar("interval", { length: 8 })
      .$type<CandleInterval>()
      .notNull(),
    /** Epoch ms of the oldest bar this store has looked for. */
    fromTime: bigint("from_time", { mode: "number" }).notNull(),
    /** Epoch ms just past the newest bar this store has looked for. */
    toTime: bigint("to_time", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.marketKey, table.interval, table.fromTime],
    }),
  ]
)

/**
 * A stretch of time the exchange had no bars for, written down rather than
 * papered over.
 *
 * A coin listed three weeks ago has no price from ninety days ago, and the
 * honest answer to "how did this ladder do over ninety days" is that it could
 * not be asked. A backtest reads these to skip a coin with a plain reason, and
 * to warn on the results page when a hole sits in the middle of a window.
 *
 * Keyed by where it starts, so re-running the same ask records the same gap
 * rather than a second copy of it.
 */
export const tradeCandleGaps = pgTable(
  "trade_candle_gaps",
  {
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    interval: varchar("interval", { length: 8 })
      .$type<CandleInterval>()
      .notNull(),
    /** Epoch ms of the first bar that should have been there and was not. */
    fromTime: bigint("from_time", { mode: "number" }).notNull(),
    /** Epoch ms just past the last missing bar. */
    toTime: bigint("to_time", { mode: "number" }).notNull(),
    /** Plain words for the results page: "the exchange has nothing before…". */
    reason: text("reason").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.marketKey, table.interval, table.fromTime],
    }),
  ]
)

/** Historical funding settlements, shared like the candle store. */
export const tradeFundingRates = pgTable(
  "trade_funding_rates",
  {
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    time: bigint("time", { mode: "number" }).notNull(),
    rate: doublePrecision("rate").notNull(),
  },
  (table) => [primaryKey({ columns: [table.marketKey, table.time] })]
)

/** The funding stretch already requested from the exchange. */
export const tradeFundingCoverage = pgTable("trade_funding_coverage", {
  marketKey: varchar("market_key", { length: 120 }).primaryKey(),
  fromTime: bigint("from_time", { mode: "number" }).notNull(),
  toTime: bigint("to_time", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/** Missing settlements that a saved result must disclose. */
export const tradeFundingGaps = pgTable(
  "trade_funding_gaps",
  {
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    fromTime: bigint("from_time", { mode: "number" }).notNull(),
    toTime: bigint("to_time", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.marketKey, table.fromTime] })]
)

/**
 * One backtest — the group. A run tests many coins at once against one shared
 * pot, so the things that belong to the whole run live here and the per-coin
 * rows below point at it.
 *
 * Name, pinned and archived are the whole run's, not one coin's: nobody pins a
 * coin. The frozen spec is here too, for the same reason — the flow that ran is
 * one flow however many coins it touched.
 */
export const tradeBacktestGroups = pgTable(
  "trade_backtest_groups",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 36 }).notNull(),
    /** The flow this came from — what "the same flow's next run" means. */
    automationId: varchar("automation_id", { length: 36 }).notNull(),
    automationName: text("automation_name").notNull(),
    /**
     * The canvas run that started this one.
     *
     * Here so pressing Run is safe to retry: a step that ran twice — because
     * the engine picked it up again after a wobble — finds this row and starts
     * nothing, rather than leaving two identical backtests behind.
     */
    automationRunId: varchar("automation_run_id", { length: 36 }),
    /** Null until somebody names it, which is also what protects it. */
    name: text("name"),
    pinned: boolean("pinned").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    /**
     * The flow and its settings **exactly as they ran**, frozen. Editing the
     * strategy tomorrow must not rewrite what yesterday's result says it
     * tested; a run that could change its own past is worse than no record.
     */
    spec: jsonb("spec").$type<BacktestSpecSnapshot>().notNull(),
    /** The few numbers a list row prints, written once when the run finishes. */
    summary: jsonb("summary").$type<BacktestSummary | null>(),
    /** The heavy half — the pot over time and the per-coin table. */
    result: jsonb("result").$type<BacktestResult | null>(),
    /** Somebody pressed Stop. Checked between chunks; safe to press twice. */
    stopRequested: boolean("stop_requested").notNull().default(false),
    /**
     * Held by whichever pass is working on it, so two overlapping ticks never
     * both run the same group. Cleared when it finishes; a claim older than the
     * orphan window is taken back after a restart.
     */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    /** How many times this has been picked up. Three failures and it gives up. */
    attempts: doublePrecision("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("trade_backtest_groups_flow_idx").on(
      table.userId,
      table.automationId
    ),
    // One backtest per canvas run, which is what makes pressing Run again
    // after a failure safe.
    uniqueIndex("trade_backtest_groups_run_unique").on(table.automationRunId),
  ]
)

/**
 * One coin inside a backtest.
 *
 * A row per coin rather than one blob, so the run page can show a coin that was
 * skipped as a **skipped row** with its reason rather than as an absence — a
 * coin that quietly vanished from a result is the difference between "twenty
 * coins made this" and "the twelve that had history made this".
 *
 * The small summary is its own column so a list page never loads the trades.
 */
export const tradeBacktests = pgTable(
  "trade_backtests",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 36 }).notNull(),
    groupId: varchar("group_id", { length: 36 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    symbol: varchar("symbol", { length: 60 }).notNull(),
    status: varchar("status", { length: 10 })
      .$type<BacktestStatus>()
      .notNull()
      .default("waiting"),
    /** How far through, 0 to 1. */
    progress: doublePrecision("progress").notNull().default(0),
    /** What it is doing, in plain words: "loading candles". */
    progressNote: text("progress_note").notNull().default("Waiting to start"),
    /** Why this coin could not be tested. Only ever set on a skipped row. */
    skipReason: text("skip_reason"),
    error: text("error"),
    /** The candles are in the store and this coin is ready to be walked. */
    candlesReady: boolean("candles_ready").notNull().default(false),
    summary: jsonb("summary").$type<BacktestCoinSummary | null>(),
    /** Every round trip this coin made. The heavy column; loaded on demand. */
    trades: jsonb("trades").$type<BacktestTrade[] | null>(),
    /**
     * Every fill, for the arrows on the chart.
     *
     * Kept beside the round trips rather than derived from them: a ladder that
     * bought five times and sold once is five arrows at five prices, and one
     * blended entry per round trip would hide the shape of the ladder.
     */
    fills: jsonb("fills").$type<BacktestFill[] | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("trade_backtests_group_idx").on(table.userId, table.groupId),
    foreignKey({
      columns: [table.userId, table.groupId],
      foreignColumns: [tradeBacktestGroups.userId, tradeBacktestGroups.id],
    }).onDelete("cascade"),
  ]
)

/**
 * The trading engine's on/off and pause switches — one row, because there is
 * one engine.
 *
 * Not per user. This is the machinery, not a setting: pausing it stops the
 * server working anybody's ladders, which is what you want when something
 * looks wrong and you would rather nothing traded until you have looked.
 */
export const tradeWorkerControls = pgTable("trade_worker_controls", {
  kind: varchar("kind", { length: 30 }).primaryKey(),
  /** Off means do not run at all. Survives a restart, unlike a pause. */
  enabled: boolean("enabled").notNull().default(true),
  /** Paused means running but not trading — meant to be switched back on. */
  paused: boolean("paused").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * One row per running copy, rewritten every few seconds.
 *
 * Whether the engine is alive cannot be asked of the engine — a dead one
 * answers nothing. So it says so itself while it can, and anything older than
 * the window in `workers/status.ts` is treated as gone. Rows are kept for a
 * few days so "when did it last run" has an answer after an outage.
 */
export const tradeWorkerHeartbeats = pgTable(
  "trade_worker_heartbeats",
  {
    /** The process's own id, made when it starts. */
    id: varchar("id", { length: 36 }).primaryKey(),
    kind: varchar("kind", { length: 30 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    /** Leader is the copy that holds the lock and trades; standby waits. */
    role: varchar("role", { length: 10 }).notNull(),
    /** What it was doing at the last beat, and anything it wants to report. */
    meta: jsonb("meta").$type<Record<string, unknown> | null>(),
  },
  (table) => [index("trade_worker_heartbeats_seen_idx").on(table.lastSeenAt)]
)

/**
 * A flow that has been switched on to trade a wallet.
 *
 * **It holds no trading state.** The ladders a running flow places are ordinary
 * `tradeSmartLadders` rows, worked by the engine that already exists; this row
 * only says "keep looking for coins on this list to place one on, with these
 * settings, out of this much money".
 *
 * The settings are FROZEN when it starts. Editing the drawing afterwards must
 * not change what is already in the market — the same rule a placed ladder
 * follows with its rung prices. Changing a running flow means switching it off
 * and on again.
 */
export const tradeFlowRuns = pgTable(
  "trade_flow_runs",
  {
    ...paperOwner(),
    id: varchar("id", { length: 36 }).notNull(),
    /** The flow this came from. Deleting the flow stops it looking for coins. */
    automationId: varchar("automation_id", { length: 36 }).notNull(),
    status: varchar("status", { length: 8 })
      .$type<TradeFlowRunStatus>()
      .notNull(),
    spec: jsonb("spec").$type<TradeFlowRunSpec>().notNull(),
    /**
     * The coins this flow has actually placed a ladder on.
     *
     * Not the same as its coin list. Stopping cancels what this flow put in
     * the market and nothing else — a ladder placed by hand on one of these
     * coins belongs to whoever placed it.
     */
    placed: jsonb("placed").$type<string[]>().notNull().default([]),
    /**
     * Why each coin has not been given a ladder yet, keyed by market key.
     *
     * Replaced each time a coin is looked at, and removed when it finally gets
     * one. Without it a flow refusing every coin for want of money looks
     * exactly like a flow waiting for the right price — nothing happens in
     * both, and only one of them is working.
     *
     * Only the app's own codes are stored, never an exception's text: this is
     * written by a server and drawn on a screen, and a message that carried
     * something secret would be kept forever.
     */
    waiting: jsonb("waiting")
      .$type<Record<string, FlowWaitReason>>()
      .notNull()
      .default({}),
    /**
     * The newest arrow each coin has already been acted on for, keyed by
     * market key. Only a signals flow writes it.
     *
     * **Without it the same arrow buys the same coin over and over.** An arrow
     * stays the newest one for as long as its candle is the last to have
     * confirmed anything — hours, on a four-hour chart — so "act on the newest"
     * has to mean "act on it once".
     *
     * Kept on the run rather than on the smart order it started, because the
     * order is gone the moment the trade closes and the arrow that started it
     * is exactly what must not start a second one.
     */
    acted: jsonb("acted").$type<Record<string, number>>().notNull().default({}),
    /**
     * Set when the same refusal keeps coming back, so it stops asking.
     *
     * A refusal about the setup rather than about one coin — rungs too small,
     * no free cash, the key refused — answers every coin on the list the same
     * way. Trying the next one is asking a question the exchange has already
     * answered, and a flow with a hundred coins did that all day.
     */
    hold: jsonb("hold").$type<FlowHold | null>(),
    /**
     * Set while this flow has been told to stop looking for new coins.
     *
     * **Pause is not a small Stop.** Stopping calls off the waiting ladders
     * this flow placed; pausing calls off nothing — every ladder and position
     * stays exactly where it is. It keeps `status = 'running'` so it keeps
     * holding its wallet, because the indexes that stop two flows trading one
     * wallet are written on that status.
     */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    /** Why it stopped, in the words somebody will read on the canvas. */
    stoppedReason: text("stopped_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("trade_flow_runs_running_idx").on(table.status, table.updatedAt),
    foreignKey({
      columns: [table.userId, table.walletId],
      foreignColumns: [tradeWallets.userId, tradeWallets.id],
    }).onDelete("cascade"),
  ]
)

/**
 * Every order a switched-on flow has sent, kept by its id.
 *
 * **Because the plan forgets.** A rung's order id sits on the ladder's plan
 * only while the order is resting, and is cleared the moment it fills — and a
 * real fill comes back from the exchange carrying an order id and nothing
 * else. So the link between "this order" and "the run that sent it" has to be
 * written somewhere that is not the plan. Exactly the reason
 * `tradeLiveTriggers` exists, learned the same way.
 *
 * Practice orders are written here too. Their ids are ours rather than an
 * exchange's, but the question is the same one and two answers to it would
 * drift.
 *
 * Written with "do nothing if it is already there", so a pass that sees the
 * same order twice writes it once.
 */
export const tradeFlowRunOrders = pgTable(
  "trade_flow_run_orders",
  {
    ...paperOwner(),
    /** The exchange's id, or the practice engine's own. */
    orderId: varchar("order_id", { length: 40 }).notNull(),
    flowRunId: varchar("flow_run_id", { length: 36 }).notNull(),
    /** The ladder or signal trade it came from, for reading the record back. */
    ladderId: varchar("ladder_id", { length: 36 }).notNull(),
    marketKey: varchar("market_key", { length: 120 }).notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.walletId, table.orderId] }),
    index("trade_flow_run_orders_run_idx").on(table.userId, table.flowRunId),
    foreignKey({
      columns: [table.userId, table.walletId],
      foreignColumns: [tradeWallets.userId, tradeWallets.id],
    }).onDelete("cascade"),
  ]
)
