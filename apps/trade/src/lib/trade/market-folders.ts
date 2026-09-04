import { z } from "zod"

/**
 * The ids of the two panel rows that are not folders. Real folder ids are
 * UUIDs, so neither can collide with one.
 */
export const WATCHED_ROW = "watched"
export const ALL_ROW = "all"

export type MarketFolder = {
  id: string
  name: string
  isFav: boolean
  position: number
  /** Switched off with the eye in the cog window; still saves coins. */
  hidden: boolean
  marketKeys: string[]
}

export type MarketFolderActions = {
  busy: boolean
  quickAdd: (marketKey: string) => void
  toggle: (marketKey: string, folderId: string, saved: boolean) => Promise<void>
  create: (marketKey: string, name: string) => Promise<boolean>
}

/** Where Watched and All markets sit in the panel, and whether they show. */
export type MarketPanelRow = { position: number; hidden: boolean }
export type MarketPanelRows = {
  watched: MarketPanelRow
  all: MarketPanelRow
  /**
   * Markets hidden from the All markets row by hand, as full market keys.
   * Separate from the volume cutoff: that one is a number in Settings and
   * comes back on its own when volume rises; these stay hidden until the
   * cog's Show button. A named folder or Watched still shows the coin.
   */
  hiddenMarketKeys: string[]
}

/** More than this on one exchange and the Hide choice refuses with a note. */
export const MAX_HIDDEN_MARKETS = 200

/**
 * Watched above every folder and All markets below them, which is where the
 * two sat before either could be moved. The numbers are deliberately outside
 * the range a folder can hold, so a folder created after a drag still lands
 * between them.
 */
export const DEFAULT_MARKET_PANEL_ROWS: MarketPanelRows = {
  watched: { position: -1, hidden: false },
  all: { position: Number.MAX_SAFE_INTEGER, hidden: false },
  hiddenMarketKeys: [],
}

const panelRowSchema = z.object({
  position: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER),
  hidden: z.boolean(),
})

export const marketPanelRowsSchema = z.object({
  watched: panelRowSchema,
  all: panelRowSchema,
  // Additive: rows saved before the list existed have no key and read as
  // nothing hidden. Duplicates are dropped so one coin cannot fill the cap.
  hiddenMarketKeys: z
    .array(z.string().max(180))
    .max(MAX_HIDDEN_MARKETS)
    .default([])
    .transform((keys) => [...new Set(keys)]),
})

/** A stored layout, with the original panel order for a first or bad value. */
export function readMarketPanelRows(value: unknown): MarketPanelRows {
  const parsed = marketPanelRowsSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_MARKET_PANEL_ROWS
}

export function favFolder(folders: readonly MarketFolder[]) {
  return folders.find((folder) => folder.isFav) ?? null
}
