import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { FieldsDialog } from "@/components/note-notes/fields-dialog"
import { MoveNotesDialog } from "@/components/note-notes/move-dialog"
import { NotePanel } from "@/components/note-notes/note-panel"
import { NotesFoldersPanel } from "@/components/note-notes/notes-folders-panel"
import { BUILT_IN_VIEW, NotesListPanel } from "@/components/note-notes/notes-list-panel"
import { TemplatesDialog } from "@/components/note-notes/templates-dialog"
import { ThreePanels } from "@/components/note-notes/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  archiveNoteIds,
  createNoteIn,
  deleteNoteNow,
  emptyNotesTrash,
  getNotesErrorMessage,
  loadNotes,
  loadRecentNotes,
  pinNoteIds,
  restoreNoteFromTrash,
  saveFieldOnNotes,
  saveNoteField,
  trashNoteIds,
} from "@/lib/api/note/notes"
import {
  createNoteView,
  deleteNoteView,
  loadNoteFolders,
  reorderNoteViews,
  restoreNotesFolder,
  updateNoteView,
} from "@/lib/api/note/notes-folders"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { markdownToNote } from "@/lib/note/notes/markdown"
import {
  isFixedScope,
  noteTitle,
  TRASH_DAYS,
  type NoteCard,
  type NoteFolder,
  type NoteFolderTree,
  type NoteList,
  type NoteScope,
} from "@/lib/note/notes/notes"
import { folderPath } from "@/lib/note/notes/tree"
import type { NoteView } from "@/lib/note/notes/views"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The notes dashboard at `/notes`: folders on the left, the notes in the
 * middle as a list, a table or a board, and the open note on the right.
 * The folder, the view and the open note live in the address (`?folder=`,
 * `?view=`, `?open=`), so a reload and a bell reminder come back to the same
 * place. Open to every signed-in member; each sees only their own notes.
 */

type NotesPageData = {
  tree: NoteFolderTree
  list: NoteList
  recent: NoteCard[]
  /** The scope the first list was read for. */
  scope: NoteScope
}

const SEARCH_DELAY_MS = 300

type ListState = {
  /** The scope, search and reload this list answers. */
  answers: string
  list: NoteList
  failure: string | null
}

type ImportReport = { made: number; problems: { file: string; lines: string[] }[] }

export function NotesPage({
  initial,
  scope: askedScope,
  viewId: askedView,
  open,
}: {
  initial: NotesPageData
  scope: NoteScope
  viewId: string | undefined
  open: string | undefined
}) {
  const navigate = useNavigate({ from: "/notes" })

  const [loaded, setLoaded] = React.useState(initial)
  const [tree, setTree] = React.useState(initial.tree)
  const [recent, setRecent] = React.useState(initial.recent)
  const [state, setState] = React.useState<ListState>(() => fromInitial(initial))
  if (loaded !== initial) {
    setLoaded(initial)
    setTree(initial.tree)
    setRecent(initial.recent)
    setState(fromInitial(initial))
  }

  // A folder that is gone reads as All notes.
  const scope: NoteScope =
    isFixedScope(askedScope) || tree.folders.some((folder) => folder.id === askedScope) ? askedScope : "all"
  const folder: NoteFolder | null = tree.folders.find((each) => each.id === scope) ?? null
  const viewId = folder?.views.some((view) => view.id === askedView) ? (askedView as string) : BUILT_IN_VIEW
  const pickedId = open ?? null

  const [query, setQuery] = React.useState("")
  const [applied, setApplied] = React.useState("")
  React.useEffect(() => {
    const timer = setTimeout(() => setApplied(query.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  const selection = useSelection()
  const [selectedFor, setSelectedFor] = React.useState(scope)
  if (selectedFor !== scope) {
    setSelectedFor(scope)
    selection.clear()
  }

  const [reloads, setReloads] = React.useState(0)
  const [picks, setPicks] = React.useState(0)
  const [panelReloads, setPanelReloads] = React.useState(0)
  const [creating, setCreating] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [fieldsFolder, setFieldsFolder] = React.useState<string | null>(null)
  const [templatesFolder, setTemplatesFolder] = React.useState<string | null>(null)
  const [moving, setMoving] = React.useState<{ ids: string[]; from: string | null | undefined }>({ ids: [], from: undefined })
  const [emptyingTrash, setEmptyingTrash] = React.useState(false)
  const [deletingNote, setDeletingNote] = React.useState<NoteCard | null>(null)
  const [deletingView, setDeletingView] = React.useState<NoteView | null>(null)
  const [confirmBusy, setConfirmBusy] = React.useState(false)
  const [importFolder, setImportFolder] = React.useState<NoteFolder | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [importReport, setImportReport] = React.useState<ImportReport | null>(null)
  const importInput = React.useRef<HTMLInputElement>(null)

  const setAddress = React.useCallback(
    (next: { folder?: NoteScope; view?: string | null; open?: string | null }) => {
      void navigate({
        search: (previous) => ({
          ...previous,
          ...("folder" in next ? { folder: next.folder === "all" ? undefined : next.folder, view: undefined } : {}),
          ...("view" in next ? { view: next.view && next.view !== BUILT_IN_VIEW ? next.view : undefined } : {}),
          ...("open" in next ? { open: next.open ?? undefined } : {}),
        }),
        replace: true,
        resetScroll: false,
      })
    },
    [navigate]
  )

  const refreshTree = React.useCallback(async () => {
    try {
      setTree(await loadNoteFolders())
    } catch {
      // The counts are a nicety; the notes on screen are already right.
    }
  }, [])

  const refreshRecent = React.useCallback(() => {
    loadRecentNotes()
      .then(setRecent)
      .catch(() => undefined)
  }, [])

  // A new scope, search or reload asks the server again. Only the newest ask
  // may touch the screen.
  const listScope = scope
  const wanted = `${listScope}|${applied}|${reloads}`
  const askVersion = React.useRef(0)
  React.useEffect(() => {
    const version = ++askVersion.current
    if (state.answers === wanted) return
    loadNotes({ scope: listScope, search: applied || undefined })
      .then((list) => {
        if (version === askVersion.current) setState({ answers: wanted, list, failure: null })
      })
      .catch((error) => {
        if (version === askVersion.current) {
          setState((current) => ({ ...current, answers: wanted, failure: getNotesErrorMessage(error) }))
        }
      })
  }, [state.answers, wanted, listScope, applied])
  const loading = state.answers !== wanted

  const list: NoteList = state.list

  /** A card changed in the right panel or a button: keep it, or drop it if it left this scope. */
  const patchCard = React.useCallback(
    (card: NoteCard) => {
      // Recently opened shows the same note under its new title or icon.
      setRecent((current) => current.map((note) => (note.id === card.id ? card : note)))
      setState((current) => {
        const stays = belongs(card, scope, Boolean(applied))
        const notes = current.list.notes
        const next = stays ? notes.map((note) => (note.id === card.id ? card : note)) : notes.filter((note) => note.id !== card.id)
        return { ...current, list: { ...current.list, notes: next } }
      })
    },
    [scope, applied]
  )

  function dropFromList(ids: string[]) {
    setState((current) => ({
      ...current,
      list: { ...current.list, notes: current.list.notes.filter((note) => !ids.includes(note.id)) },
    }))
  }

  function openNote(id: string) {
    setPicks((count) => count + 1)
    setAddress({ open: id })
  }

  async function newNote(templateId: string | null) {
    setCreating(true)
    dismissErrorToast()
    try {
      const detail = await createNoteIn({ folderId: folder?.id ?? null, templateId })
      setState((current) => ({
        ...current,
        list: { ...current.list, notes: belongs(detail, scope) ? [detail, ...current.list.notes] : current.list.notes },
      }))
      setQuery("")
      openNote(detail.id)
      void refreshTree()
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  async function bulk(
    work: () => Promise<{ done: string[]; skipped: string[] }>,
    words: { verb: string; keptReason?: string },
    after: (done: string[]) => void
  ) {
    setBulkBusy(true)
    dismissErrorToast()
    try {
      const result = await work()
      toast.success(
        describeBulkResult({
          done: result.done.length,
          kept: result.skipped.length,
          one: "note",
          many: "notes",
          verb: words.verb,
          keptReason: words.keptReason,
        })
      )
      after(result.done)
      selection.clear()
      void refreshTree()
      return true
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
      return false
    } finally {
      setBulkBusy(false)
    }
  }

  async function viewChange(work: () => Promise<unknown>, success: string) {
    dismissErrorToast()
    try {
      await work()
      await refreshTree()
      toast.success(success)
      return true
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
      return false
    }
  }

  async function importFiles(files: File[]) {
    const into = importFolder
    if (!into || !files.length) return
    setImporting(true)
    dismissErrorToast()
    const report: ImportReport = { made: 0, problems: [] }
    try {
      for (const file of files) {
        const text = await file.text()
        const note = markdownToNote(file.name, text, into.fields)
        try {
          await createNoteIn({ folderId: into.id, title: note.title, body: note.body, values: note.values })
          report.made += 1
          if (note.problems.length) report.problems.push({ file: file.name, lines: note.problems })
        } catch (error) {
          report.problems.push({ file: file.name, lines: [`Not imported: ${getNotesErrorMessage(error)}`] })
        }
      }
    } finally {
      setImporting(false)
      setImportFolder(null)
    }
    await refreshTree()
    setReloads((count) => count + 1)
    if (report.problems.length) setImportReport(report)
    else toast.success(`Imported ${report.made} ${plural(report.made, "note")} into “${into.name}”.`)
  }

  const title =
    scope === "all"
      ? "All notes"
      : scope === "loose"
        ? "Loose notes"
        : scope === "archived"
          ? "Archived"
          : scope === "trash"
            ? "Trash"
            : folder
              ? folder.name
              : "All notes"

  const views = folder?.views ?? []

  return (
    <>
      <ThreePanels
        showRightFor={pickedId ? `${pickedId}:${picks}` : undefined}
        left={{
          label: "Folders",
          showLabel: "Show folders",
          content: (
            <NotesFoldersPanel
              tree={tree}
              recent={recent}
              scope={scope}
              openId={pickedId}
              actions={{
                onPick: (next) => setAddress({ folder: next }),
                onOpenNote: openNote,
                onTreeChanged: setTree,
                onFields: (each) => setFieldsFolder(each.id),
                onTemplates: (each) => setTemplatesFolder(each.id),
                onImport: (each) => {
                  setImportFolder(each)
                  importInput.current?.click()
                },
                onTrashed: (folderIds, fresh) => {
                  setTree(fresh)
                  if (folderIds.has(scope)) setAddress({ folder: "all" })
                  setReloads((count) => count + 1)
                },
              }}
            />
          ),
        }}
        middle={{
          label: "Notes",
          content: (
            <NotesListPanel
              title={title}
              scope={scope}
              folder={folder}
              list={list}
              loading={loading}
              failure={loading ? null : state.failure}
              onRetry={() => setReloads((count) => count + 1)}
              query={query}
              onQuery={setQuery}
              pickedId={pickedId}
              viewId={viewId}
              selection={selection}
              creating={creating}
              bulkBusy={bulkBusy}
              actions={{
                onPick: (note) => openNote(note.id),
                onNewNote: (templateId) => void newNote(templateId),
                onRestoreFolder: (folderId) =>
                  void restoreNotesFolder(folderId)
                    .then((fresh) => {
                      setTree(fresh)
                      setReloads((count) => count + 1)
                      toast.success("Restored the folder with everything that went with it.")
                    })
                    .catch((error) => showErrorToast(getNotesErrorMessage(error))),
                onEmptyTrash: () => setEmptyingTrash(true),
                onRestoreNote: (note) =>
                  void restoreNoteFromTrash(note.id)
                    .then((card) => {
                      dropFromList([note.id])
                      void refreshTree()
                      toast.success(
                        card.folderId
                          ? `Restored “${noteTitle(note.title)}” to ${folderPath(tree.folders, card.folderId) || "its folder"}.`
                          : `Restored “${noteTitle(note.title)}” as a loose note, because its folder is gone.`
                      )
                    })
                    .catch((error) => showErrorToast(getNotesErrorMessage(error))),
                onDeleteNote: setDeletingNote,
                onMove: (ids) => setMoving({ ids, from: folder ? folder.id : undefined }),
                onPin: (ids, pinned) =>
                  void bulk(() => pinNoteIds(ids, pinned), { verb: pinned ? "pinned" : "unpinned", keptReason: `already ${pinned ? "pinned" : "unpinned"}` }, (done) =>
                    setState((current) => ({
                      ...current,
                      list: { ...current.list, notes: current.list.notes.map((note) => (done.includes(note.id) ? { ...note, pinned } : note)) },
                    }))
                  ),
                onArchive: (ids, archived) =>
                  void bulk(() => archiveNoteIds(ids, archived), { verb: archived ? "archived" : "unarchived", keptReason: `already ${archived ? "archived" : "unarchived"}` }, (done) =>
                    dropFromList(done)
                  ),
                onTrash: (ids) =>
                  void bulk(() => trashNoteIds(ids), { verb: "moved to Trash" }, (done) => {
                    dropFromList(done)
                    if (pickedId && done.includes(pickedId)) setAddress({ open: null })
                  }),
                onSetField: (ids, field, value) =>
                  bulk(() => saveFieldOnNotes(ids, field.key, value), { verb: "changed", keptReason: "not in this folder" }, () =>
                    setReloads((count) => count + 1)
                  ),
                onBoardMove: async (note, field, optionId) => {
                  dismissErrorToast()
                  try {
                    patchCard(await saveNoteField(note.id, field.key, optionId))
                    return true
                  } catch (error) {
                    showErrorToast(getNotesErrorMessage(error))
                    return false
                  }
                },
                onFields: (each) => setFieldsFolder(each.id),
                onViewId: (next) => setAddress({ view: next }),
                onSaveView: (view, kind, settings) =>
                  viewChange(() => updateNoteView(view.id, { kind, settings }), `Saved “${view.name}”.`),
                onSaveViewAs: async (name, kind, settings) => {
                  if (!folder) return false
                  const made: { view: NoteView | null } = { view: null }
                  const ok = await viewChange(async () => {
                    made.view = await createNoteView({ folderId: folder.id, name, kind, settings })
                  }, `Saved “${name.trim()}” as a view.`)
                  if (ok && made.view) setAddress({ view: made.view.id })
                  return ok
                },
                onRenameView: (view, name) => viewChange(() => updateNoteView(view.id, { name }), `Renamed to “${name.trim()}”.`),
                onMoveView: (view, by) => {
                  if (!folder) return
                  const at = views.findIndex((each) => each.id === view.id)
                  const to = at + by
                  if (to < 0 || to >= views.length) return
                  const order = views.map((each) => each.id)
                  order.splice(at, 1)
                  order.splice(to, 0, view.id)
                  void viewChange(() => reorderNoteViews(folder.id, order), "Moved the view.")
                },
                onDeleteView: setDeletingView,
              }}
            />
          ),
        }}
        right={{
          label: "Note",
          showLabel: "Show the note",
          content: (
            <NotePanel
              noteId={pickedId}
              reloadKey={panelReloads}
              folders={tree.folders}
              actions={{
                onCardChanged: patchCard,
                onOpenNote: openNote,
                onClose: () => setAddress({ open: null }),
                onMove: (ids, from) => setMoving({ ids, from }),
                onGone: (id) => {
                  dropFromList([id])
                  void refreshTree()
                  refreshRecent()
                },
                onTreeChanged: refreshTree,
                onOpened: refreshRecent,
              }}
            />
          ),
        }}
      />

      <input
        ref={importInput}
        type="file"
        accept=".md,.markdown,text/markdown"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          void importFiles(files)
        }}
      />
      {importing ? (
        <div role="status" className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
          <Loader2Icon className="size-4 animate-spin" />
          Importing…
        </div>
      ) : null}

      <FieldsDialog
        folder={tree.folders.find((each) => each.id === fieldsFolder) ?? null}
        onClose={() => setFieldsFolder(null)}
        onChanged={async () => {
          await refreshTree()
          setReloads((count) => count + 1)
        }}
      />
      <TemplatesDialog
        folder={tree.folders.find((each) => each.id === templatesFolder) ?? null}
        onClose={() => setTemplatesFolder(null)}
        onChanged={refreshTree}
      />
      <MoveNotesDialog
        noteIds={moving.ids}
        folders={tree.folders}
        fromFolderId={moving.from}
        onClose={() => setMoving({ ids: [], from: undefined })}
        onMoved={(_folderId, done) => {
          setMoving({ ids: [], from: undefined })
          selection.clear()
          setReloads((count) => count + 1)
          void refreshTree()
          if (pickedId && done.includes(pickedId)) setPanelReloads((count) => count + 1)
        }}
      />
      <ConfirmDialog
        open={emptyingTrash}
        onOpenChange={setEmptyingTrash}
        title="Empty Trash?"
        description={`Everything in Trash is deleted for good now, instead of ${TRASH_DAYS} days after it went there. It cannot be brought back.`}
        confirmLabel="Empty trash"
        loading={confirmBusy}
        onConfirm={() => {
          setConfirmBusy(true)
          void emptyNotesTrash()
            .then((result) => {
              setEmptyingTrash(false)
              setReloads((count) => count + 1)
              void refreshTree()
              toast.success(
                `Deleted ${result.notes} ${plural(result.notes, "note")}${result.folders ? ` and ${result.folders} ${plural(result.folders, "folder")}` : ""} for good.`
              )
            })
            .catch((error) => showErrorToast(getNotesErrorMessage(error)))
            .finally(() => setConfirmBusy(false))
        }}
      />
      <ConfirmDialog
        open={deletingNote !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingNote(null)
        }}
        title={`Delete “${noteTitle(deletingNote?.title ?? "")}” for good?`}
        description="It cannot be brought back, and its earlier copies go with it."
        confirmLabel="Delete for good"
        loading={confirmBusy}
        onConfirm={() => {
          if (!deletingNote) return
          const note = deletingNote
          setConfirmBusy(true)
          void deleteNoteNow(note.id)
            .then(() => {
              setDeletingNote(null)
              dropFromList([note.id])
              void refreshTree()
              if (pickedId === note.id) setAddress({ open: null })
              toast.success(`Deleted “${noteTitle(note.title)}” for good.`)
            })
            .catch((error) => showErrorToast(getNotesErrorMessage(error)))
            .finally(() => setConfirmBusy(false))
        }}
      />
      <ConfirmDialog
        open={deletingView !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingView(null)
        }}
        title={`Delete the “${deletingView?.name ?? ""}” view?`}
        description="Only the saved filters, sort and layout go. Every note stays."
        confirmLabel="Delete view"
        loading={confirmBusy}
        onConfirm={() => {
          if (!deletingView) return
          const view = deletingView
          setConfirmBusy(true)
          void viewChange(() => deleteNoteView(view.id), `Deleted the “${view.name}” view.`)
            .then((ok) => {
              if (!ok) return
              setDeletingView(null)
              setAddress({ view: null })
            })
            .finally(() => setConfirmBusy(false))
        }}
      />
      <Dialog open={importReport !== null} onOpenChange={(next) => !next && setImportReport(null)}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Imported {importReport?.made ?? 0} {plural(importReport?.made ?? 0, "note")}
            </DialogTitle>
            <DialogDescription>Some lines at the top of the files did not become field values. Nothing else was lost.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="grid gap-3">
              {importReport?.problems.map((problem) => (
                <li key={problem.file} className="grid gap-1">
                  <span className="text-sm font-medium">{problem.file}</span>
                  <ul className="grid list-disc gap-0.5 pl-5 text-sm text-muted-foreground">
                    {problem.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button type="button" size="lg" onClick={() => setImportReport(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function fromInitial(data: NotesPageData): ListState {
  return { answers: `${data.scope}||0`, list: data.list, failure: null }
}

/**
 * Whether a note belongs on the list for this scope, after a change to it. A
 * search shows archived notes too, so a change never drops one from it.
 */
function belongs(card: NoteCard, scope: NoteScope, searching = false) {
  if (scope === "trash") return card.deletedAt !== null
  if (card.deletedAt) return false
  if (scope === "archived") return card.archived
  if (card.archived && !searching) return false
  if (scope === "all") return true
  if (scope === "loose") return card.folderId === null
  return card.folderId === scope
}
