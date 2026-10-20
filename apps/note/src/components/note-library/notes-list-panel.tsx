import * as React from "react"
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  FolderIcon,
  LibraryIcon,
  Loader2Icon,
  PinIcon,
  Trash2Icon,
  Undo2Icon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import type { DashboardActions } from "@/components/note-library/library-dashboard"
import { SourceMark } from "@/components/note-library/library-dot"
import { ImportDropdown } from "@/components/note-library/import-dropdown"
import { NewNoteDropdown } from "@/components/note-library/new-note-dropdown"
import { NoteBulkMenu } from "@/components/note-library/note-bulk-menu"
import { NoteFilterMenu, ViewsMenu } from "@/components/note-library/note-filter-menu"
import { NoteRowMenu } from "@/components/note-library/note-row-menu"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { MassSelectChip } from "@/components/shared/mass-select"
import { SearchToggle } from "@/components/shared/search-toggle"
import { SelectAllTableHead } from "@/components/shared/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableGroupRow, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { changeNotes, deleteNoteNow, emptyLibraryTrash, restoreNoteFromTrash } from "@/lib/api/note/notes"
import { formatShortTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSearchBoxText } from "@/lib/nav/list-search"
import { filtersOf, type LibrarySearch } from "@/lib/note/library/address"
import {
  FILTER_KEYS,
  isImporting,
  isAnalysing,
  NOTES_LIST_MAX,
  noteTitle,
  PRIORITY_LABEL,
  TRASH_DAYS,
  type LibraryPage,
  type NoteCard,
  type NoteList,
  type NotePriority,
} from "@/lib/note/library/notes"
import { useSelection } from "@/lib/hooks/use-selection"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The middle panel, as Tyler drew it on 20 Oct 2026: what is showing and how
 * many, then the toolbar (the "N selected" button while rows are ticked,
 * search, Filter, Views, Import, New note), then the notes as one table,
 * Pinned first and the rest under Notes. Its columns are the fixed fields:
 * Note (the title and tags), Source, Priority, Folder and Edited, then the
 * row's cog and bin. Pressing a row opens the note on the right.
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
  const scope = search.folder ?? "all"
  const trash = scope === "trash"
  const archived = scope === "archived"
  const filters = filtersOf(search)
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (text) =>
    actions.setSearch({ q: text.trim() ? text : undefined })
  )

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  useClearSelectionOnListChange(selection.setSelected, JSON.stringify({ scope, q: search.q, filters }))
  const visibleIds = list.notes.map((note) => note.id)
  const picked = list.notes.filter((note) => selection.selected.has(note.id))
  const toggleMassSelect = () => {
    if (massSelect) selection.clear()
    setMassSelect(!massSelect)
  }

  const [busy, setBusy] = React.useState(false)
  const [forGood, setForGood] = React.useState<NoteCard | null>(null)
  const [emptying, setEmptying] = React.useState(false)

  async function act(work: () => Promise<unknown>, success: string) {
    setBusy(true)
    dismissErrorToast()
    try {
      await work()
      toast.success(success)
      return true
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  const folder = page.folders.find((each) => each.id === scope)
  const title = search.author
    ? search.author
    : scope === "all"
      ? "All notes"
      : scope === "loose"
        ? "Loose notes"
        : archived
          ? "Archived"
          : trash
            ? "Trash"
            : (folder?.name ?? "Folder")
  const icon = search.author ? (
    <UserRoundIcon className="size-4" />
  ) : trash ? (
    <Trash2Icon className="size-4" />
  ) : archived ? (
    <ArchiveIcon className="size-4" />
  ) : folder ? (
    <FolderIcon className="size-4" />
  ) : (
    <LibraryIcon className="size-4" />
  )

  const pinned = list.notes.filter((note) => note.pinned)
  const rest = list.notes.filter((note) => !note.pinned)
  const grouped = !trash && pinned.length > 0
  const columns = 7 + (massSelect ? 1 : 0)
  const filtering = Boolean(search.q) || FILTER_KEYS.some((key) => filters[key] !== undefined)

  const rowChanged = async (note: NoteCard) => {
    await actions.refreshAll()
    if (note.id === openId) onOpenedElsewhere()
  }

  const row = (note: NoteCard) => (
    <TableRow
      key={note.id}
      className={cn(
        "group",
        // The open note carries a dark bar down its left edge, as in Tyler's
        // picture; drawn on the first cell, since a table row draws no border of its own.
        note.id === openId && "bg-muted/60 [&>td:first-child]:shadow-[inset_2px_0_0_var(--color-foreground)]"
      )}
      rowAction={() => actions.openNote(note.id)}
    >
      {massSelect ? (
        <TableCell column="select">
          <Checkbox
            checked={selection.selected.has(note.id)}
            onCheckedChange={() => selection.toggle(note.id)}
            aria-label={`Select ${noteTitle(note.title)}`}
          />
        </TableCell>
      ) : null}
      <TableCell column="main" className="min-w-48">
        <div className="grid min-w-0 gap-1">
          {/* The same action the row carries, so it is reachable by keyboard. */}
          <button
            type="button"
            className="flex max-w-96 min-w-0 items-center gap-1.5 text-left font-medium group-hover:underline"
            onClick={() => actions.openNote(note.id)}
          >
            {note.pinned ? <PinIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" /> : null}
            {isImporting(note.importStatus) || isAnalysing(note.analyseStatus) ? (
              <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Working on it" />
            ) : null}
            <span className="truncate">{noteTitle(note.title)}</span>
          </button>
        </div>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden @xl/list:table-cell">
        <SourceMark source={note.source} />
      </TableCell>
      <TableCell column="meta" className="hidden @2xl/list:table-cell">
        <PriorityChip priority={note.priority} />
      </TableCell>
      <TableCell column="meta" className="hidden @4xl/list:table-cell">
        <Badge variant="outline" className={cn("max-w-40", !note.folderName && "text-muted-foreground")}>
          <span className="truncate">{note.folderName ?? "No folder"}</span>
        </Badge>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden tabular-nums @lg/list:table-cell">
        <Badge variant="outline" className="text-muted-foreground">
          {/* "How long ago" is worked out again when the page wakes up, a moment
              after the server drew it, so a minute that ticked over between the
              two is expected rather than an error. */}
          <span suppressHydrationWarning>
            {formatShortTimeAgo(trash && note.deletedAt ? note.deletedAt : note.updatedAt)}
          </span>
        </Badge>
      </TableCell>
      <TableCell column="actions">
        {trash ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Restore ${noteTitle(note.title)}`}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await restoreNoteFromTrash(note.id)
                  actions.gone(note.id)
                }, `Restored ${quoteOneLine(noteTitle(note.title))}.`)
              }
            >
              <Undo2Icon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${noteTitle(note.title)} for good`}
              onClick={() => setForGood(note)}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <NoteRowMenu
              note={note}
              page={page}
              onChanged={() => rowChanged(note)}
              onMovedAway={() => {
                actions.gone(note.id)
                if (note.id === openId) actions.openNote(undefined)
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${noteTitle(note.title)} to Trash`}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await changeNotes([note.id], { change: "trash" })
                  actions.gone(note.id)
                  if (note.id === openId) actions.openNote(undefined)
                }, `Moved ${quoteOneLine(noteTitle(note.title))} to Trash. It stays there ${TRASH_DAYS} days.`)
              }
            >
              <Trash2Icon className="size-4" />
            </Button>
          </>
        )}
      </TableCell>
    </TableRow>
  )

  return (
    <div className="@container/list flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        className="@container"
        icon={loading ? <Loader2Icon className="size-4 animate-spin" aria-label="Loading" /> : icon}
        title={title}
        meta={`${list.notes.length.toLocaleString()}${list.more ? "+" : ""} ${plural(list.notes.length, "note")}`}
        action={
          <div className="flex items-center gap-1">
            {massSelect && picked.length ? (
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
            ) : null}
            <SearchToggle
              name="note-search"
              label="Search notes"
              placeholder="Search notes"
              value={searchText}
              onChange={setSearchText}
            />
            <NoteFilterMenu
              page={page}
              filters={filters}
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
            {trash ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => {
                  if (!list.notes.length) {
                    showErrorToast("Trash is already empty.")
                    return
                  }
                  setEmptying(true)
                }}
              >
                <Trash2Icon className="size-4" />
                <span className="@max-3xl:sr-only">Empty trash</span>
              </DashboardToolbarButton>
            ) : archived ? null : (
              <>
                <ImportDropdown
                  libraryId={page.library.id}
                  onImported={async (note) => {
                    await actions.refreshAll()
                    actions.openNote(note.id)
                  }}
                />
                <NewNoteDropdown
                  page={page}
                  folderId={folder?.id ?? null}
                  onMade={async (note) => {
                    await actions.refreshAll()
                    actions.openNote(note.id)
                  }}
                />
              </>
            )}
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <Table
          containerClassName="overflow-visible"
          className="[&_td]:py-1.5 [&_td:first-child]:pl-4 [&_td:last-child]:pr-3 [&_th:first-child]:pl-4 [&_th:last-child]:pr-3"
        >
          <TableHeader>
            <TableRow>
              {massSelect ? (
                <SelectAllTableHead
                  noun="notes"
                  disabled={visibleIds.length === 0}
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                />
              ) : null}
              <TableHead column="main" className="group/title min-w-48">
                <span className="flex items-center gap-2">
                  Note
                  {trash ? null : <MassSelectChip on={massSelect} onToggle={toggleMassSelect} />}
                </span>
              </TableHead>
              <TableHead column="meta" className="hidden @xl/list:table-cell">
                Source
              </TableHead>
              <TableHead column="meta" className="hidden @2xl/list:table-cell">
                Priority
              </TableHead>
              <TableHead column="meta" className="hidden @4xl/list:table-cell">
                Folder
              </TableHead>
              <TableHead column="meta" className="hidden @lg/list:table-cell">
                {trash ? "Trashed" : "Edited"}
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {failed ? (
              <TableRow>
                <TableCell colSpan={columns}>
                  <ErrorRow message="These notes could not be loaded." onRetry={onRetry} />
                </TableCell>
              </TableRow>
            ) : list.notes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns} className="py-10 text-center text-sm text-muted-foreground">
                  {filtering
                    ? "No note matches that."
                    : trash
                      ? `Trash is empty. A note moved here stays ${TRASH_DAYS} days.`
                      : archived
                        ? "Nothing is archived. A note's menu has Archive."
                        : search.author
                          ? "No notes by this author here."
                          : scope === "all"
                            ? "No notes yet. Write one with New note or bring one in with Import."
                            : "No notes here yet."}
                </TableCell>
              </TableRow>
            ) : grouped ? (
              <>
                <TableGroupRow colSpan={columns} label="Pinned">
                  <span className="text-muted-foreground tabular-nums">{pinned.length}</span>
                </TableGroupRow>
                {pinned.map(row)}
                {rest.length ? (
                  <TableGroupRow colSpan={columns} label="Notes">
                    <span className="text-muted-foreground tabular-nums">{rest.length}</span>
                  </TableGroupRow>
                ) : null}
                {rest.map(row)}
              </>
            ) : (
              list.notes.map(row)
            )}
          </TableBody>
        </Table>
        {list.more ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Only the newest {NOTES_LIST_MAX.toLocaleString()} show. Search, or pick a folder, to find the rest.
          </p>
        ) : null}
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

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
          }, `Deleted ${quoteOneLine(noteTitle(note.title))} for good.`)
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
            const { notes } = await emptyLibraryTrash(page.library.id)
            setEmptying(false)
            if (openId) actions.openNote(undefined)
            await actions.refreshAll()
            return notes
          }, "Trash is empty.")
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
