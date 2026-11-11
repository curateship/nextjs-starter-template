/**
 * The columns the Bots dashboard's trades popover can hide from its ⋮ (Tyler,
 * 10 Nov 2026: "add a 3 dot dropdown here with options to hide certain col").
 * A backtest's trades and a bot's trades are different tables, so each keeps
 * its own choice, saved on the account in `trade_prefs.panel_layouts`.
 *
 * The bot's Closed always shows. The backtest's table has no # column (Tyler,
 * 10 Nov 2026: "remove this", pointing at it), so any of its columns can be
 * hidden, but never the last one showing.
 */

export type TradesPopoverKind = "backtest" | "bot"

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
} as const satisfies Record<TradesPopoverKind, readonly { key: string; label: string }[]>

export type BacktestTradeColumn = (typeof TRADES_POPOVER_COLUMNS.backtest)[number]["key"]
export type BotTradeColumn = (typeof TRADES_POPOVER_COLUMNS.bot)[number]["key"]

/** Each table's hidden columns. A table left out hides none. */
export type HiddenTradeColumns = {
  backtest?: BacktestTradeColumn[]
  bot?: BotTradeColumn[]
}

/**
 * What was saved, cleaned: a column this build does not know is dropped, each
 * one listed once, in the ⋮'s order. Anything else reads as nothing hidden.
 */
export function readHiddenTradeColumns(value: unknown): HiddenTradeColumns {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const saved = value as Record<string, unknown>
  const clean: HiddenTradeColumns = {}
  for (const kind of ["backtest", "bot"] as const) {
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
