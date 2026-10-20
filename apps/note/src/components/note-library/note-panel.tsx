import * as React from "react"
import type { JSONContent } from "@tiptap/core"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  DownloadIcon,
  FileVideoIcon,
  EllipsisVerticalIcon,
  FolderIcon,
  FolderInputIcon,
  FileTextIcon,
  HistoryIcon,
  LayoutTemplateIcon,
  LibraryIcon,
  ListTreeIcon,
  Loader2Icon,
  MinusIcon,
  PencilLineIcon,
  PinIcon,
  PinOffIcon,
  TagIcon,
  Trash2Icon,
  Undo2Icon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import { AiCards, SourceCard } from "@/components/note-library/import-cards"
import type { DashboardActions, SeekRequest } from "@/components/note-library/library-dashboard"
import { LibraryDot } from "@/components/note-library/library-dot"
import { AuthorPicture } from "@/components/note-library/library-left-panel"
import { HistoryDialog } from "@/components/note-library/history-dialog"
import { NoteEditor, type NoteEditorHandle } from "@/components/note-library/note-editor"
import { usePlayerPlace } from "@/components/note-library/use-player-place"
import { ContactTagsBox } from "@/components/broadcasts/contact-tags-box"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import {
  DashboardCardHeader,
  dashboardCardHeadingClassName,
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import { SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
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
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  analyseNoteNow,
  removeNoteImport,
  retryNoteImport,
  retryNotePostVideo,
  saveNoteHighlights,
  saveNotePlan,
} from "@/lib/api/note/imports"
import { getLibraryErrorMessage, saveAsTemplate } from "@/lib/api/note/library"
import {
  changeNotes,
  deleteNoteNow,
  duplicateLibraryNote,
  loadNoteDetail,
  moveNotesToLibrary,
  restoreNoteFromTrash,
  saveNoteAuthor,
  saveNoteTags,
} from "@/lib/api/note/notes"
import { quoteOneLine } from "@/lib/format/quote-text"
import { focusRing } from "@/lib/layout/focus-ring"
import { useWideScreen } from "@/lib/layout/wide-screen"
import type { Highlight } from "@/lib/note/library/highlights"
import {
  AUTHOR_HANDLE_MAX,
  AUTHOR_NAME_MAX,
  isImportSource,
  isMoving,
  isPostSource,
  NOTE_PRIORITIES,
  NOTE_TITLE_MAX,
  noteTitle,
  PRIORITY_LABEL,
  TAGS_PER_NOTE,
  TEMPLATE_NAME_MAX,
  TRASH_DAYS,
  type LibraryPage,
  type NoteCard,
  type NoteDetail,
  type NotePriority,
  type PlanStep,
} from "@/lib/note/library/notes"
import { noteBodyFacts, noteHeadings, readingMinutes } from "@/lib/note/notes/body"
import { markdownFileName, noteToMarkdown } from "@/lib/note/notes/markdown"
import { forgetKeptChanges, readKeptChanges, useNoteAutosave, type NoteChanges } from "@/lib/note/notes/use-note-autosave"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** How long after each answer the panel asks again while an import or analysis is moving. */
const POLL_MS = 3000

/**
 * The right panel: the open note, as Tyler drew it on 20 Oct 2026. The
 * header holds its folder and priority, then Outline, History, the menu and
 * the ×. Under the title sit its tags, its author, its own text in the Notes
 * card, and for an import, the Video or Post card and the AI's cards.
 * Everything saves by itself.
 */
export function NotePanel({
  noteId,
  listedCard,
  reloadKey,
  seekTo,
  page,
  actions,
}: {
  noteId: string | null
  /** The note's row as the list has it now, so a change made in the middle is seen here. */
  listedCard: NoteCard | null
  /** Changes when the open note changed elsewhere on the page, so it is read again. */
  reloadKey: number
  /** A moment of this note's video to play from, asked for by the Quotes list. */
  seekTo: SeekRequest | null
  page: LibraryPage
  actions: DashboardActions
}) {
  const wide = useWideScreen()
  const [loaded, setLoaded] = React.useState<{ id: string; detail: NoteDetail; round: number } | null>(null)
  const [failure, setFailure] = React.useState<{ id: string; message: string } | null>(null)
  // A note opened again (after another, or after closing) waits for a fresh
  // read rather than showing the copy read last time, which may be behind
  // what was saved since and would start the editor on old text.
  const [shownFor, setShownFor] = React.useState(noteId)
  if (noteId !== shownFor) {
    setShownFor(noteId)
    setLoaded(null)
  }
  const [reloads, setReloads] = React.useState(0)
  // The text toolbar, shown from the header's button; kept as notes change.
  const [tools, setTools] = React.useState(false)
  const refreshPage = React.useRef(actions.refreshPage)
  React.useEffect(() => {
    refreshPage.current = actions.refreshPage
  })

  React.useEffect(() => {
    if (!noteId) return
    let live = true
    loadNoteDetail(noteId, true)
      .then((detail) => {
        if (!live) return
        setLoaded((current) => ({ id: noteId, detail, round: (current?.round ?? 0) + 1 }))
        // Recently opened and the counts move once a note is opened.
        void refreshPage.current()
      })
      .catch((error) => {
        if (live) setFailure({ id: noteId, message: getLibraryErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [noteId, reloads, reloadKey])

  const close = () => actions.openNote(undefined)
  const back = wide ? undefined : { label: "Back to the notes", onClick: close }

  if (!noteId) {
    return (
      <>
        <DashboardCardTitleHeader icon={<FileTextIcon />} title="Note" />
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Click a note to read and edit it here, or make one with New note.
        </p>
      </>
    )
  }

  const detail = loaded?.id === noteId ? loaded.detail : null
  if (!detail) {
    const failed = failure?.id === noteId ? failure.message : null
    return (
      <>
        <DashboardCardTitleHeader
          icon={<FileTextIcon />}
          back={back}
          title={listedCard?.id === noteId ? noteTitle(listedCard.title) : "Note"}
        />
        {failed ? (
          <ErrorRow
            message={failed}
            onRetry={() => {
              setFailure(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : (
          // No spinner while the note loads (Tyler, 20 Oct 2026); the panel
          // simply stays empty for the moment it takes. Read out all the same.
          <p className="sr-only" role="status">
            Loading the note
          </p>
        )}
      </>
    )
  }

  return (
    <OpenNote
      // A new copy of the text from the server (a restore, the other tab's
      // version, an import naming it) starts the editor over; typing never does.
      key={`${detail.id}:${loaded?.round}`}
      opened={detail}
      listedCard={listedCard}
      seekTo={seekTo}
      page={page}
      actions={actions}
      tools={tools}
      onTools={() => setTools((shown) => !shown)}
      onClose={close}
      onReload={(next) => setLoaded((current) => ({ id: next.id, detail: next, round: (current?.round ?? 0) + 1 }))}
    />
  )
}

function OpenNote({
  opened,
  listedCard,
  seekTo,
  page,
  actions,
  tools,
  onTools,
  onClose,
  onReload,
}: {
  opened: NoteDetail
  listedCard: NoteCard | null
  seekTo: SeekRequest | null
  page: LibraryPage
  actions: DashboardActions
  tools: boolean
  onTools: () => void
  onClose: () => void
  onReload: (detail: NoteDetail) => void
}) {
  const trashed = opened.deletedAt !== null
  const readOnly = trashed

  // Changes this browser kept from a visit whose save never landed. Read once,
  // as the note opens, and shown on screen straight away.
  const [kept] = React.useState(() => (readOnly ? null : readKeptChanges(opened.id)))
  const keptFits = kept?.revision === opened.revision
  const startWith: NoteChanges | null = kept?.changes ?? null

  const [title, setTitle] = React.useState(startWith?.title ?? opened.title)
  const [body, setBody] = React.useState<JSONContent>(startWith?.body ?? opened.body)
  const [initialBody] = React.useState<JSONContent>(startWith?.body ?? opened.body)
  // Everything but the text: the import, the AI's cards, tags, folder, priority.
  const [detail, setDetail] = React.useState<NoteDetail>(opened)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [templateOpen, setTemplateOpen] = React.useState(false)
  const [authorOpen, setAuthorOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const [deletingForGood, setDeletingForGood] = React.useState(false)
  const [resolving, setResolving] = React.useState(false)
  const editorRef = React.useRef<NoteEditorHandle>(null)
  const playerRef = React.useRef<HTMLMediaElement | null>(null)
  const setSaveStatus = useReportedSaveStatus()

  const tellCard = React.useRef(actions.cardChanged)
  React.useEffect(() => {
    tellCard.current = actions.cardChanged
  })

  const autosave = useNoteAutosave({
    noteId: opened.id,
    revision: opened.revision,
    startWith: readOnly ? null : startWith,
    startInConflict: Boolean(kept) && !keptFits,
    onSaved: ({ card }) => {
      setDetail((current) => ({ ...current, ...card }))
      tellCard.current(card)
    },
  })
  const { status } = autosave

  React.useEffect(() => {
    setSaveStatus(status === "saving" ? "saving" : status === "saved" ? "saved" : "idle")
  }, [status, setSaveStatus])

  const facts = React.useMemo(() => noteBodyFacts(body), [body])
  const headings = React.useMemo(() => noteHeadings(body), [body])
  const isImport = isImportSource(detail.source)
  const merged = detail.mergedFrom.length > 0 || (detail.source === "note" && detail.analyseStatus !== null)

  // Saves of tags, the plan and highlights still on their way, so an answer
  // read before one landed never puts the old value back on screen.
  const pending = React.useRef({ tags: 0, actionPlan: 0, highlights: 0 })

  /** An answer from the server about the whole note: here, and on its row in the middle. */
  const show = React.useCallback((fresh: NoteDetail) => {
    setDetail((current) => ({
      ...fresh,
      tags: pending.current.tags ? current.tags : fresh.tags,
      actionPlan: pending.current.actionPlan ? current.actionPlan : fresh.actionPlan,
      highlights: pending.current.highlights ? current.highlights : fresh.highlights,
    }))
    tellCard.current(fresh)
  }, [])

  // While the import or the analysis is moving, ask again three seconds after
  // each answer. When the import names the note, the title box follows,
  // unless something was typed in it meanwhile.
  React.useEffect(() => {
    if (!isMoving(detail)) return
    let live = true
    const timer = setTimeout(() => {
      loadNoteDetail(detail.id, false)
        .then((fresh) => {
          if (!live) return
          if (fresh.title !== detail.title && title === detail.title) setTitle(fresh.title)
          show(fresh)
        })
        .catch(() => {
          // A missed ask is tried again on the next change.
          if (live) setDetail((current) => ({ ...current }))
        })
    }, POLL_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [detail, show, title])

  // A change made from the row's menu in the middle (priority, folder, pin)
  // shows here too.
  const [seenCard, setSeenCard] = React.useState(listedCard)
  if (listedCard !== seenCard) {
    setSeenCard(listedCard)
    if (listedCard && listedCard.id === detail.id && listedCard.updatedAt > detail.updatedAt) {
      setDetail((current) => ({ ...current, ...listedCard }))
    }
  }

  function changed(changes: NoteChanges, now = false) {
    if (readOnly) return
    autosave.change(changes, now)
  }

  async function run(name: string, work: () => Promise<unknown>, success?: string) {
    if (busy) return false
    setBusy(name)
    dismissErrorToast()
    try {
      await work()
      if (success) toast.success(success)
      return true
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function reloadFromServer() {
    onReload(await loadNoteDetail(opened.id, false))
  }

  /** A field outside the text: the server's answer is the row in the middle, and here. */
  async function changeOne(what: Parameters<typeof changeNotes>[1], success: string) {
    await run("change", async () => {
      await changeNotes([detail.id], what)
      const fresh = await loadNoteDetail(detail.id, false)
      show(fresh)
      await actions.refreshPage()
    }, success)
  }

  // Tags save one change at a time, each with the list as it stands.
  const tagQueue = React.useRef<Promise<unknown>>(Promise.resolve())
  function saveTags(next: string[]) {
    if (next.length > TAGS_PER_NOTE) {
      showErrorToast(`A note holds up to ${TAGS_PER_NOTE} tags`)
      return false
    }
    const before = detail.tags
    setDetail((current) => ({ ...current, tags: next }))
    pending.current.tags += 1
    tagQueue.current = tagQueue.current.then(async () => {
      try {
        const card = await saveNoteTags(detail.id, next)
        tellCard.current(card)
        await actions.refreshPage()
      } catch (error) {
        setDetail((current) => ({ ...current, tags: before }))
        showErrorToast(getLibraryErrorMessage(error))
      } finally {
        pending.current.tags -= 1
      }
    })
    return true
  }

  // The plan saves one change at a time, each with the plan as it stands, so
  // the last one sent is the one kept.
  const planQueue = React.useRef<Promise<unknown>>(Promise.resolve())
  function savePlan(steps: PlanStep[]) {
    const before = detail.actionPlan
    setDetail((current) => ({ ...current, actionPlan: steps }))
    pending.current.actionPlan += 1
    planQueue.current = planQueue.current.then(async () => {
      try {
        tellCard.current(await saveNotePlan(detail.id, steps))
      } catch (error) {
        setDetail((current) => ({ ...current, actionPlan: before }))
        showErrorToast(getLibraryErrorMessage(error))
      } finally {
        pending.current.actionPlan -= 1
      }
    })
  }

  const highlightQueue = React.useRef<Promise<unknown>>(Promise.resolve())
  function saveHighlights(highlights: Highlight[]) {
    const before = detail.highlights
    setDetail((current) => ({ ...current, highlights }))
    pending.current.highlights += 1
    highlightQueue.current = highlightQueue.current.then(async () => {
      try {
        await saveNoteHighlights(detail.id, highlights)
      } catch (error) {
        setDetail((current) => ({ ...current, highlights: before }))
        showErrorToast(getLibraryErrorMessage(error))
      } finally {
        pending.current.highlights -= 1
      }
    })
  }

  function download() {
    const file = noteToMarkdown({
      title: noteTitle(title),
      body,
      tags: detail.tags,
      priority: detail.priority,
      sourceUrl: detail.sourceUrl,
    })
    const url = URL.createObjectURL(new Blob([file], { type: "text/markdown;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = markdownFileName(noteTitle(title))
    link.click()
    // Later, not at once, or some browsers cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const seek = React.useCallback((ms: number) => {
    const player = playerRef.current
    if (!player) return
    player.currentTime = ms / 1000
    void player.play().catch(() => undefined)
  }, [])

  usePlayerPlace({
    playerRef,
    noteId: opened.id,
    playbackUrl: detail.playbackUrl,
    startSeconds: opened.playedSeconds,
    seekTo,
  })

  /** Where the video is now, for the clock button and "/" Video time. Null with nothing playable. */
  function videoTimeNow() {
    const player = playerRef.current
    return detail.playbackUrl && player ? Math.floor(player.currentTime * 1000) : null
  }

  function addTime() {
    const ms = videoTimeNow()
    if (ms !== null) editorRef.current?.insertTime(ms)
  }

  function addToNote(text: string, startMs: number | null) {
    editorRef.current?.insertQuote(text, startMs)
    toast.success("Added to your note.")
  }

  function downloadVideo() {
    // Same site, so the browser saves it under the name the server gives.
    const link = document.createElement("a")
    link.href = `/api/v1/note/${encodeURIComponent(detail.id)}/video`
    link.download = ""
    link.click()
  }

  function duplicate(library?: LibraryPage["otherLibraries"][number]) {
    void run("duplicate", async () => {
      await autosave.flush()
      const copy = await duplicateLibraryNote(detail.id, library?.id)
      if (library) {
        toast.success(`Copied ${quoteOneLine(shownTitle)} to ${quoteOneLine(library.name)}.`)
        return
      }
      toast.success(`Made ${quoteOneLine(noteTitle(copy.title))}.`)
      await actions.refreshAll()
      actions.openNote(copy.id)
    })
  }

  const shownTitle = noteTitle(title)

  return (
    <>
      <DashboardCardHeader className="gap-1">
        {/* The note's name where the folder dropdown was, and the only place
            it is written now (Tyler, 20 Oct 2026), so it is where it is renamed. */}
        <input
          aria-label="Title"
          value={title}
          readOnly={readOnly}
          maxLength={NOTE_TITLE_MAX}
          placeholder="Untitled"
          className={cn(
            "h-8 min-w-0 flex-1 truncate rounded-md bg-transparent px-1 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            dashboardCardHeadingClassName
          )}
          onChange={(event) => {
            setTitle(event.target.value)
            changed({ title: event.target.value })
          }}
          onBlur={() => void autosave.flush()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
        {trashed ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run("restore", async () => {
                  await restoreNoteFromTrash(opened.id)
                  actions.gone(opened.id)
                  await reloadFromServer()
                }, `Restored ${quoteOneLine(shownTitle)}.`)
              }
            >
              <Undo2Icon />
              Restore
            </Button>
            <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => setDeletingForGood(true)}>
              <Trash2Icon />
              Delete for good
            </Button>
          </>
        ) : (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Text toolbar"
                  aria-pressed={tools}
                  onClick={onTools}
                  className="aria-pressed:bg-muted"
                >
                  <PencilLineIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tools ? "Hide the text toolbar" : "Show the text toolbar"}</TooltipContent>
            </Tooltip>
            <NoteMenu
              page={page}
              detail={detail}
              headings={headings}
              knownTags={page.tags.map((each) => each.tag)}
              onPriority={(priority) => void changeOne({ change: "priority", priority }, `Set to ${PRIORITY_LABEL[priority]}.`)}
              onFolder={(folderId) =>
                void changeOne(
                  { change: "folder", folderId },
                  folderId
                    ? `Moved to ${quoteOneLine(page.folders.find((each) => each.id === folderId)?.name ?? "the folder")}.`
                    : "Moved out of its folder."
                )
              }
              onAddTag={(tag) => saveTags([...detail.tags, tag.trim().toLowerCase()])}
              onRemoveTag={(tag) => void saveTags(detail.tags.filter((each) => each !== tag))}
              onOutline={(index) => editorRef.current?.scrollToHeading(index)}
              onHistory={() => setHistoryOpen(true)}
              onPin={() =>
                void changeOne({ change: "pin", on: !detail.pinned }, detail.pinned ? "Unpinned." : "Pinned to the top.")
              }
              onArchive={() =>
                void changeOne(
                  { change: "archive", on: !detail.archived },
                  detail.archived ? "Back in its folder." : "Archived. Search still finds it."
                )
              }
              onAuthor={() => setAuthorOpen(true)}
              onMoveLibrary={(library) =>
                void run("move", async () => {
                  await autosave.flush()
                  const moved = await moveNotesToLibrary([detail.id], library.id)
                  if (moved.alreadyThere) {
                    showErrorToast(`${quoteOneLine(library.name)} already has this link, so the note stayed here.`)
                    return
                  }
                  toast.success(`Moved ${quoteOneLine(shownTitle)} to ${quoteOneLine(library.name)}.`)
                  actions.gone(detail.id)
                  onClose()
                })
              }
              onTemplate={() => setTemplateOpen(true)}
              onDownload={download}
              onDownloadVideo={detail.hasFile && detail.playbackUrl ? downloadVideo : undefined}
              onDuplicate={duplicate}
              onTrash={() =>
                void run("trash", async () => {
                  await autosave.flush()
                  await changeNotes([opened.id], { change: "trash" })
                  actions.gone(opened.id)
                  onClose()
                }, `Moved ${quoteOneLine(shownTitle)} to Trash. It stays there ${TRASH_DAYS} days.`)
              }
            />
          </>
        )}
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 pt-3 empty:hidden">
          {trashed ? (
            <p className="text-sm text-muted-foreground" role="status">
              This note is in Trash. Restore it to change it. It is deleted for good {TRASH_DAYS} days after it went there.
            </p>
          ) : null}

          {detail.authorName ? (
            <div className="flex min-w-0 items-center gap-2 px-1">
              <AuthorPicture name={detail.authorName} url={detail.authorPictureUrl} className="size-6 text-xs" />
              <button
                type="button"
                onClick={() => actions.setSearch({ author: detail.authorName ?? undefined, folder: undefined })}
                className={cn("min-w-0 truncate rounded-sm text-sm font-medium hover:underline", focusRing)}
              >
                {detail.authorName}
              </button>
              {detail.authorHandle ? (
                <span className="truncate text-sm text-muted-foreground">@{detail.authorHandle}</span>
              ) : null}
            </div>
          ) : null}

          {status === "offline" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2Icon className="size-3.5 animate-spin" />
              Not saved yet, trying again. What you typed is kept in this browser.
            </p>
          ) : null}
        </div>

        {/* The text runs edge to edge as part of the panel, with no card
            around it (Tyler, 20 Oct 2026). */}
        {/* With something above it (the author), the shown toolbar gets its own top line. */}
        <div className={cn(tools && !readOnly && (trashed || detail.authorName || status === "offline") && "mt-3 border-t")}>
          <NoteEditor
            ref={editorRef}
            inset
            tools={tools && !readOnly}
            libraryId={detail.libraryId}
            noteId={opened.id}
            initial={initialBody}
            editable={!readOnly}
            linkTitles={opened.linkTitles}
            onOpenNote={actions.openNote}
            onSeek={detail.playbackUrl ? seek : undefined}
            videoTimeNow={videoTimeNow}
            onChange={(next) => {
              setBody(next)
              changed({ body: next })
            }}
          />
          <p className="px-5 pb-3 text-xs text-muted-foreground tabular-nums">
            {facts.words.toLocaleString("en")} {facts.words === 1 ? "word" : "words"}, {readingMinutes(facts.words)} min read
          </p>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3 empty:hidden">
          {isImport ? (
            <SourceCard
              detail={detail}
              busy={busy}
              readOnly={readOnly}
              playerRef={playerRef}
              onAnalyse={() => void run("analyse", async () => show(await analyseNoteNow(detail.id)))}
              onRetry={() => void run("retry", async () => show(await retryNoteImport(detail.id)))}
              onRetryVideo={() => void run("video", async () => show(await retryNotePostVideo(detail.id)))}
              onRemove={() => setRemoving(true)}
              onHighlights={saveHighlights}
              onAddTime={addTime}
            />
          ) : null}

          {isImport || merged ? (
            <AiCards
              detail={detail}
              playable={detail.playbackUrl !== null}
              busy={busy !== null}
              readOnly={readOnly}
              playerRef={playerRef}
              onSeek={seek}
              onPlan={savePlan}
              onHighlights={saveHighlights}
              onAddToNote={addToNote}
              onRetryMerge={() => void run("analyse", async () => show(await analyseNoteNow(detail.id)))}
            />
          ) : null}

          {opened.linkedFrom.length ? (
            <PanelCard quiet storageId="note-library-linked-from" title="Linked from">
              <ul className="grid gap-1">
                {opened.linkedFrom.map((link) => (
                  <li key={link.id}>
                    <button
                      type="button"
                      onClick={() => actions.openNote(link.id)}
                      className={cn("flex items-center gap-2 rounded-sm text-left text-sm text-primary hover:underline", focusRing)}
                    >
                      <FileTextIcon aria-hidden className="size-3.5" />
                      {noteTitle(link.title)}
                    </button>
                  </li>
                ))}
              </ul>
            </PanelCard>
          ) : null}
        </div>
      </ScrollArea>

      <HistoryDialog
        libraryId={detail.libraryId}
        noteId={opened.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={(fresh) => {
          setHistoryOpen(false)
          // What this copy had not saved belongs to the text that was replaced.
          autosave.discard()
          forgetKeptChanges(opened.id)
          actions.cardChanged(fresh)
          onReload(fresh)
        }}
      />
      <NameDialog
        open={templateOpen}
        title="Save as template"
        description="New notes in this library can start from this note's title and text."
        label="Template name"
        defaultName={shownTitle}
        max={TEMPLATE_NAME_MAX}
        submitLabel="Create template"
        onClose={() => setTemplateOpen(false)}
        onSave={async (name) => {
          await autosave.flush()
          const ok = await run("template", () => saveAsTemplate(opened.id, name), `Saved ${quoteOneLine(name.trim())} as a template.`)
          if (ok) {
            setTemplateOpen(false)
            await actions.refreshPage()
          }
          return ok
        }}
      />
      <AuthorDialog
        open={authorOpen}
        name={detail.authorName ?? ""}
        handle={detail.authorHandle ?? ""}
        onClose={() => setAuthorOpen(false)}
        onSave={async (name, handle) => {
          const ok = await run("author", async () => {
            await saveNoteAuthor(detail.id, name, handle || null)
            show(await loadNoteDetail(detail.id, false))
            await actions.refreshPage()
          }, name.trim() ? "Author saved." : "Author taken off.")
          if (ok) setAuthorOpen(false)
          return ok
        }}
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={isPostSource(detail.source) ? "Remove the post?" : "Remove the video?"}
        description="The link, the saved file, the author and the Summary, Action plan and Quotes go. The note and its own text stay, as a plain note."
        confirmLabel={isPostSource(detail.source) ? "Remove post" : "Remove video"}
        loading={busy === "remove"}
        onConfirm={() =>
          void run("remove", async () => {
            const fresh = await removeNoteImport(detail.id)
            setRemoving(false)
            show(fresh)
            await actions.refreshAll()
          }, "Removed. The note stays.")
        }
      />
      <ConfirmDialog
        open={deletingForGood}
        onOpenChange={setDeletingForGood}
        title={`Delete ${quoteOneLine(shownTitle)} for good?`}
        description="It cannot be brought back, and its earlier copies and saved video go with it."
        confirmLabel="Delete for good"
        loading={busy === "delete"}
        onConfirm={() =>
          void run("delete", async () => {
            await deleteNoteNow(opened.id)
            setDeletingForGood(false)
            actions.gone(opened.id)
            onClose()
          }, `Deleted ${quoteOneLine(shownTitle)} for good.`)
        }
      />
      <Dialog open={status === "conflict"} onOpenChange={() => undefined}>
        <DialogContent variant="admin" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>This note changed in another tab</DialogTitle>
            <DialogDescription>
              Another tab or device saved this note after you started typing here. Pick the version to keep.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              “Keep this tab's version” saves what is on this screen over the other one; the other one stays in
              History. “Use the other version” throws away what this tab has not saved.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={resolving}
              onClick={() => {
                setResolving(true)
                autosave.discard()
                void reloadFromServer()
                  .catch((error) => showErrorToast(getLibraryErrorMessage(error)))
                  .finally(() => setResolving(false))
              }}
            >
              Use the other version
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={resolving}
              onClick={() => {
                setResolving(true)
                loadNoteDetail(opened.id, false)
                  .then((fresh) => {
                    // Everything on screen is the version to keep; then one save.
                    autosave.change({ title, body })
                    autosave.keepMine(fresh.revision)
                  })
                  .catch((error) => showErrorToast(getLibraryErrorMessage(error)))
                  .finally(() => setResolving(false))
              }}
            >
              {resolving ? <Loader2Icon className="animate-spin" /> : null}
              Keep this tab's version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type MenuPage = "priority" | "folder" | "tags" | "outline" | "library" | "duplicate"

const MENU_TITLE: Record<MenuPage, string> = {
  priority: "Priority",
  folder: "Folder",
  tags: "Tags",
  outline: "Outline",
  library: "Move to library",
  duplicate: "Duplicate to library",
}

/**
 * The note's ⋮ menu (Tyler, 20 Oct 2026: "move all these into the 3 dotted
 * dropdown"): Priority, Folder, Tags and Outline step into lists of their own
 * with a back arrow, then History and the rest of what is done to the note as
 * a whole. It steps the way the "N selected" menu does, since the shell's
 * dropdown has no sub-menus.
 */
function NoteMenu({
  page,
  detail,
  headings,
  knownTags,
  onPriority,
  onFolder,
  onAddTag,
  onRemoveTag,
  onOutline,
  onHistory,
  onPin,
  onArchive,
  onAuthor,
  onMoveLibrary,
  onTemplate,
  onDownload,
  onDownloadVideo,
  onDuplicate,
  onTrash,
}: {
  page: LibraryPage
  detail: NoteDetail
  headings: { level: number; text: string; index: number }[]
  knownTags: string[]
  onPriority: (priority: NotePriority) => void
  onFolder: (folderId: string | null) => void
  onAddTag: (tag: string) => boolean
  onRemoveTag: (tag: string) => void
  onOutline: (index: number) => void
  onHistory: () => void
  onPin: () => void
  onArchive: () => void
  onAuthor: () => void
  onMoveLibrary: (library: LibraryPage["otherLibraries"][number]) => void
  onTemplate: () => void
  onDownload: () => void
  /** Absent when the note has no saved video or sound. */
  onDownloadVideo?: () => void
  /** A copy here, or with a library, there. */
  onDuplicate: (library?: LibraryPage["otherLibraries"][number]) => void
  onTrash: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<MenuPage | null>(null)
  const folder = page.folders.find((each) => each.id === detail.folderId)

  function openChange(next: boolean) {
    setOpen(next)
    if (!next) setStep(null)
  }
  /** Runs a pick and shuts the menu, as a menu item does. */
  const pick = (work: () => void) => () => {
    openChange(false)
    work()
  }
  // flex-1 rather than an auto margin, which the row's own arrow also takes, so the word sits right by the arrow.
  const hint = (words: string) => <span className="min-w-0 flex-1 truncate pl-2 text-right text-xs text-muted-foreground">{words}</span>
  const priorityIcon = (each: NotePriority) =>
    each === "high" ? (
      <ArrowUpIcon className="size-4 text-muted-foreground" />
    ) : each === "low" ? (
      <ArrowDownIcon className="size-4 text-muted-foreground" />
    ) : (
      <MinusIcon className="size-4 text-muted-foreground" />
    )

  return (
    <Popover open={open} onOpenChange={openChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="More for this note">
              <EllipsisVerticalIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>More</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className={cn("gap-0 p-1", step === "tags" ? "w-80" : "w-64")}
        onEscapeKeyDown={(event) => {
          if (step === null) return
          event.preventDefault()
          setStep(null)
        }}
      >
        {step ? (
          <>
            <SelectedMenuRow onClick={() => setStep(null)} className="font-medium">
              <ChevronLeftIcon className="size-4 text-muted-foreground" />
              {MENU_TITLE[step]}
            </SelectedMenuRow>
            <SelectedMenuSeparator />
            {step === "priority" ? (
              NOTE_PRIORITIES.map((each) => (
                <SelectedMenuRow key={each} onClick={pick(() => onPriority(each))}>
                  {priorityIcon(each)}
                  {PRIORITY_LABEL[each]}
                  {each === detail.priority ? <CheckIcon className="ml-auto size-4" /> : null}
                </SelectedMenuRow>
              ))
            ) : step === "folder" ? (
              <ScrollArea className="max-h-72">
                <SelectedMenuRow onClick={pick(() => onFolder(null))}>
                  <MinusIcon className="size-4 text-muted-foreground" />
                  No folder
                  {detail.folderId === null ? <CheckIcon className="ml-auto size-4" /> : null}
                </SelectedMenuRow>
                {page.folders.map((each) => (
                  <SelectedMenuRow key={each.id} onClick={pick(() => onFolder(each.id))}>
                    <FolderIcon className="size-4 text-muted-foreground" />
                    <span className="truncate">{each.name}</span>
                    {each.id === detail.folderId ? <CheckIcon className="ml-auto size-4 shrink-0" /> : null}
                  </SelectedMenuRow>
                ))}
              </ScrollArea>
            ) : step === "tags" ? (
              <div className="p-1.5">
                <ContactTagsBox
                  id={`note-tags-${detail.id}`}
                  tags={detail.tags}
                  knownTags={knownTags}
                  onAdd={onAddTag}
                  onRemove={onRemoveTag}
                />
              </div>
            ) : step === "outline" ? (
              headings.length ? (
                <ScrollArea className="max-h-80">
                  {headings.map((heading) => (
                    <SelectedMenuRow
                      key={heading.index}
                      onClick={pick(() => onOutline(heading.index))}
                      className={heading.level === 1 ? "font-medium" : undefined}
                    >
                      <span className="truncate" style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}>
                        {heading.text || "Untitled heading"}
                      </span>
                    </SelectedMenuRow>
                  ))}
                </ScrollArea>
              ) : (
                <p className="px-2 py-2 text-sm text-muted-foreground">No headings yet. Type / and pick a heading.</p>
              )
            ) : page.otherLibraries.length ? (
              <ScrollArea className="max-h-72">
                {page.otherLibraries.map((library) => (
                  <SelectedMenuRow
                    key={library.id}
                    onClick={pick(() => (step === "duplicate" ? onDuplicate(library) : onMoveLibrary(library)))}
                  >
                    <LibraryDot colour={library.colour} />
                    <span className="truncate">{library.name}</span>
                  </SelectedMenuRow>
                ))}
              </ScrollArea>
            ) : (
              <p className="px-2 py-2 text-sm text-muted-foreground">This is your only library.</p>
            )}
          </>
        ) : (
          <>
            <SelectedMenuRow page="priority" onClick={() => setStep("priority")}>
              {priorityIcon(detail.priority)}
              Priority
              {hint(PRIORITY_LABEL[detail.priority])}
            </SelectedMenuRow>
            <SelectedMenuRow page="folder" onClick={() => setStep("folder")}>
              <FolderInputIcon className="size-4 text-muted-foreground" />
              Folder
              {hint(folder?.name ?? "No folder")}
            </SelectedMenuRow>
            <SelectedMenuRow page="tags" onClick={() => setStep("tags")}>
              <TagIcon className="size-4 text-muted-foreground" />
              Tags
              {hint(detail.tags.length ? String(detail.tags.length) : "None")}
            </SelectedMenuRow>
            <SelectedMenuRow page="outline" onClick={() => setStep("outline")}>
              <ListTreeIcon className="size-4 text-muted-foreground" />
              Outline
            </SelectedMenuRow>
            <SelectedMenuRow onClick={pick(onHistory)}>
              <HistoryIcon className="size-4 text-muted-foreground" />
              History
            </SelectedMenuRow>
            <SelectedMenuSeparator />
            <SelectedMenuRow onClick={pick(onPin)}>
              {detail.pinned ? (
                <PinOffIcon className="size-4 text-muted-foreground" />
              ) : (
                <PinIcon className="size-4 text-muted-foreground" />
              )}
              {detail.pinned ? "Unpin" : "Pin to the top"}
            </SelectedMenuRow>
            <SelectedMenuRow onClick={pick(onArchive)}>
              {detail.archived ? (
                <ArchiveRestoreIcon className="size-4 text-muted-foreground" />
              ) : (
                <ArchiveIcon className="size-4 text-muted-foreground" />
              )}
              {detail.archived ? "Unarchive" : "Archive"}
            </SelectedMenuRow>
            <SelectedMenuRow onClick={pick(onAuthor)}>
              <UserRoundIcon className="size-4 text-muted-foreground" />
              Edit author…
            </SelectedMenuRow>
            <SelectedMenuRow page="library" onClick={() => setStep("library")}>
              <LibraryIcon className="size-4 text-muted-foreground" />
              Move to library
            </SelectedMenuRow>
            <SelectedMenuRow onClick={pick(() => onDuplicate())}>
              <CopyIcon className="size-4 text-muted-foreground" />
              Duplicate
            </SelectedMenuRow>
            <SelectedMenuRow page="duplicate" onClick={() => setStep("duplicate")}>
              <CopyIcon className="size-4 text-muted-foreground" />
              Duplicate to library
            </SelectedMenuRow>
            <SelectedMenuSeparator />
            <SelectedMenuRow onClick={pick(onTemplate)}>
              <LayoutTemplateIcon className="size-4 text-muted-foreground" />
              Save as template…
            </SelectedMenuRow>
            <SelectedMenuRow onClick={pick(onDownload)}>
              <DownloadIcon className="size-4 text-muted-foreground" />
              Download as Markdown
            </SelectedMenuRow>
            {onDownloadVideo ? (
              <SelectedMenuRow onClick={pick(onDownloadVideo)}>
                <FileVideoIcon className="size-4 text-muted-foreground" />
                Download {detail.mediaKind === "audio" ? "sound" : "video"}
              </SelectedMenuRow>
            ) : null}
            <SelectedMenuSeparator />
            <SelectedMenuRow onClick={pick(onTrash)} className="text-destructive hover:text-destructive">
              <Trash2Icon className="size-4" />
              Move to Trash
            </SelectedMenuRow>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** A window with one name to type, for Save as template. */
function NameDialog({
  open,
  title,
  description,
  label,
  defaultName,
  max,
  submitLabel,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  description: string
  label: string
  defaultName: string
  max: number
  submitLabel: string
  onClose: () => void
  onSave: (name: string) => Promise<boolean>
}) {
  const [name, setName] = React.useState(defaultName)
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName(defaultName)
      setInvalid(false)
    }
  }
  async function save() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast(`Give the ${label.toLowerCase()} first`)
      return
    }
    setSaving(true)
    const ok = await onSave(name)
    setSaving(false)
    if (!ok) setInvalid(true)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor="note-name-dialog">{label}</Label>
            <Input
              id="note-name-dialog"
              value={name}
              maxLength={max}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                setName(event.target.value)
                setInvalid(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void save()
                }
              }}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="lg" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Edit author: read from the link and editable (Tyler, 20 Oct 2026: "Read
 * from link but I can edit it"). Notes group by the name, so typing the same
 * name on a channel and an X account puts them in one row of Authors. An
 * empty name takes the author off.
 */
function AuthorDialog({
  open,
  name: startName,
  handle: startHandle,
  onClose,
  onSave,
}: {
  open: boolean
  name: string
  handle: string
  onClose: () => void
  onSave: (name: string, handle: string) => Promise<boolean>
}) {
  const [name, setName] = React.useState(startName)
  const [handle, setHandle] = React.useState(startHandle)
  const [saving, setSaving] = React.useState(false)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName(startName)
      setHandle(startHandle)
    }
  }
  async function save() {
    setSaving(true)
    await onSave(name, handle)
    setSaving(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Edit author</DialogTitle>
          <DialogDescription>
            Notes with the same author name sit together in Authors, whichever site they came from.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="note-author-name">Name</Label>
            <Input
              id="note-author-name"
              value={name}
              maxLength={AUTHOR_NAME_MAX}
              placeholder="Marques Brownlee"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="note-author-handle">Handle</Label>
            <Input
              id="note-author-handle"
              value={handle}
              maxLength={AUTHOR_HANDLE_MAX}
              placeholder="@mkbhd"
              onChange={(event) => setHandle(event.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="lg" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

