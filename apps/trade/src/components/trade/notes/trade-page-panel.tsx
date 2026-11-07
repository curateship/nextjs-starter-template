import * as React from "react"

import { SavingDocument } from "@/components/trade/notes/saving-document"
import type { PageLock } from "@/components/trade/notes/page-menus"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import type { StoredPage } from "@/lib/api/trade/dashboard"
import {
  loadPage,
  lockPage,
  savePage,
  setPageCover,
} from "@/lib/api/trade/pages"
import type { ProtocolId } from "@/lib/protocols/contracts"
import type { TradePageKind } from "@/lib/trade/note-blocks"
import {
  defaultTradePage,
  EXCHANGE_PAGE_MARKET,
} from "@/lib/trade/trade-pages"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * One page on the trading dashboard (the Admin 3 panel design, 7 Nov 2026):
 * the exchange's own page on the left (`marketKey` "") or the market's page
 * on the right. The pages already read stay in memory for the visit, so
 * moving back to a market shows its page at once.
 */

type PageState =
  | { state: "ready"; page: StoredPage }
  | { state: "loading" }
  | { state: "failed" }

function cacheKey(protocol: ProtocolId, marketKey: string) {
  return `${protocol}|${marketKey}`
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** A page's words as the editor reads them: the starting page when none was ever written. */
function shownBody(page: StoredPage, kind: TradePageKind) {
  return page.body ?? JSON.stringify(defaultTradePage(kind))
}

export function useTradePage({
  protocol,
  marketKey,
  initial,
}: {
  protocol: ProtocolId
  /** "" for the exchange's page, null when no market is picked. */
  marketKey: string | null
  /** What the dashboard's opening answer carried, for the page it named. */
  initial: { marketKey: string; page: StoredPage } | null
}) {
  const kind: TradePageKind =
    marketKey === EXCHANGE_PAGE_MARKET ? "exchange" : "market"
  // Filed by exchange and market, because the exchange's own page is market
  // "" on every exchange: Phemex must never be shown Hyperliquid's page.
  const cache = React.useRef(
    new Map<string, StoredPage>(
      initial ? [[cacheKey(protocol, initial.marketKey), initial.page]] : []
    )
  )
  const keyOf = (market: string) => cacheKey(protocol, market)
  const [, redraw] = React.useReducer((count: number) => count + 1, 0)
  const [failedKey, setFailedKey] = React.useState<string | null>(null)
  const [lockBusy, setLockBusy] = React.useState(false)
  // Read once per page, and again only after Try again.
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (marketKey === null || cache.current.has(cacheKey(protocol, marketKey))) return
    let current = true
    setFailedKey(null)
    loadPage({ protocol, marketKey }).then(
      (page) => {
        cache.current.set(cacheKey(protocol, marketKey), page)
        if (current) redraw()
      },
      () => {
        if (current) setFailedKey(marketKey)
      }
    )
    return () => {
      current = false
    }
  }, [attempt, marketKey, protocol])

  const page = marketKey === null ? null : cache.current.get(keyOf(marketKey))
  const state: PageState = page
    ? { state: "ready", page }
    : marketKey !== null && failedKey === marketKey
      ? { state: "failed" }
      : { state: "loading" }

  /** A save for one page, bound to it, so words typed on a market never land on the next one. */
  const saveFor = React.useCallback(
    (key: string) => async (body: string) => {
      // Kept at once, so a page drawn again (locked, or moved back to) shows
      // these words even before the server has answered.
      const was = cache.current.get(cacheKey(protocol, key))
      const coverUrl = was?.coverUrl ?? null
      cache.current.set(cacheKey(protocol, key), {
        body,
        locked: was?.locked ?? false,
        coverUrl,
      })
      try {
        const saved = await savePage({ protocol, marketKey: key }, body)
        cache.current.set(cacheKey(protocol, key), {
          body: saved.body,
          locked: saved.locked,
          coverUrl: cache.current.get(cacheKey(protocol, key))?.coverUrl ?? coverUrl,
        })
      } catch (error) {
        showErrorToast(errorText(error, "The page could not be saved."))
      }
    },
    [protocol]
  )

  const lock: PageLock = {
    locked: page?.locked ?? false,
    busy: lockBusy || !page,
    setLocked: (locked) => {
      if (marketKey === null || !page) return
      const key = marketKey
      setLockBusy(true)
      lockPage({ protocol, marketKey: key }, locked, shownBody(page, kind))
        .then(() => {
          const now = cache.current.get(keyOf(key)) ?? page
          cache.current.set(keyOf(key), {
            ...now,
            body: now.body ?? shownBody(page, kind),
            locked,
          })
          redraw()
        })
        .catch((error: unknown) =>
          showErrorToast(errorText(error, "The lock could not be saved."))
        )
        .finally(() => setLockBusy(false))
    },
  }

  const [coverBusy, setCoverBusy] = React.useState(false)
  /** The cover photo behind the panel's header, set or cleared from the ⋮. */
  const cover = {
    url: page?.coverUrl ?? null,
    busy: coverBusy || !page,
    set: (coverUrl: string | null) => {
      if (marketKey === null || !page) return
      const key = marketKey
      setCoverBusy(true)
      setPageCover({ protocol, marketKey: key }, coverUrl, shownBody(page, kind))
        .then(() => {
          const now = cache.current.get(keyOf(key)) ?? page
          cache.current.set(keyOf(key), {
            ...now,
            body: now.body ?? shownBody(page, kind),
            coverUrl,
          })
          redraw()
        })
        .catch((error: unknown) =>
          showErrorToast(errorText(error, "The cover photo could not be saved."))
        )
        .finally(() => setCoverBusy(false))
    },
  }

  return {
    kind,
    state,
    lock,
    cover,
    saveFor,
    retry: () => {
      setFailedKey(null)
      setAttempt((count) => count + 1)
    },
  }
}

export type TradePage = ReturnType<typeof useTradePage>

/** The page itself, under the panel's header. */
export function TradePageBody({
  page,
  marketKey,
}: {
  page: TradePage
  marketKey: string
}) {
  const { state } = page
  if (state.state === "loading") return <LoadingRow label="Reading this page" />
  if (state.state === "failed") {
    return (
      <ErrorRow message="This page could not be read." onRetry={page.retry} />
    )
  }
  return (
    <SavingDocument
      // A new editor per page and per lock, each saving to its own page only.
      key={`${marketKey}:${state.page.locked}`}
      page={page.kind}
      value={shownBody(state.page, page.kind)}
      locked={state.page.locked}
      placeholder="Type / for a block"
      onSave={page.saveFor(marketKey)}
    />
  )
}
