import { withFixedBlock } from "@/lib/notes/fixed-block"
import { emptyWrittenPageBody } from "@/lib/pages/written-page-body"
import { cleanNoteBody, noteIsEmpty, type NoteNode } from "@/lib/trade/note-blocks"

/**
 * The Trade dashboard's left page (8 Nov 2026), one per person: the same page
 * whichever exchange is picked (Tyler: "The picked exchange", the blocks
 * following it), started fresh with nothing copied from the old page per
 * exchange ("Start fresh"). It is the shell's editor document kept as JSON
 * text, as Travel keeps a note. There is no page on the right: the dashboard
 * has no right panel ("I dont want a right panel").
 */

/** The fixed block that picks what the middle shows: Overview, or an exchange. */
export const PROTOCOLS_BLOCK_NODE = "noteProtocols"

/** The longest a stored page may be, in characters of JSON. */
export const TRADE_PAGE_MAX_LENGTH = 200_000

/**
 * A new page: the Protocols block first, then the six trading blocks.
 */
export function defaultTradePage(): NoteNode {
  return {
    type: "doc",
    content: [
      { type: PROTOCOLS_BLOCK_NODE },
      { type: "noteRules" },
      { type: "noteManualTrades" },
      { type: "noteGridTrades" },
      { type: "noteDcaTrades" },
      { type: "noteScanner" },
      { type: "noteFolders" },
      { type: "paragraph" },
    ],
  }
}

/**
 * A page with its Protocols block, as the shell keeps Admin's Dashboards
 * block (`withFixedBlock`): one that lost it gets it back at the top, and a
 * second one is dropped. Without it the dashboard could not leave the row on
 * screen.
 */
function withProtocolsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, PROTOCOLS_BLOCK_NODE)
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

/** A stored page as the editor opens it: cleaned, and holding its Protocols block. */
export function openedPageBody(stored: string): string {
  return JSON.stringify(withProtocolsBlock(readPageBody(stored)))
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
  /** The page's own cover pictures, the shell's tiles. */
  coverImages: string[]
}
