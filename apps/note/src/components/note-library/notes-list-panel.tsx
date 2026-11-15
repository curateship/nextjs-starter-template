import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"

import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { CrmGroupRow, CrmTable, CrmTableRow, MainCell, useFolds } from "@/components/crm/crm-table"
import type { DashboardActions } from "@/components/note-library/library-dashboard"
import { SourceMark } from "@/components/note-library/library-dot"
import { NewNoteDropdown } from "@/components/note-library/new-note-dropdown"
import { NoteBulkMenu } from "@/components/note-library/note-bulk-menu"
import { NoteFilterMenu, ViewsMenu } from "@/components/note-library/note-filter-menu"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { TableCell, TableSortButton } from "@/components/ui/table"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { changeNotes, deleteNoteNow, duplicateLibraryNote, emptyLibraryTrash, restoreNoteFromTrash } from "@/lib/api/note/notes"
import { formatShortTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { filtersOf, sortOf, sortParam, type LibrarySearch, type LibraryTab } from "@/lib/note/library/address"
import {
  FILTER_KEYS,
  isAnalysing,
  isImporting,
  NOTES_LIST_MAX,
  noteTitle,
  PRIORITY_LABEL,
  TRASH_DAYS,
  type LibraryPage,
  type NoteCard,
  type NoteList,
  type NotePriority,
  type NoteSort,
  type NoteSortColumn,
} from "@/lib/note/library/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** The way a column sorts on its first click: names A to Z, High first, newest first. */
const FIRST_CLICK_DESCENDING: Record<NoteSortColumn, boolean> = {
  title: false,
  source: false,
  priority: true,
  edited: true,
}

/** With no sort in the address the table is newest edited first. */
const DEFAULT_SORT: NoteSort = { column: "edited", descending: true }

/**
 * The start of the middle's one header on every tab (Tyler, 15 Nov 2026: "All
 * notes, Plan steps and Quotes are tabs in the middle's one header"): the
 * button that brings a shut left panel back, then the three tabs with their
 * counts. A header with tabs has no icon (the Admin 3 panel design).
 */
export function LibraryTabs({ page, search, actions }: { page: LibraryPage; search: LibrarySearch; actions: DashboardActions }) {
  return (
    <>
      <PanelReopenButton side="left" label="Show the page" />
      <DashboardTabs
        // At least 112px: on a phone the header's buttons took every pixel and
        // squeezed the tabs to nothing, leaving Plan steps and Quotes out of
        // reach. With this the row scrolls sideways instead.
        className="min-w-28"
        value={search.tab ?? "all"}
        onValueChange={(value) => actions.setSearch({ tab: value === "all" ? undefined : (value as LibraryTab) })}
        tabs={[
          { value: "all", label: "All notes", count: page.counts.all },
          { value: "pinned", label: "Pinned", count: page.counts.pinned },
          { value: "steps", label: "Plan steps", count: page.counts.openSteps },
          { value: "quotes", label: "Quotes", count: page.counts.quotes },
        ]}
      />
    </>
  )
}

/**
 * The All notes and Pinned tabs, on the shell's middle panel (the Admin 3 panel design,
 * "Middle panel"): one header with the tabs, the "N selected" menu while rows
 * are ticked, the search box, Select, Filter (with Show: Loose notes,
 * Archived, Trash), Views and New note, whose first step also imports a
 * link, then a ⋮ on Trash with Empty trash. Under it the notes as the shell's
 * table, Pinned first and the rest under Notes, each folding. A column
 * heading sorts the table, and a second click turns it round.
 *
 * Every row has the shell's cog, which opens the note, its bin, which moves
 * it to Trash, and a right-click menu: Mass select, Pin, Archive, Duplicate,
 * then Move to Trash under a line (Tyler, 15 Nov 2026: "shell has icons and
 * right click", "its not either or, its both"). In Trash the row restores or
 * deletes for good instead.
 */
export function NotesListPanel({
  page,
  list,
  loading,
  failed,
  onRetry,
  search,
  openId,
  actions,
  onOpenedElsewhere,
}: {
  page: LibraryPage
  list: NoteList
  loading: boolean
  /** The list for this folder, search or filter would not load. */
  failed: boolean
  onRetry: () => void
  search: LibrarySearch
  openId: string | undefined
  actions: DashboardActions
  /** The open note changed from a row, so the right panel reads it again. */
  onOpenedElsewhere: () => void
}) {
  const trash = search.show === "trash"
  const archived = search.show === "archived"
  const filters = filtersOf(search)

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  useClearSelectionOnListChange(
    selection.setSelected,
    JSON.stringify({ tab: search.tab, show: search.show, q: search.q, filters })
  )
  const visibleIds = list.notes.map((note) => note.id)
  const picked = list.notes.filter((note) => selection.selected.has(note.id))
  /** Turned on from a row's right-click, that row starts ticked. */
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) selection.clear()
    else if (tickId) selection.setSelected(new Set([tickId]))
    setMassSelect(!massSelect)
  }

  const [busy, setBusy] = React.useState(false)
  const [forGood, setForGood] = React.useState<NoteCard | null>(null)
  const [emptying, setEmptying] = React.useState(false)
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const folds = useFolds()

  async function act(work: () => Promise<unknown>) {
    setBusy(true)
    dismissErrorToast()
    try {
      await work()
      return true
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  // Trash keeps its own order, newest trashed first, so its headings do not sort.
  const sort = sortOf(search) ?? DEFAULT_SORT
  function sortBy(column: NoteSortColumn) {
    if (trash) return
    const next = sort.column === column ? { column, descending: !sort.descending } : { column, descending: FIRST_CLICK_DESCENDING[column] }
    const isDefault = next.column === DEFAULT_SORT.column && next.descending === DEFAULT_SORT.descending
    actions.setSearch({ sort: isDefault ? undefined : sortParam(next) })
  }
  const heading = (column: NoteSortColumn, label: string) =>
    trash ? (
      label
    ) : (
      <TableSortButton active={sort.column === column} direction={sort.descending ? "desc" : "asc"} onClick={() => sortBy(column)}>
        {label}
      </TableSortButton>
    )

  // Columns drop out as the middle narrows, each only once there is room for
  // every one before it, so the table never runs past its panel.
  const columns: TableHeaderColumn<NoteSortColumn>[] = [
    { key: "title", sortable: false, column: "main", className: "min-w-40", label: heading("title", "Note") },
    { key: "source", sortable: false, column: "preview", className: "hidden md:hidden @xl:table-cell", label: heading("source", "Source") },
    { key: "priority", sortable: false, column: "preview", className: "hidden md:hidden @2xl:table-cell", label: heading("priority", "Priority") },
    { key: "edited", sortable: false, column: "meta", className: "hidden @lg:table-cell", label: trash ? "Trashed" : heading("edited", "Edited") },
  ]

  // All notes shows its pinned ones first under their own heading; the Pinned
  // tab and Trash are one list.
  const grouped = !trash && search.tab !== "pinned"
  const pinned = grouped ? list.notes.filter((note) => note.pinned) : []
  const rest = grouped ? list.notes.filter((note) => !note.pinned) : list.notes
  const filtering = Boolean(search.q) || FILTER_KEYS.some((key) => filters[key] !== undefined)

  const rowChanged = async (note: NoteCard) => {
    await actions.refreshAll()
    if (note.id === openId) onOpenedElsewhere()
  }
  const toTrash = (note: NoteCard) =>
    void act(async () => {
      await changeNotes([note.id], { change: "trash" })
      actions.gone(note.id)
      if (note.id === openId) actions.openNote(undefined)
    })
  const restore = (note: NoteCard) =>
    void act(async () => {
      await restoreNoteFromTrash(note.id)
      actions.gone(note.id)
    })

  function rowMenuItems(id: string): RowMenuItem[] {
    const note = list.notes.find((each) => each.id === id)
    if (!note) return []
    if (trash) {
      return [
        { label: "Restore", icon: <Undo2Icon className="size-4" />, onSelect: () => restore(note) },
        { label: "Delete for good", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setForGood(note) },
      ]
    }
    return [
      {
        label: note.pinned ? "Unpin" : "Pin",
        icon: note.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />,
        onSelect: () =>
          void act(async () => {
            await changeNotes([note.id], { change: "pin", on: !note.pinned })
            await rowChanged(note)
          }),
      },
      {
        label: note.archived ? "Unarchive" : "Archive",
        icon: note.archived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />,
        onSelect: () =>
          void act(async () => {
            await changeNotes([note.id], { change: "archive", on: !note.archived })
            await rowChanged(note)
          }),
      },
      {
        label: "Duplicate",
        icon: <CopyIcon className="size-4" />,
        onSelect: () =>
          void act(async () => {
            const copy = await duplicateLibraryNote(note.id)
            await actions.refreshAll()
            actions.openNote(copy.id)
          }),
      },
      { label: "Move to Trash", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => toTrash(note) },
    ]
  }

  const row = (note: NoteCard) => {
    const title = noteTitle(note.title)
    return (
      <CrmTableRow
        key={note.id}
        open={note.id === openId}
        label={title}
        tick={
          trash
            ? null
            : { shown: massSelect, ticked: selection.selected.has(note.id), onToggle: () => selection.toggle(note.id) }
        }
        onOpen={() => actions.openNote(note.id)}
        buttons={trash ? [{ label: `Restore ${title}`, icon: <Undo2Icon className="size-4" />, onPress: () => restore(note) }] : undefined}
        onDelete={() => (trash ? setForGood(note) : toTrash(note))}
        onRightClick={(x, y) => setRightClick({ id: note.id, x, y })}
      >
        <MainCell name={title}>
          {isImporting(note.importStatus) || isAnalysing(note.analyseStatus) ? (
            <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Working on it" />
          ) : null}
        </MainCell>
        <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
          <SourceMark source={note.source} />
        </TableCell>
        <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
          <PriorityChip priority={note.priority} />
        </TableCell>
        <TableCell column="mutedMeta" className="hidden tabular-nums @lg:table-cell">
          {/* "How long ago" is worked out again when the page wakes up, a moment
              after the server drew it, so a minute that ticked over between the
              two is expected rather than an error. */}
          <span suppressHydrationWarning>{formatShortTimeAgo(trash && note.deletedAt ? note.deletedAt : note.updatedAt)}</span>
        </TableCell>
      </CrmTableRow>
    )
  }

  const group = (key: string, label: string, notes: NoteCard[]) => (
    <React.Fragment key={key}>
      <CrmGroupRow label={label} count={notes.length} folded={folds.folded(key)} onToggle={() => folds.toggle(key)} />
      {folds.folded(key) ? null : notes.map(row)}
    </React.Fragment>
  )

  const emptyWords = filtering
    ? search.q?.trim()
      ? `No notes match "${search.q.trim()}".`
      : "No notes match."
    : trash
      ? `Trash is empty. A note moved here stays ${TRASH_DAYS} days.`
      : archived
        ? "Nothing is archived. A note's ⋮ has Archive."
        : search.author
          ? "No notes by this author here."
          : search.tab === "pinned"
            ? "Nothing is pinned. A note's ⋮ or a row's right-click has Pin."
            : "No notes yet. New note writes one or imports a link."

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<LibraryTabs page={page} search={search} actions={actions} />}
        end={<PanelReopenButton side="right" label="Show the note" />}
        selected={
          massSelect && picked.length ? (
            <NoteBulkMenu
              page={page}
              selected={picked}
              onDone={selection.clear}
              onOpen={actions.openNote}
              onLeft={(ids) => {
                if (openId && ids.includes(openId)) actions.openNote(undefined)
              }}
              onRefresh={async () => {
                await actions.refreshAll()
                if (openId && picked.some((note) => note.id === openId)) onOpenedElsewhere()
              }}
            />
          ) : null
        }
        search={{
          name: "note-search",
          label: "Search notes",
          placeholder: "Search notes",
          value: search.q ?? "",
          onChange: (text) => actions.setSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={trash ? null : { on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <NoteFilterMenu
            page={page}
            filters={filters}
            show={search.show}
            onShow={(show) => actions.setSearch({ show })}
            onChange={(next) =>
              actions.setSearch({
                view: undefined,
                source: next.source,
                priority: next.priority,
                tag: next.tag,
                author: next.author,
                analysed: next.analysed,
                progress: next.progress,
              })
            }
            onSaved={async (view) => {
              await actions.refreshPage()
              actions.setSearch({ view: view.id })
            }}
          />
        }
        view={
          <ViewsMenu
            views={page.views}
            page={page}
            activeId={search.view}
            onOpen={(view) =>
              actions.setSearch({
                view: view.id,
                source: view.filters.source,
                priority: view.filters.priority,
                tag: view.filters.tag,
                author: view.filters.author,
                analysed: view.filters.analysed,
                progress: view.filters.progress,
              })
            }
            onDeleted={async (view) => {
              await actions.refreshPage()
              if (search.view === view.id) actions.setSearch({ view: undefined })
            }}
          />
        }
        primary={
          trash || archived ? null : (
            <NewNoteDropdown
              page={page}
              onMade={async (note) => {
                await actions.refreshAll()
                actions.openNote(note.id)
              }}
              onImported={async (note) => {
                await actions.refreshAll()
                actions.openNote(note.id)
              }}
            />
          )
        }
        menuLabel="More for Trash"
        menuItems={
          trash
            ? [
                {
                  label: "Empty trash",
                  icon: <Trash2Icon className="size-4" />,
                  onClick: () => {
                    if (!list.notes.length) {
                      showErrorToast("Trash is already empty.")
                      return
                    }
                    setEmptying(true)
                  },
                },
              ]
            : undefined
        }
      />
      {loading ? (
        <p className="sr-only" role="status">
          Loading the notes
        </p>
      ) : null}
      <CrmTable<NoteSortColumn>
        columns={columns}
        sort={sort.column}
        direction={sort.descending ? "desc" : "asc"}
        onSort={sortBy}
        select={
          massSelect && !trash
            ? {
                noun: "notes",
                disabled: visibleIds.length === 0,
                checked: selection.selectAllState(visibleIds),
                onToggle: () => selection.toggleVisible(visibleIds),
              }
            : null
        }
        empty={
          failed ? (
            <ErrorRow message="These notes could not be loaded." onRetry={onRetry} />
          ) : list.notes.length ? null : filtering ? (
            <span className="grid justify-items-center gap-2">
              {emptyWords}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  actions.setSearch({
                    q: undefined,
                    view: undefined,
                    source: undefined,
                    priority: undefined,
                    tag: undefined,
                    author: undefined,
                    analysed: undefined,
                    progress: undefined,
                  })
                }
              >
                Clear filters
              </Button>
            </span>
          ) : (
            emptyWords
          )
        }
        after={
          list.more ? (
            <p className="px-6 py-3 text-sm text-muted-foreground">
              Only the newest {NOTES_LIST_MAX.toLocaleString()} show. Search, or pick a folder, to find the rest.
            </p>
          ) : null
        }
      >
        {failed ? null : pinned.length ? (
          <>
            {group("pinned", "Pinned", pinned)}
            {rest.length ? group("notes", "Notes", rest) : null}
          </>
        ) : (
          rest.map(row)
        )}
      </CrmTable>

      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={trash ? null : { on: massSelect, onToggle: () => toggleMassSelect(massSelect ? undefined : rightClick.id) }}
          items={rowMenuItems(rightClick.id)}
          onClose={() => setRightClick(null)}
        />
      ) : null}

      <ConfirmDialog
        open={forGood !== null}
        onOpenChange={(next) => {
          if (!next) setForGood(null)
        }}
        title={forGood ? `Delete ${quoteOneLine(noteTitle(forGood.title))} for good?` : "Delete this note for good?"}
        description="It cannot be brought back, and its earlier copies and saved video go with it."
        confirmLabel="Delete for good"
        loading={busy}
        onConfirm={() => {
          const note = forGood
          if (!note) return
          void act(async () => {
            await deleteNoteNow(note.id)
            setForGood(null)
            actions.gone(note.id)
            if (note.id === openId) actions.openNote(undefined)
          })
        }}
      />
      <ConfirmDialog
        open={emptying}
        onOpenChange={setEmptying}
        title="Empty Trash?"
        description={`The ${list.notes.length.toLocaleString()} ${plural(list.notes.length, "note")} in Trash go for good, with their earlier copies and saved videos.`}
        confirmLabel="Empty trash"
        loading={busy}
        onConfirm={() =>
          void act(async () => {
            await emptyLibraryTrash(page.library.id)
            setEmptying(false)
            if (openId) actions.openNote(undefined)
            await actions.refreshAll()
          })
        }
      />
    </div>
  )
}

/**
 * The Priority column: every priority as a chip, Normal included, as Project
 * draws its List. High keeps its arrow and full colour; Normal and Low are
 * muted, Low with its down arrow. The word is always there, so the colour is
 * never the only sign.
 */
export function PriorityChip({ priority }: { priority: NotePriority }) {
  return (
    <Badge variant="outline" className={priority === "high" ? undefined : "text-muted-foreground"}>
      {priority === "high" ? <ArrowUpIcon aria-hidden /> : priority === "low" ? <ArrowDownIcon aria-hidden /> : null}
      {PRIORITY_LABEL[priority]}
    </Badge>
  )
}
