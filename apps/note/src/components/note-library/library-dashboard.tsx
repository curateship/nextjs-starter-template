import * as React from "react"
import { LibraryIcon } from "lucide-react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"

import { EmptyRecord } from "@/components/crm/record-frame"
import { PlanStepsPanel, QuotesPanel } from "@/components/note-library/gathered-lists"
import { LibraryLeftPanel } from "@/components/note-library/library-left-panel"
import { NotePanel } from "@/components/note-library/note-panel"
import { LibraryTabs, NotesListPanel } from "@/components/note-library/notes-list-panel"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { MiddleHeading, middleGutterClassName, PanelReopenButton, ThreePanels } from "@/components/shared/three-panels"
import { getLibraryErrorMessage, loadLibraries, loadLibrary, markLibraryOpen } from "@/lib/api/note/library"
import { loadLibraryLeftPage } from "@/lib/api/note/library-page"
import { loadNotes } from "@/lib/api/note/notes"
import { filtersOf, listKeyOf, scopeOf, sortOf, type LibrarySearch } from "@/lib/note/library/address"
import { isMoving, type LibraryPage, type LibraryRow, type NoteCard, type NoteList } from "@/lib/note/library/notes"
import type { StoredPage } from "@/lib/notes/page-body"

/** A moment to play the open note's video from, asked for by a quote; `round` makes a second ask of the same moment new. */
export type SeekRequest = { noteId: string; ms: number; round: number }
import { libraryPlaceKey, NOTE_LIBRARY_LAYOUT_KEY } from "@/lib/note/view-key"
import { showErrorToast } from "@/lib/toast/error-toast"

const libraryRoute = getRouteApi("/_authenticated/library/$libraryId")

/**
 * The person's left page, read once when the dashboard opens and kept while
 * the library picked changes, so the page and anything typed on it never
 * draw again (the Admin 3 panel design, "One frame for every section").
 */
function useLeftPage() {
  const [page, setPage] = React.useState<StoredPage | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reads, setReads] = React.useState(0)
  React.useEffect(() => {
    let live = true
    loadLibraryLeftPage()
      .then((read) => {
        if (live) setPage(read)
      })
      .catch((failure) => {
        if (live) setError(getLibraryErrorMessage(failure))
      })
    return () => {
      live = false
    }
  }, [reads])
  return {
    page,
    error,
    setPage,
    retry: () => {
      setError(null)
      setReads((count) => count + 1)
    },
  }
}

/** Every library of this person's, read again after a change to any of them. */
function useLibraries(initial: LibraryRow[]) {
  const [libraries, setLibraries] = React.useState(initial)
  const refresh = React.useCallback(async () => {
    try {
      setLibraries(await loadLibraries())
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
    }
  }, [])
  return { libraries, setLibraries, refresh }
}

/** How long after each answer the list asks again while an import or analysis is moving. */
const POLL_MS = 3000

export type DashboardActions = {
  /** Opens a note on the right, or closes it with undefined. */
  openNote: (id: string | undefined) => void
  /** A note changed on the right; its row follows. */
  cardChanged: (card: NoteCard) => void
  /** A note left the list it was on: Trash, restored, moved away, or gone for good. */
  gone: (id: string) => void
  /** The library's counts, authors and tags, read again. */
  refreshPage: () => Promise<void>
  /** The list, read again. */
  refreshList: () => Promise<void>
  /** Both, after a change that moves counts and rows at once. */
  refreshAll: () => Promise<void>
  /** Changes the address: the tab, Show, search, filters, view or open note. */
  setSearch: (change: Partial<LibrarySearch>, options?: { replace?: boolean }) => void
}

/**
 * The Library dashboard (Tyler, 15 Nov 2026: "We need to revamp the ui to the
 * new shell 3 panel ui", then "I think the library should live as a left
 * panel dashboard block"), on the shell's three-panel design: the person's
 * own page on the left with the fixed Libraries block and the blocks of the
 * library picked, its notes in the middle under the All notes, Plan steps and
 * Quotes tabs, and the open note on the right.
 *
 * One frame for every library: picking another keeps the left page where it
 * is and opens the new library's first note. The address holds the place, and
 * this browser remembers the last one per library: opened at its bare
 * address, a library goes back to where it was (UI standard, "Every
 * three-column dashboard opens a record on arrival and goes back to where it
 * was"), and with no note open after that, the first row opens.
 */
export function LibraryDashboard({
  libraryId,
  initial,
}: {
  libraryId: string
  initial: { libraries: LibraryRow[]; page: LibraryPage; list: NoteList }
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const search = libraryRoute.useSearch()
  const left = useLeftPage()
  const libraries = useLibraries(initial.libraries)
  const [page, setPage] = React.useState(initial.page)
  const scope = scopeOf(search)
  const filters = filtersOf(search)
  const sort = sortOf(search)
  const listKey = `${libraryId}|${listKeyOf(search)}`
  // The list carries the address it was read for, so a list from before a
  // change of tab is never taken for the new one.
  const [listed, setListed] = React.useState({ key: listKey, list: initial.list })
  const list = listed.list
  // The address whose list would not load, so the panel says so instead of
  // waiting for ever; Try again clears it.
  const [failedKey, setFailedKey] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [seekTo, setSeekTo] = React.useState<SeekRequest | null>(null)

  // Another library picked: the route's loader read its page and first list,
  // and everything of the last one is let go. The frame and the left page stay.
  const [shownLibrary, setShownLibrary] = React.useState(libraryId)
  if (libraryId !== shownLibrary) {
    setShownLibrary(libraryId)
    setPage(initial.page)
    setListed({ key: listKey, list: initial.list })
    setFailedKey(null)
    setSeekTo(null)
  }
  const listFailed = failedKey === listKey && listed.key !== listKey
  // Waiting for the list of a tab, search or filter just picked.
  const listLoading = listed.key !== listKey && !listFailed

  // ---------------------------------------------------------------------------
  // The address

  const setSearch = React.useCallback(
    (change: Partial<LibrarySearch>, options: { replace?: boolean } = {}) => {
      void navigate({
        to: "/library/$libraryId",
        params: { libraryId },
        // Any route's search, as the router types it; only this route's keys are kept.
        search: (previous: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries({ ...previous, ...change }).filter(([, value]) => value !== undefined)
          ) as LibrarySearch,
        // Opening a note is a step Back can undo; narrowing the list is not.
        replace: options.replace ?? !("open" in change),
      })
    },
    [libraryId, navigate]
  )

  const pickLibrary = React.useCallback(
    (id: string) => {
      if (id === libraryId) return
      void navigate({ to: "/library/$libraryId", params: { libraryId: id }, search: {} })
    },
    [libraryId, navigate]
  )

  // Opening a library makes it the one the Save to Note button saves into.
  React.useEffect(() => {
    markLibraryOpen(libraryId).catch(() => undefined)
  }, [libraryId])

  // ---------------------------------------------------------------------------
  // Reading

  const pageRequest = React.useRef(0)
  const refreshLibraries = libraries.refresh
  const refreshPage = React.useCallback(
    async (options: { quiet?: boolean } = {}) => {
      const ticket = ++pageRequest.current
      try {
        const [fresh] = await Promise.all([loadLibrary(libraryId), refreshLibraries()])
        if (ticket === pageRequest.current) setPage(fresh)
      } catch (error) {
        if (!options.quiet) showErrorToast(getLibraryErrorMessage(error))
      }
    },
    [libraryId, refreshLibraries]
  )

  // What the list is asked for, kept for the polling and the panels' refreshes.
  const query = React.useRef({ key: listKey, libraryId, scope, q: search.q, filters, sort })
  React.useEffect(() => {
    query.current = { key: listKey, libraryId, scope, q: search.q, filters, sort }
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
          libraryId: asked.libraryId,
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
    []
  )

  const refreshAll = React.useCallback(
    async (options: { quiet?: boolean } = {}) => {
      await Promise.all([refreshPage(options), refreshList(options)])
    },
    [refreshList, refreshPage]
  )

  // The route's loader read the first list; each later change of tab,
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
  const tabs = <LibraryTabs page={page} search={search} actions={actions} />

  const middle =
    search.tab === "steps" ? (
      <PlanStepsPanel
        page={page}
        tabs={tabs}
        actions={actions}
        openId={search.open}
        onOpenedChanged={() => setReloadKey((count) => count + 1)}
      />
    ) : search.tab === "quotes" ? (
      <QuotesPanel
        page={page}
        tabs={tabs}
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
    // The right panel carries the left page's cover on (the Admin 3 panel design).
    <RightCoverProvider value={left.page?.coverUrl ?? null}>
      <ThreePanels
        layoutKey={NOTE_LIBRARY_LAYOUT_KEY}
        reopenInHeader
        // The list loads here rather than in the route's loader, so the first
        // row waits until the rows shown are the ones for this address. Each
        // library is a section: picking one opens its first note.
        place={{
          key: libraryPlaceKey(libraryId),
          search,
          ids: list.notes.map((note) => note.id),
          ready: listed.key === listKey,
          section: libraryId,
        }}
        showMiddleFor={`${libraryId}|${scope}|${search.author ?? ""}`}
        showRightFor={search.open}
        left={{
          label: "Library",
          showLabel: "Show the page",
          content: (
            <LibraryLeftPanel
              libraries={libraries.libraries}
              libraryId={libraryId}
              page={page}
              leftPage={left.page}
              leftPageError={left.error}
              onRetryLeftPage={left.retry}
              onLeftPageChange={left.setPage}
              search={search}
              actions={actions}
              onPickLibrary={pickLibrary}
              onLibrariesChanged={libraries.refresh}
              onLibraryMade={(row) => {
                libraries.setLibraries((current) => [...current, row])
                pickLibrary(row.id)
              }}
              onLibraryDeleted={async (id) => {
                await libraries.refresh()
                if (id === libraryId) {
                  void navigate({ to: "/library", search: { save: undefined, key: undefined } })
                }
                await router.invalidate()
              }}
            />
          ),
        }}
        middle={{
          label: "Notes",
          content: <div className={`h-full min-h-0 ${middleGutterClassName}`}>{middle}</div>,
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
    </RightCoverProvider>
  )
}

/**
 * `/library` for somebody with no library yet: the same frame, the left page
 * with its Libraries block and its +, and nothing in the middle but where to
 * start. Making one opens it.
 */
export function NoLibraryDashboard() {
  const navigate = useNavigate()
  const left = useLeftPage()
  const libraries = useLibraries([])
  const open = (id: string) => void navigate({ to: "/library/$libraryId", params: { libraryId: id }, search: {} })
  return (
    <RightCoverProvider value={left.page?.coverUrl ?? null}>
      <ThreePanels
        layoutKey={NOTE_LIBRARY_LAYOUT_KEY}
        reopenInHeader
        place={{ key: libraryPlaceKey("none"), search: {}, ids: [] }}
        left={{
          label: "Library",
          showLabel: "Show the page",
          content: (
            <LibraryLeftPanel
              libraries={libraries.libraries}
              libraryId={null}
              page={null}
              leftPage={left.page}
              leftPageError={left.error}
              onRetryLeftPage={left.retry}
              onLeftPageChange={left.setPage}
              search={{}}
              actions={null}
              onPickLibrary={open}
              onLibrariesChanged={libraries.refresh}
              onLibraryMade={(row) => open(row.id)}
              onLibraryDeleted={libraries.refresh}
            />
          ),
        }}
        middle={{
          label: "Notes",
          content: (
            <div className={`flex h-full min-h-0 flex-col bg-card ${middleGutterClassName}`}>
              <DashboardCardHeader className="gap-2">
                <MiddleHeading icon={LibraryIcon} label="Library" />
                <span className="ml-auto" />
                <PanelReopenButton side="right" label="Show the note" />
              </DashboardCardHeader>
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No libraries yet. The + on Libraries, on the left, makes one.
              </p>
            </div>
          ),
        }}
        right={{
          label: "Note",
          showLabel: "Show the note",
          content: <EmptyRecord title="Note" icon={<LibraryIcon aria-hidden />} line="Make a library and its notes open here." hideLabel="Hide the note" />,
        }}
      />
    </RightCoverProvider>
  )
}
