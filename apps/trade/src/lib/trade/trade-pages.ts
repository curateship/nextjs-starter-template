import { emptyWrittenPageBody } from "@/lib/pages/written-page-body"
import {
  cleanNoteBody,
  noteIsEmpty,
  type NoteNode,
  type TradePageKind,
} from "@/lib/trade/note-blocks"

/**
 * The two pages on a protocol dashboard (the Admin 3 panel design, 7 Nov
 * 2026), both one per exchange: the exchange's own page on the left, and the
 * All markets page on the right, which every market on the exchange shows
 * (Tyler, 7 Nov 2026: "We should make both left and right panel all protocol
 * wide"). Each is the shell's editor document kept as JSON text, as Travel
 * keeps a note.
 */

/** The market key stored for an exchange's own page, which belongs to no market. */
export const EXCHANGE_PAGE_MARKET = ""

/** The market key stored for the right panel's All markets page. */
export const SHARED_PAGE_MARKET = "*"

/** The stored key of one of the dashboard's two pages. */
export type TradePageKey = typeof EXCHANGE_PAGE_MARKET | typeof SHARED_PAGE_MARKET

/** Which page a stored key names: "" the exchange's own, "*" All markets. */
export function pageKindOf(marketKey: string): TradePageKind {
  return marketKey === SHARED_PAGE_MARKET ? "shared" : "exchange"
}

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

export function defaultTradePage(kind: TradePageKind): NoteNode {
  // All markets starts empty: a block goes in when one is picked.
  if (kind === "shared") return { type: "doc", content: [{ type: "paragraph" }] }
  return defaultExchangePage()
}

/** A page's stored words read back and cleaned; "" or anything unreadable is an empty page. */
export function readPageBody(stored: string): NoteNode {
  if (!stored.startsWith("{")) return emptyWrittenPageBody()
  try {
    return cleanNoteBody(JSON.parse(stored))
  } catch {
    return emptyWrittenPageBody()
  }
}

/** What is saved: "" when nothing is written, otherwise the cleaned document. */
export function storedTradePage(text: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return ""
  }
  const body = cleanNoteBody(parsed)
  return noteIsEmpty(body) ? "" : JSON.stringify(body)
}

/** One page as the dashboard holds it. */
export type TradePage = {
  /** The saved document as JSON text, or the starting page when none was saved. */
  body: string
  locked: boolean
  coverUrl: string | null
}
