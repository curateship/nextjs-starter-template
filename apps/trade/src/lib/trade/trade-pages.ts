import { emptyWrittenPageBody } from "@/lib/pages/written-page-body"
import {
  cleanNoteBody,
  noteIsEmpty,
  type NoteNode,
  type TradePageKind,
} from "@/lib/trade/note-blocks"

/**
 * The two pages on a protocol dashboard (the Admin 3 panel design, 7 Nov
 * 2026). The left panel is the exchange's own page, one per exchange. The
 * right panel is the market's page, one per market (Tyler's answers, 7 Nov
 * 2026: "One per exchange, all 7" and "One page per market"). Each is the
 * shell's editor document kept as JSON text, as Travel keeps a note.
 */

/** The market key stored for an exchange's own page, which belongs to no market. */
export const EXCHANGE_PAGE_MARKET = ""

/** The longest a stored page may be, in characters of JSON. */
export const TRADE_PAGE_MAX_LENGTH = 200_000

/**
 * A new exchange's page: all seven blocks, so nothing that sat on the
 * dashboard before the design changed goes missing.
 */
export function defaultExchangePage(): NoteNode {
  return {
    type: "doc",
    content: [
      { type: "noteRules" },
      { type: "noteManualTrades" },
      { type: "noteGridTrades" },
      { type: "noteDcaTrades" },
      { type: "noteAlerts" },
      { type: "noteScanner" },
      { type: "noteFolders" },
      { type: "paragraph" },
    ],
  }
}

/** A new market's page: the facts the info button shows, then room to write. */
export function defaultMarketPage(): NoteNode {
  return {
    type: "doc",
    content: [{ type: "noteMarketInfo" }, { type: "paragraph" }],
  }
}

export function defaultTradePage(kind: TradePageKind) {
  return kind === "exchange" ? defaultExchangePage() : defaultMarketPage()
}

/**
 * A stored page read back. `null` means no page was ever saved, which shows
 * the starting page above. A saved page left empty stays empty: a person who
 * deleted every block meant it.
 */
export function readTradePage(stored: string | null, kind: TradePageKind): NoteNode {
  if (stored === null) return defaultTradePage(kind)
  if (!stored.startsWith("{")) return emptyWrittenPageBody()
  try {
    return cleanNoteBody(JSON.parse(stored), kind)
  } catch {
    return emptyWrittenPageBody()
  }
}

/** What is saved: "" when nothing is written, otherwise the cleaned document. */
export function storedTradePage(text: string, kind: TradePageKind): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return ""
  }
  const body = cleanNoteBody(parsed, kind)
  return noteIsEmpty(body) ? "" : JSON.stringify(body)
}

/** One page as the dashboard holds it. */
export type TradePage = {
  /** The saved document as JSON text, or the starting page when none was saved. */
  body: string
  locked: boolean
  coverUrl: string | null
}
