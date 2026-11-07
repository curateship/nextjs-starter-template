import * as React from "react"

import { SavingDocument } from "@/components/trade/notes/saving-document"
import type { PageCover, PageLock } from "@/components/trade/notes/page-menus"
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
import {
  defaultTradePage,
  pageKindOf,
  type TradePageKey,
} from "@/lib/trade/trade-pages"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * One of the trading dashboard's two pages (the Admin 3 panel design, 7 Nov
 * 2026), both one per exchange: the exchange's own page on the left
 * (`pageKey` "") and the All markets page on the right ("*"), which every
 * market on the exchange shows (Tyler, 7 Nov 2026: "We should make both left
 * and right panel all protocol wide").
 */

type PageState =
  | { state: "ready"; page: StoredPage }
  | { state: "loading" }
  | { state: "failed" }

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** A page's words as the editor reads them: the starting page when none was ever written. */
function shownBody(page: StoredPage, pageKey: TradePageKey) {
  return page.body ?? JSON.stringify(defaultTradePage(pageKindOf(pageKey)))
}

export function useTradePage({
  protocol,
  pageKey,
  initial,
}: {
  protocol: ProtocolId
  pageKey: TradePageKey
  /** What the dashboard's opening answer carried for this page. */
  initial: StoredPage
}) {
  // Filed by exchange, because both pages' keys are the same on every
  // exchange: Phemex must never be shown Hyperliquid's page.
  const [pages, setPages] = React.useState<
    Partial<Record<ProtocolId, StoredPage>>
  >(() => ({ [protocol]: initial }))
  const [failed, setFailed] = React.useState<ProtocolId | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [lockBusy, setLockBusy] = React.useState(false)
  const [coverBusy, setCoverBusy] = React.useState(false)
  const page = pages[protocol]
  const remember = React.useCallback(
    (from: ProtocolId, change: (was: StoredPage | undefined) => StoredPage) =>
      setPages((all) => ({ ...all, [from]: change(all[from]) })),
    []
  )

  // Another exchange's page, read when the dashboard moves to it without a reload.
  React.useEffect(() => {
    if (page) return
    let current = true
    setFailed(null)
    loadPage({ protocol, marketKey: pageKey }).then(
      (loaded) => {
        if (current) remember(protocol, () => loaded)
      },
      () => {
        if (current) setFailed(protocol)
      }
    )
    return () => {
      current = false
    }
  }, [attempt, page, pageKey, protocol, remember])

  const state: PageState = page
    ? { state: "ready", page }
    : failed === protocol
      ? { state: "failed" }
      : { state: "loading" }

  /** Saves one exchange's page, bound to it, so words typed here never land on the next exchange's. */
  const saveFor = React.useCallback(
    (from: ProtocolId) => async (body: string) => {
      // Kept at once, so the page drawn again (locked, or moved back to) shows
      // these words even before the server has answered.
      remember(from, (was) => ({
        body,
        locked: was?.locked ?? false,
        coverUrl: was?.coverUrl ?? null,
      }))
      try {
        const saved = await savePage({ protocol: from, marketKey: pageKey }, body)
        remember(from, (was) => ({
          body: saved.body,
          locked: saved.locked,
          coverUrl: was?.coverUrl ?? null,
        }))
      } catch (error) {
        showErrorToast(errorText(error, "The page could not be saved."))
      }
    },
    [pageKey, remember]
  )

  const lock: PageLock = {
    locked: page?.locked ?? false,
    busy: lockBusy || !page,
    setLocked: (locked) => {
      if (!page) return
      const from = protocol
      setLockBusy(true)
      lockPage(
        { protocol: from, marketKey: pageKey },
        locked,
        shownBody(page, pageKey)
      )
        .then(() =>
          remember(from, (was) => ({
            body: was?.body ?? shownBody(page, pageKey),
            locked,
            coverUrl: was?.coverUrl ?? null,
          }))
        )
        .catch((error: unknown) =>
          showErrorToast(errorText(error, "The lock could not be saved."))
        )
        .finally(() => setLockBusy(false))
    },
  }

  /** The cover photo behind the panel's header, set or cleared from the ⋮. */
  const cover: PageCover = {
    url: page?.coverUrl ?? null,
    busy: coverBusy || !page,
    set: (coverUrl) => {
      if (!page) return
      const from = protocol
      setCoverBusy(true)
      setPageCover(
        { protocol: from, marketKey: pageKey },
        coverUrl,
        shownBody(page, pageKey)
      )
        .then(() =>
          remember(from, (was) => ({
            body: was?.body ?? shownBody(page, pageKey),
            locked: was?.locked ?? false,
            coverUrl,
          }))
        )
        .catch((error: unknown) =>
          showErrorToast(
            errorText(error, "The cover photo could not be saved.")
          )
        )
        .finally(() => setCoverBusy(false))
    },
  }

  return {
    protocol,
    pageKey,
    state,
    lock,
    cover,
    saveFor,
    retry: () => {
      setFailed(null)
      setAttempt((count) => count + 1)
    },
  }
}

export type TradePage = ReturnType<typeof useTradePage>

/** The page itself, under the panel's header. */
export function TradePageBody({
  page,
  placeholder = "Type / for a block",
}: {
  page: TradePage
  placeholder?: string
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
      // A new editor per exchange and per lock, each saving to its own page only.
      key={`${page.protocol}:${page.pageKey}:${state.page.locked}`}
      value={shownBody(state.page, page.pageKey)}
      locked={state.page.locked}
      placeholder={placeholder}
      onSave={page.saveFor(page.protocol)}
    />
  )
}
