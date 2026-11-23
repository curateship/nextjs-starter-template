/**
 * The columns a trades popover can hide from its ⋮ (Tyler, 10 Nov 2026: "add
 * a 3 dot dropdown here with options to hide certain col"; 13 Nov 2026, the
 * same for the header's Active trades button). Each table keeps its own
 * choice, saved on the account in `trade_prefs.panel_layouts`.
 *
 * The bot's Closed always shows, and so does the Ticker in both of the header
 * button's tables, so neither is listed here. The backtest's table has no #
 * column (Tyler, 10 Nov 2026: "remove this", pointing at it), so any of its
 * columns can be hidden, but never the last one showing.
 */

export const TRADES_POPOVER_COLUMNS = {
  backtest: [
    { key: "side", label: "Side" },
    { key: "entry", label: "Entry" },
    { key: "exit", label: "Exit" },
    { key: "amount", label: "Amount" },
    { key: "pnl", label: "P&L" },
    { key: "returnPct", label: "Return" },
    { key: "cumPnl", label: "Cum. P&L" },
  ],
  bot: [
    { key: "market", label: "Market" },
    { key: "opened", label: "Opened" },
    { key: "ended", label: "How it ended" },
    { key: "amount", label: "Amount" },
    { key: "pnl", label: "Made or lost" },
    { key: "returnPct", label: "Return" },
    { key: "running", label: "Running total" },
  ],
  /** The header button's Active trades tab. */
  active: [
    { key: "type", label: "Type" },
    { key: "order", label: "Order" },
    { key: "value", label: "Value" },
    { key: "profit", label: "P/L" },
  ],
  /** The header button's Watching tab. */
  watching: [
    { key: "order", label: "Order" },
    { key: "wallet", label: "Wallet" },
    { key: "distance", label: "Distance" },
  ],
} as const satisfies Record<string, readonly { key: string; label: string }[]>

export type TradesPopoverKind = keyof typeof TRADES_POPOVER_COLUMNS

export const TRADES_POPOVER_KINDS = Object.keys(TRADES_POPOVER_COLUMNS) as [
  TradesPopoverKind,
  ...TradesPopoverKind[],
]

export type BacktestTradeColumn = (typeof TRADES_POPOVER_COLUMNS.backtest)[number]["key"]
export type BotTradeColumn = (typeof TRADES_POPOVER_COLUMNS.bot)[number]["key"]
export type ActiveTradeHideable = (typeof TRADES_POPOVER_COLUMNS.active)[number]["key"]
export type WatchingHideable = (typeof TRADES_POPOVER_COLUMNS.watching)[number]["key"]

/** Each table's hidden columns. A table left out hides none. */
export type HiddenTradeColumns = {
  backtest?: BacktestTradeColumn[]
  bot?: BotTradeColumn[]
  active?: ActiveTradeHideable[]
  watching?: WatchingHideable[]
}

/**
 * What was saved, cleaned: a column this build does not know is dropped, each
 * one listed once, in the ⋮'s order. Anything else reads as nothing hidden.
 */
export function readHiddenTradeColumns(value: unknown): HiddenTradeColumns {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const saved = value as Record<string, unknown>
  const clean: HiddenTradeColumns = {}
  for (const kind of TRADES_POPOVER_KINDS) {
    const list = saved[kind]
    if (!Array.isArray(list)) continue
    const known = TRADES_POPOVER_COLUMNS[kind].map((column) => column.key as string)
    const kept = known.filter((key) => list.includes(key))
    if (kept.length > 0) (clean as Record<string, string[]>)[kind] = kept
  }
  return clean
}

/** Whether a column is one this table can hide. */
export function isTradesPopoverColumn(kind: TradesPopoverKind, key: string): boolean {
  return TRADES_POPOVER_COLUMNS[kind].some((column) => column.key === key)
}
