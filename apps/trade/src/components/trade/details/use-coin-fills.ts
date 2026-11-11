import * as React from "react"

import { readCoinFills } from "@/lib/api/trade/coin-fills"
import type { LiveFill } from "@/lib/trade/live-trades"

export type CoinFills = {
  /** Oldest first: the server's answer, with anything newer the page holds. */
  fills: LiveFill[]
  /** The server has answered; until then `fills` is only what the page held. */
  whole: boolean
  /** More fills than one read carries, so the oldest are not in the list. */
  capped: boolean
  failed: boolean
  retry: () => void
}

/**
 * One wallet's coin, every fill since `since`, for a grid's or a ladder's
 * whole list of sales.
 *
 * **What the page already holds shows at once** (rules/instant-first.md): the
 * newest fills on that coin are drawn straight away, and the server's full
 * answer replaces them when it lands. It is asked again whenever the page
 * holds a fill on the coin it did not have before, so a sale made while the
 * panel is open joins the list on the next poll.
 *
 * `since` null asks for nothing, for a subject that has no smart order.
 */
export function useCoinFills(
  walletId: string | null,
  marketKey: string | null,
  since: number | null,
  pageFills: readonly LiveFill[]
): CoinFills {
  const mine = React.useMemo(
    () =>
      walletId && marketKey && since !== null
        ? pageFills.filter(
            (fill) =>
              fill.walletId === walletId &&
              fill.marketKey === marketKey &&
              fill.at >= since
          )
        : [],
    [pageFills, walletId, marketKey, since]
  )
  // A fresh read only when the page holds something newer, not on every poll.
  const newest = mine.reduce((latest, fill) => Math.max(latest, fill.at), 0)
  const [attempt, setAttempt] = React.useState(0)
  const key = walletId && marketKey && since !== null ? `${walletId}|${marketKey}|${since}` : null
  const [answer, setAnswer] = React.useState<{
    key: string
    fills: LiveFill[]
    capped: boolean
  } | null>(null)
  const [failedKey, setFailedKey] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!key || !walletId || !marketKey || since === null) return
    let live = true
    readCoinFills(walletId, marketKey, since)
      .then((read) => {
        if (!live) return
        setAnswer({ key, fills: read.fills, capped: read.capped })
        setFailedKey(null)
      })
      .catch(() => {
        if (live) setFailedKey(key)
      })
    return () => {
      live = false
    }
  }, [key, walletId, marketKey, since, newest, attempt])

  return React.useMemo(() => {
    const read = answer && answer.key === key ? answer : null
    const byId = new Map<string, LiveFill>()
    for (const fill of read?.fills ?? []) byId.set(fill.fillId, fill)
    for (const fill of mine) if (!byId.has(fill.fillId)) byId.set(fill.fillId, fill)
    const fills = [...byId.values()].sort(
      (left, right) => left.at - right.at || left.fillId.localeCompare(right.fillId)
    )
    return {
      fills,
      whole: read !== null,
      capped: read?.capped ?? false,
      failed: failedKey === key && read === null,
      retry: () => setAttempt((count) => count + 1),
    }
  }, [answer, key, mine, failedKey])
}
