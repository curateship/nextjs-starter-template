import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"

import { PlanStepsPanel, QuotesPanel } from "@/components/note-library/gathered-lists"
import { LibraryLeftPanel } from "@/components/note-library/library-left-panel"
import { NotePanel } from "@/components/note-library/note-panel"
import { NotesListPanel } from "@/components/note-library/notes-list-panel"
import { ThreePanels } from "@/components/shared/three-panels"
import { getLibraryErrorMessage, loadLibrary, markLibraryOpen } from "@/lib/api/note/library"
import { loadNotes } from "@/lib/api/note/notes"
import { filtersOf, listKeyOf, scopeOf, sortOf, type LibrarySearch } from "@/lib/note/library/address"
import { isMoving, type LibraryPage, type NoteCard, type NoteList } from "@/lib/note/library/notes"

/** A moment to play the open note's video from, asked for by a quote; `round` makes a second ask of the same moment new. */
export type SeekRequest = { noteId: string; ms: number; round: number }
import { libraryPlaceKey, NOTE_LIBRARY_LAYOUT_KEY } from "@/lib/note/view-key"
import { showErrorToast } from "@/lib/toast/error-toast"

const libraryRoute = getRouteApi("/_authenticated/library/$libraryId")

/** How long after each answer the list asks again while an import or analysis is moving. */
const POLL_MS = 3000

export type DashboardActions = {
  /** Opens a note on the right, or closes it with undefined. */
  openNote: (id: string | undefined) => void
  /** A note changed on the right; its row follows. */
  cardChanged: (card: NoteCard) => void
  /** A note left the list it was on: Trash, restored, moved away, or gone for good. */
  gone: (id: string) => void
  /** The left panel's figures, folders, authors and tags, read again. */
  refreshPage: () => Promise<void>
  /** The list, read again. */
  refreshList: () => Promise<void>
  /** Both, after a change that moves counts and rows at once. */
  refreshAll: () => Promise<void>
  /** Changes the address: the folder, author, search, filters, view or open note. */
  setSearch: (change: Partial<LibrarySearch>, options?: { replace?: boolean }) => void
}

/**
 * One library's three-column dashboard (Tyler's drawing of 20 Oct 2026): the
 * library, its folders, authors, Recently opened and tags on the left, its
 * notes as a table in the middle, and the open note on the right.
 *
 * The address holds the place, and this browser remembers the last one per
 * library: opened at its bare address, the dashboard goes back to where it was
 * (UI standard, "Every three-column dashboard opens a record on arrival and
 * goes back to where it was"), and with no note open after that, the first
 * row opens.
 */
export function LibraryDashboard({
  libraryId,
  initial,
}: {
  libraryId: string
  initial: { page: LibraryPage; list: NoteList }
}) {
  const navigate = useNavigate()
  const search = libraryRoute.useSearch()
  const [page, setPage] = React.useState(initial.page)
  const scope = scopeOf(search)
  const filters = filtersOf(search)
  const sort = sortOf(search)
  const listKey = listKeyOf(search)
  // The list carries the address it was read for, so a list from before a
  // change of folder is never taken for the new one.
  const [listed, setListed] = React.useState({ key: listKey, list: initial.list })
  const list = listed.list
  // The address whose list would not load, so the panel says so instead of
  // waiting for ever; Try again clears it.
  const [failedKey, setFailedKey] = React.useState<string | null>(null)
  const listFailed = failedKey === listKey && listed.key !== listKey
  // Waiting for the list of a folder, search or filter just picked.
  const listLoading = listed.key !== listKey && !listFailed
  const [reloadKey, setReloadKey] = React.useState(0)
  const [seekTo, setSeekTo] = React.useState<SeekRequest | null>(null)

  // ---------------------------------------------------------------------------
  // The address

  const setSearch = React.useCallback(
    (change: Partial<LibrarySearch>, options: { replace?: boolean } = {}) => {
      void navigate({
        to: "/library/$libraryId",
        params: { libraryId },
        search: (previous: LibrarySearch) =>
          Object.fromEntries(
            Object.entries({ ...previous, ...change }).filter(([, value]) => value !== undefined)
          ) as LibrarySearch,
        // Opening a note is a step Back can undo; narrowing the list is not.
        replace: options.replace ?? !("open" in change),
      })
    },
    [libraryId, navigate]
  )

  // Opening the dashboard makes this the library the Save from x.com button saves into.
  React.useEffect(() => {
    markLibraryOpen(libraryId).catch(() => undefined)
  }, [libraryId])

  // ---------------------------------------------------------------------------
  // Reading

  const pageRequest = React.useRef(0)
  const refreshPage = React.useCallback(
    async (options: { quiet?: boolean } = {}) => {
      const ticket = ++pageRequest.current
      try {
        const fresh = await loadLibrary(libraryId)
        if (ticket === pageRequest.current) setPage(fresh)
      } catch (error) {
        if (!options.quiet) showErrorToast(getLibraryErrorMessage(error))
      }
    },
    [libraryId]
  )

  // What the list is asked for, kept for the polling and the panels' refreshes.
  const query = React.useRef({ key: listKey, scope, q: search.q, filters, sort })
  React.useEffect(() => {
    query.current = { key: listKey, scope, q: search.q, filters, sort }
    // The key says everything the list is asked for, so it alone moves this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey])

  const listRequest = React.useRef(0)
  const refreshList = React.useCallback(
    async (options: { quiet?: boolean } = {}) => {
      const ticket = ++listRequest.current
      const asked = query.current
      try {
        const fresh = await loadNotes({
          libraryId,
          scope: asked.scope,
          search: asked.q,
          filters: asked.filters,
          sort: asked.sort,
        })
        if (ticket !== listRequest.current) return
        setListed({ key: asked.key, list: fresh })
        setFailedKey((failed) => (failed === asked.key ? null : failed))
      } catch (error) {
        if (ticket !== listRequest.current) return
        setFailedKey(asked.key)
        if (!options.quiet) showErrorToast(getLibraryErrorMessage(error))
      }
    },
    [libraryId]
  )

  const refreshAll = React.useCallback(
    async (options: { quiet?: boolean } = {}) => {
      await Promise.all([refreshPage(options), refreshList(options)])
    },
    [refreshList, refreshPage]
  )

  // The route's loader read the first list; each later change of folder,
  // search or filters reads it again, unless that very list just failed.
  React.useEffect(() => {
    if (listed.key !== listKey && failedKey !== listKey) void refreshList()
  }, [failedKey, listKey, listed.key, refreshList])

  // While any row is importing or being analysed, ask again three seconds
  // after each answer, so two asks are never in the air at once. A missed
  // answer starts the next wait too, quietly, so a dropped connection never
  // stops the asking or fills the screen with toasts.
  const moving = list.notes.some(isMoving)
  const [pollRound, setPollRound] = React.useState(0)
  React.useEffect(() => {
    if (!moving) return
    const timer = setTimeout(() => {
      void refreshAll({ quiet: true }).finally(() => setPollRound((round) => round + 1))
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [moving, listed, pollRound, refreshAll])

  // ---------------------------------------------------------------------------
  // What the panels can do

  const actions: DashboardActions = React.useMemo(
    () => ({
      openNote: (id) => {
        // A quote's moment is for the one opening that asked for it.
        setSeekTo(null)
        setSearch({ open: id })
      },
      cardChanged: (card) =>
        setListed((current) => ({
          ...current,
          list: { ...current.list, notes: current.list.notes.map((note) => (note.id === card.id ? card : note)) },
        })),
      gone: (id) => {
        setListed((current) => ({
          ...current,
          list: { ...current.list, notes: current.list.notes.filter((note) => note.id !== id) },
        }))
        void refreshPage()
      },
      refreshPage,
      refreshList,
      refreshAll,
      setSearch,
    }),
    [refreshAll, refreshList, refreshPage, setSearch]
  )

  const openCard = list.notes.find((note) => note.id === search.open) ?? null

  const middle =
    scope === "steps" ? (
      <PlanStepsPanel
        page={page}
        actions={actions}
        openId={search.open}
        onOpenedChanged={() => setReloadKey((count) => count + 1)}
      />
    ) : scope === "quotes" ? (
      <QuotesPanel
        page={page}
        onOpen={(quote) => {
          actions.openNote(quote.noteId)
          if (quote.startMs !== null) {
            setSeekTo((current) => ({ noteId: quote.noteId, ms: quote.startMs ?? 0, round: (current?.round ?? 0) + 1 }))
          }
        }}
      />
    ) : (
      <NotesListPanel
        page={page}
        list={list}
        loading={listLoading}
        failed={listFailed}
        onRetry={() => setFailedKey(null)}
        search={search}
        openId={search.open}
        actions={actions}
        onOpenedElsewhere={() => setReloadKey((count) => count + 1)}
      />
    )

  return (
    <ThreePanels
      layoutKey={NOTE_LIBRARY_LAYOUT_KEY}
      // The list loads here rather than in the route's loader, so the first
      // row waits until the rows shown are the ones for this address.
      place={{
        key: libraryPlaceKey(libraryId),
        search,
        ids: list.notes.map((note) => note.id),
        ready: listed.key === listKey,
      }}
      showMiddleFor={`${scope}|${search.author ?? ""}`}
      showRightFor={search.open}
      left={{
        label: "Library",
        showLabel: "Show the library",
        content: <LibraryLeftPanel page={page} search={search} actions={actions} />,
      }}
      middle={{
        label: "Notes",
        content: middle,
      }}
      right={{
        label: "Note",
        showLabel: "Show the note",
        content: (
          <NotePanel
            noteId={search.open ?? null}
            listedCard={openCard}
            reloadKey={reloadKey}
            seekTo={seekTo?.noteId === search.open ? seekTo : null}
            page={page}
            actions={actions}
          />
        ),
      }}
    />
  )
}
