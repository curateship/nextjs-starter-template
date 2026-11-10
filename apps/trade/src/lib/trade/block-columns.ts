/**
 * The columns each trade block on the Trade dashboard's left page can hide
 * from its ⋮ (Tyler, 10 Nov 2026: "I want to hide certain col in the dropdown
 * here ... I want to hide avatar, type value and pnl"). Manual, Grid and DCA
 * trades each keep their own choice, saved on the account
 * (`trade_prefs.hidden_block_columns`). Ticker always shows.
 */

export const TRADE_TABLE_BLOCKS = ["manual-trades", "grid-trades", "dca-trades"] as const
export type TradeTableBlock = (typeof TRADE_TABLE_BLOCKS)[number]

/** In the ⋮'s order. "avatar" is the coin's picture beside its ticker. */
export const HIDEABLE_COLUMNS = ["avatar", "type", "value", "pnl"] as const
export type HideableColumn = (typeof HIDEABLE_COLUMNS)[number]

export const HIDEABLE_COLUMN_LABEL: Record<HideableColumn, string> = {
  avatar: "Avatar",
  type: "Type",
  value: "Value",
  pnl: "PnL",
}

/** Each trade block's hidden columns. A block left out hides none. */
export type HiddenBlockColumns = Partial<Record<TradeTableBlock, HideableColumn[]>>

export function isTradeTableBlock(value: unknown): value is TradeTableBlock {
  return TRADE_TABLE_BLOCKS.includes(value as TradeTableBlock)
}

/**
 * What was saved, cleaned: a block or column this build does not know is
 * dropped, each column listed once, in the ⋮'s order. Anything else reads as
 * nothing hidden.
 */
export function readHiddenBlockColumns(value: unknown): HiddenBlockColumns {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const saved = value as Record<string, unknown>
  const clean: HiddenBlockColumns = {}
  for (const block of TRADE_TABLE_BLOCKS) {
    const list = saved[block]
    if (!Array.isArray(list)) continue
    const columns = HIDEABLE_COLUMNS.filter((column) => list.includes(column))
    if (columns.length) clean[block] = columns
  }
  return clean
}
