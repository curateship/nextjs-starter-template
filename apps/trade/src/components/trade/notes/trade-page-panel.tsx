import * as React from "react"

import { SavingDocument } from "@/components/trade/notes/saving-document"
import type { PageCover, PageLock } from "@/components/shared/notes/page-rows"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import type { StoredPage } from "@/lib/api/trade/dashboard"
import {
  loadPage,
  lockPage,
  savePage,
  setPageCover,
} from "@/lib/api/trade/pages"
import { defaultTradePage } from "@/lib/trade/trade-pages"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Trade dashboard's left page (8 Nov 2026), one per person, the same
 * whichever exchange is picked (Tyler: "The picked exchange", the blocks
 * following it). There is no right page any more.
 */

type PageState =
  | { state: "ready"; page: StoredPage }
  | { state: "loading" }
  | { state: "failed" }

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** A page's words as the editor reads them: the starting page when none was ever written. */
function shownBody(page: StoredPage) {
  return page.body ?? JSON.stringify(defaultTradePage())
}

export function useTradePage({
  initial,
}: {
  /** What the dashboard's opening answer carried for the page. */
  initial: StoredPage
}) {
  const [page, setPage] = React.useState<StoredPage | null>(initial)
  const [failed, setFailed] = React.useState(false)
  const [lockBusy, setLockBusy] = React.useState(false)
  const [coverBusy, setCoverBusy] = React.useState(false)
  // The open editor's save-now; see `flush` below.
  const flushRef = React.useRef<(() => void) | null>(null)

  const state: PageState = page
    ? { state: "ready", page }
    : failed
      ? { state: "failed" }
      : { state: "loading" }

  const save = React.useCallback(async (body: string) => {
    // Kept at once, so the page drawn again (locked, or after a switch) shows
    // these words even before the server has answered.
    setPage((was) => ({
      body,
      locked: was?.locked ?? false,
      coverUrl: was?.coverUrl ?? null,
      coverImages: was?.coverImages ?? [],
    }))
    try {
      const saved = await savePage(body)
      setPage((was) => ({
        body: saved.body,
        locked: saved.locked,
        coverUrl: was?.coverUrl ?? null,
        coverImages: was?.coverImages ?? [],
      }))
    } catch (error) {
      showErrorToast(errorText(error, "The page could not be saved."))
    }
  }, [])

  const lock: PageLock = {
    locked: page?.locked ?? false,
    busy: lockBusy || !page,
    setLocked: (locked) => {
      if (!page) return
      setLockBusy(true)
      lockPage(locked, shownBody(page))
        .then(() =>
          setPage((was) => ({
            body: was?.body ?? shownBody(page),
            locked,
            coverUrl: was?.coverUrl ?? null,
            coverImages: was?.coverImages ?? [],
          }))
        )
        .catch((error: unknown) =>
          showErrorToast(errorText(error, "The lock could not be saved."))
        )
        .finally(() => setLockBusy(false))
    },
  }

  /**
   * The cover behind the panel's header, picked from the ⋮ with the shell's
   * tiles: None, Sky, the page's pictures and + (Tyler, 8 Nov 2026: "cover
   * photos is not using shell standard").
   */
  const cover: PageCover = {
    url: page?.coverUrl ?? null,
    images: page?.coverImages ?? [],
    busy: coverBusy || !page,
    set: ({ url, images }) => {
      if (!page) return
      setCoverBusy(true)
      setPageCover({ coverUrl: url, coverImages: images }, shownBody(page))
        .then((saved) =>
          setPage((was) => ({
            body: was?.body ?? shownBody(page),
            locked: was?.locked ?? false,
            coverUrl: saved.coverUrl,
            coverImages: saved.coverImages,
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
    state,
    lock,
    cover,
    save,
    flushRef,
    /**
     * Saves what was typed in the last moments at once, rather than 700ms
     * later. The dashboard calls it before it moves to another exchange,
     * because that draws the page again from what this hook holds.
     */
    flush: () => flushRef.current?.(),
    retry: () => {
      setFailed(false)
      setPage(null)
      loadPage().then(setPage, () => setFailed(true))
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
      // A new editor per lock.
      key={String(state.page.locked)}
      value={shownBody(state.page)}
      locked={state.page.locked}
      placeholder={placeholder}
      onSave={page.save}
      flushRef={page.flushRef}
    />
  )
}
