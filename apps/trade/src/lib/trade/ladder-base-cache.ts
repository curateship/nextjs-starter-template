import { loadLadderBase } from "@/lib/api/smart-orders"

/**
 * The base price a DCA ladder would hang from, asked for before it is needed.
 *
 * The read behind it walks 500 candles on the server, which takes a second or
 * two — long enough that a window waiting on it reads as a window that is
 * broken. So the moment the right-click menu opens, the answer is requested
 * here, and by the time somebody has read the menu and picked "DCA ladder" it
 * is usually already in hand. The window draws from the click price either
 * way and re-anchors when this lands — see `smart-order-dialog.tsx`.
 *
 * One answer per market, kept briefly: a base confirms over days, but the
 * price it is checked against moves, so a stale answer is only trusted for a
 * few seconds. A failed read is forgotten at once so the next ask really asks.
 */

const KEEP_MS = 10_000

const held = new Map<
  string,
  { at: number; answer: Promise<{ basePx: number | null }> }
>()

export function prefetchLadderBase(marketKey: string): void {
  void ladderBase(marketKey)
}

export function ladderBase(
  marketKey: string
): Promise<{ basePx: number | null }> {
  const found = held.get(marketKey)
  if (found && Date.now() - found.at < KEEP_MS) return found.answer

  const at = Date.now()
  const answer = loadLadderBase(marketKey)
  answer.catch(() => {
    if (held.get(marketKey)?.at === at) held.delete(marketKey)
  })
  held.set(marketKey, { at, answer })
  return answer
}
