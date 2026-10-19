import * as React from "react"
import type { JSONContent } from "@tiptap/core"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  EllipsisIcon,
  FileTextIcon,
  FolderInputIcon,
  HistoryIcon,
  ImageIcon,
  LayoutTemplateIcon,
  ListTreeIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { FieldInput, SuggestionRow } from "@/components/note-notes/field-input"
import { HistoryDialog } from "@/components/note-notes/history-dialog"
import { IconPicker, NoteIcon } from "@/components/note-notes/note-icon"
import { NoteEditor, type NoteEditorHandle } from "@/components/note-notes/note-editor"
import { VideoLink } from "@/components/note-notes/video-link"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ImageUpload } from "@/components/shared/image-upload"
import { InspectorCard } from "@/components/shared/inspector-card"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  archiveNoteIds,
  deleteNoteNow,
  getNotesErrorMessage,
  linkVideoToNote,
  loadNoteDetail,
  pinNoteIds,
  restoreNoteFromTrash,
  saveNoteField,
  suggestNoteFields,
  trashNoteIds,
} from "@/lib/api/note/notes"
import { createNoteTemplate } from "@/lib/api/note/notes-folders"
import { focusRing } from "@/lib/layout/focus-ring"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { noteBodyFacts, noteHeadings, readingMinutes } from "@/lib/note/notes/body"
import { hasValue, type NoteField, type NoteFieldValue, type NoteFieldValues } from "@/lib/note/notes/fields"
import { markdownFileName, noteToMarkdown } from "@/lib/note/notes/markdown"
import {
  NOTE_TITLE_MAX,
  noteTitle,
  TEMPLATE_NAME_MAX,
  TRASH_DAYS,
  type NoteCard,
  type NoteDetail,
  type NoteFolder,
} from "@/lib/note/notes/notes"
import { suggestPriceLine } from "@/lib/note/notes/suggest-price"
import { folderPath } from "@/lib/note/notes/tree"
import {
  forgetKeptChanges,
  readKeptChanges,
  useNoteAutosave,
  type NoteChanges,
} from "@/lib/note/notes/use-note-autosave"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type NotePanelActions = {
  onCardChanged: (card: NoteCard) => void
  onOpenNote: (id: string) => void
  onClose: () => void
  onMove: (ids: string[], fromFolderId: string | null) => void
  /** The note left the list it was on: Trash, restored, or gone for good. */
  onGone: (id: string) => void
  onTreeChanged: () => Promise<void> | void
  /** The note opened and the server marked it as just opened. */
  onOpened: () => void
}

/**
 * The right panel: the open note. Its icon and cover, its title, its fields,
 * the video it links to, the text, and what links to it. Everything saves by
 * itself (`useNoteAutosave`); the header's arrow and menu hold what you do to
 * the note as a whole.
 */
export function NotePanel({
  noteId,
  reloadKey,
  folders,
  actions,
}: {
  noteId: string | null
  /** Changes when the open note changed elsewhere on the page (moved), so it is read again. */
  reloadKey: number
  folders: NoteFolder[]
  actions: NotePanelActions
}) {
  const wide = useWideScreen()
  const [loaded, setLoaded] = React.useState<{ id: string; detail: NoteDetail; round: number } | null>(null)
  const [failure, setFailure] = React.useState<{ id: string; message: string } | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const opened = React.useRef(actions.onOpened)
  React.useEffect(() => {
    opened.current = actions.onOpened
  })

  React.useEffect(() => {
    if (!noteId) return
    let live = true
    loadNoteDetail(noteId, true)
      .then((detail) => {
        if (!live) return
        setLoaded((current) => ({ id: noteId, detail, round: (current?.round ?? 0) + 1 }))
        opened.current()
      })
      .catch((error) => {
        if (live) setFailure({ id: noteId, message: getNotesErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [noteId, reloads, reloadKey])

  const back = wide ? undefined : { label: "Back to the notes", onClick: actions.onClose }

  if (!noteId) {
    return (
      <>
        <DashboardCardTitleHeader icon={<FileTextIcon />} title="Note" />
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Pick a note, or make a new one.</p>
      </>
    )
  }

  const detail = loaded?.id === noteId ? loaded.detail : null
  if (!detail) {
    const failed = failure?.id === noteId ? failure.message : null
    return (
      <>
        <DashboardCardTitleHeader icon={<FileTextIcon />} back={back} title="Note" />
        {failed ? (
          <ErrorRow
            message={failed}
            onRetry={() => {
              setFailure(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : (
          <LoadingRow label="Loading the note" />
        )}
      </>
    )
  }

  return (
    <OpenNote
      // A new copy from the server (a restore, the other tab's version)
      // starts the editor over; typing never does.
      key={`${detail.id}:${loaded?.round}`}
      detail={detail}
      folders={folders}
      back={back}
      actions={actions}
      onReload={(next) => setLoaded((current) => ({ id: next.id, detail: next, round: (current?.round ?? 0) + 1 }))}
    />
  )
}

function OpenNote({
  detail: opened,
  folders,
  back,
  actions,
  onReload,
}: {
  detail: NoteDetail
  folders: NoteFolder[]
  back: { label: string; onClick: () => void } | undefined
  actions: NotePanelActions
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
  const [icon, setIcon] = React.useState(startWith?.icon !== undefined ? startWith.icon : opened.icon)
  const [cover, setCover] = React.useState(startWith?.coverUrl !== undefined ? startWith.coverUrl : opened.coverUrl)
  const [body, setBody] = React.useState<JSONContent>(startWith?.body ?? opened.body)
  const [initialBody] = React.useState<JSONContent>(startWith?.body ?? opened.body)
  const [values, setValues] = React.useState<NoteFieldValues>(opened.values)
  const [card, setCard] = React.useState<NoteCard>(opened)
  const [video, setVideo] = React.useState({ video: opened.video, gone: opened.videoGone })
  const [addingCover, setAddingCover] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [templateOpen, setTemplateOpen] = React.useState(false)
  const [deletingForGood, setDeletingForGood] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState<NoteFieldValues>({})
  const [suggesting, setSuggesting] = React.useState(false)
  /** The suggestion being kept, so a second click cannot save it twice. */
  const [keeping, setKeeping] = React.useState<string | null>(null)
  const [resolving, setResolving] = React.useState(false)
  const editorRef = React.useRef<NoteEditorHandle>(null)
  const setSaveStatus = useReportedSaveStatus()

  const tellCard = React.useRef(actions.onCardChanged)
  React.useEffect(() => {
    tellCard.current = actions.onCardChanged
  })

  const autosave = useNoteAutosave({
    noteId: opened.id,
    revision: opened.revision,
    startWith: readOnly ? null : startWith,
    startInConflict: Boolean(kept) && !keptFits,
    onSaved: ({ card: fresh }) => {
      setCard(fresh)
      tellCard.current(fresh)
    },
  })
  const { status } = autosave

  React.useEffect(() => {
    setSaveStatus(status === "saving" ? "saving" : status === "saved" ? "saved" : "idle")
  }, [status, setSaveStatus])

  const folder = folders.find((each) => each.id === card.folderId) ?? null
  const fields = folder?.fields ?? []
  const facts = React.useMemo(() => noteBodyFacts(body), [body])
  const headings = React.useMemo(() => noteHeadings(body), [body])
  const emptyFields = fields.filter((field) => !hasValue(values[field.key]))

  function changed(changes: NoteChanges, now = false) {
    if (readOnly) return
    autosave.change(changes, now)
  }

  async function saveField(field: NoteField, value: NoteFieldValue | null): Promise<boolean> {
    if (readOnly) return false
    dismissErrorToast()
    try {
      const fresh = await saveNoteField(opened.id, field.key, value)
      setValues(fresh.values)
      setCard(fresh)
      actions.onCardChanged(fresh)
      return true
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
      return false
    }
  }

  async function suggest() {
    if (!emptyFields.length) {
      showErrorToast("Every field on this note already has a value")
      return
    }
    setSuggesting(true)
    dismissErrorToast()
    try {
      // What is typed but not saved yet is what the AI should read.
      await autosave.flush()
      const { suggestions: found } = await suggestNoteFields(opened.id)
      setSuggestions(found)
      toast.success("Tick the suggestions to keep, or cross them out.")
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
    } finally {
      setSuggesting(false)
    }
  }

  async function act(work: () => Promise<unknown>, success: string) {
    setBusy(true)
    dismissErrorToast()
    try {
      await work()
      toast.success(success)
      return true
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function reloadFromServer() {
    const fresh = await loadNoteDetail(opened.id, false)
    onReload(fresh)
  }

  function download() {
    const file = noteToMarkdown({ title: noteTitle(title), body, fields, values })
    const url = URL.createObjectURL(new Blob([file], { type: "text/markdown;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = markdownFileName(noteTitle(title))
    link.click()
    URL.revokeObjectURL(url)
  }

  const shownTitle = noteTitle(title)

  return (
    <>
      <DashboardCardTitleHeader
        icon={<NoteIcon icon={icon} />}
        back={back}
        title={shownTitle}
        meta={folder ? folderPath(folders, folder.id) : card.folderId ? null : "No folder"}
        action={
          trashed ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const fresh = await restoreNoteFromTrash(opened.id)
                    actions.onCardChanged(fresh)
                    actions.onGone(opened.id)
                    // Out of Trash it can be changed again, so it opens afresh.
                    await reloadFromServer()
                  }, `Restored “${shownTitle}”.`)
                }
              >
                <Undo2Icon />
                Restore
              </Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={() => setDeletingForGood(true)}>
                <Trash2Icon />
                Delete for good
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <OutlineButton headings={headings} onJump={(index) => editorRef.current?.scrollToHeading(index)} />
              <HeaderButton label="History" onClick={() => setHistoryOpen(true)}>
                <HistoryIcon />
              </HeaderButton>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label="More for this note">
                        <EllipsisIcon />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>More</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      void act(async () => {
                        await pinNoteIds([opened.id], !card.pinned)
                        const next = { ...card, pinned: !card.pinned }
                        setCard(next)
                        actions.onCardChanged(next)
                      }, card.pinned ? "Unpinned." : "Pinned to the top of its folder.")
                    }
                  >
                    {card.pinned ? <PinOffIcon /> : <PinIcon />}
                    {card.pinned ? "Unpin" : "Pin to the top"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void act(async () => {
                        await archiveNoteIds([opened.id], !card.archived)
                        const next = { ...card, archived: !card.archived }
                        setCard(next)
                        actions.onCardChanged(next)
                      }, card.archived ? "Back in its folder." : "Archived. Search still finds it.")
                    }
                  >
                    {card.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                    {card.archived ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => actions.onMove([opened.id], card.folderId)}>
                    <FolderInputIcon />
                    Move to folder…
                  </DropdownMenuItem>
                  {folder ? (
                    <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
                      <LayoutTemplateIcon />
                      Save as template…
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={download}>
                    <DownloadIcon />
                    Download as Markdown
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      void act(async () => {
                        await autosave.flush()
                        await trashNoteIds([opened.id])
                        actions.onGone(opened.id)
                        actions.onClose()
                      }, `Moved “${shownTitle}” to Trash. It stays there ${TRASH_DAYS} days.`)
                    }
                  >
                    <Trash2Icon />
                    Move to Trash
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          {trashed ? (
            <p className="text-sm text-muted-foreground" role="status">
              This note is in Trash. Restore it to change it. It is deleted for good {TRASH_DAYS} days after it went there.
            </p>
          ) : null}

          {cover || addingCover ? (
            <ImageUpload
              label="Cover"
              value={cover ?? ""}
              disabled={readOnly}
              onChange={(url) => {
                const next = url || null
                setCover(next)
                setAddingCover(false)
                changed({ coverUrl: next }, true)
              }}
            />
          ) : null}

          <div className="flex items-start gap-1">
            {readOnly ? (
              <span className="flex size-8 items-center justify-center">
                <NoteIcon icon={icon} className="size-5" />
              </span>
            ) : (
              <IconPicker
                icon={icon}
                label={icon ? "Change icon" : "Add an icon"}
                size="icon"
                onPick={(next) => {
                  setIcon(next)
                  changed({ icon: next }, true)
                }}
              />
            )}
            <Textarea
              aria-label="Title"
              rows={1}
              value={title}
              readOnly={readOnly}
              maxLength={NOTE_TITLE_MAX}
              placeholder="Untitled"
              className="min-h-0 resize-none border-none px-1 text-xl font-semibold shadow-none focus-visible:ring-0 md:text-xl dark:bg-transparent"
              onChange={(event) => {
                const next = event.target.value.replace(/\n/g, " ")
                setTitle(next)
                changed({ title: next })
              }}
              onBlur={() => void autosave.flush()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault()
              }}
            />
            {!readOnly && !cover && !addingCover ? (
              <HeaderButton label="Add a cover" onClick={() => setAddingCover(true)}>
                <ImageIcon />
              </HeaderButton>
            ) : null}
          </div>

          {status === "offline" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2Icon className="size-3.5 animate-spin" />
              Not saved yet, trying again. What you typed is kept in this browser.
            </p>
          ) : null}

          {folder ? (
            <InspectorCard storageId="note-note-fields" title="Fields">
              <div className="mt-3 grid gap-3">
                {fields.length ? (
                  fields.map((field) => {
                    const suggestion = suggestions[field.key]
                    return (
                      <div key={field.id} className="grid gap-1.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start">
                        <Label htmlFor={`note-field-${opened.id}-${field.id}`} className="pt-2 text-muted-foreground">
                          {field.name}
                        </Label>
                        <div className="grid min-w-0 gap-1.5">
                          <FieldInput
                            id={`note-field-${opened.id}-${field.id}`}
                            field={field}
                            value={values[field.key]}
                            disabled={readOnly}
                            onSave={(value) => saveField(field, value)}
                          />
                          {suggestion !== undefined && !hasValue(values[field.key]) ? (
                            <SuggestionRow
                              field={field}
                              value={suggestion}
                              busy={busy || keeping === field.key}
                              onKeep={() => {
                                setKeeping(field.key)
                                void saveField(field, suggestion).then((ok) => {
                                  setKeeping(null)
                                  if (ok) setSuggestions(({ [field.key]: _kept, ...rest }) => rest)
                                })
                              }}
                              onDrop={() => setSuggestions(({ [field.key]: _dropped, ...rest }) => rest)}
                            />
                          ) : null}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This folder has no fields yet. The folder's menu on the left has Fields.
                  </p>
                )}
                {!readOnly && fields.length ? (
                  <div className="grid gap-1.5 border-t pt-3">
                    <p className="text-xs text-muted-foreground">{suggestPriceLine(facts.text.length + title.length, emptyFields.length)}</p>
                    <div>
                      <Button type="button" variant="outline" disabled={suggesting} onClick={() => void suggest()}>
                        {suggesting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                        Suggest fields
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </InspectorCard>
          ) : (
            <p className="text-sm text-muted-foreground">Move this note into a folder to give it fields.</p>
          )}

          <InspectorCard storageId="note-note-video" title="Video">
            <div className="mt-3">
              <VideoLink
                video={video.video}
                gone={video.gone}
                readOnly={readOnly}
                onLink={async (videoId) => {
                  dismissErrorToast()
                  try {
                    const fresh = await linkVideoToNote(opened.id, videoId)
                    setVideo({ video: fresh.video, gone: fresh.videoGone })
                    toast.success(videoId ? "Video linked." : "Link removed.")
                  } catch (error) {
                    showErrorToast(getNotesErrorMessage(error))
                  }
                }}
              />
            </div>
          </InspectorCard>

          <NoteEditor
            ref={editorRef}
            noteId={opened.id}
            initial={initialBody}
            editable={!readOnly}
            linkTitles={opened.linkTitles}
            onOpenNote={actions.onOpenNote}
            onChange={(next) => {
              setBody(next)
              changed({ body: next })
            }}
          />

          <p className="text-xs text-muted-foreground tabular-nums">
            {facts.words.toLocaleString("en")} {facts.words === 1 ? "word" : "words"}, {readingMinutes(facts.words)} min read
          </p>

          {opened.linkedFrom.length ? (
            <InspectorCard storageId="note-note-linked-from" title="Linked from">
              <ul className="mt-2 grid gap-1">
                {opened.linkedFrom.map((link) => (
                  <li key={link.id}>
                    <button
                      type="button"
                      onClick={() => actions.onOpenNote(link.id)}
                      className={cn("flex items-center gap-2 rounded-sm text-left text-sm text-primary hover:underline", focusRing)}
                    >
                      <FileTextIcon aria-hidden className="size-3.5" />
                      {noteTitle(link.title)}
                    </button>
                  </li>
                ))}
              </ul>
            </InspectorCard>
          ) : null}
        </div>
      </ScrollArea>

      <HistoryDialog
        noteId={opened.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={(fresh) => {
          setHistoryOpen(false)
          // What this copy had not saved belongs to the text that was replaced.
          autosave.discard()
          forgetKeptChanges(opened.id)
          actions.onCardChanged(fresh)
          onReload(fresh)
        }}
      />
      <SaveTemplateDialog
        open={templateOpen}
        defaultName={shownTitle}
        onClose={() => setTemplateOpen(false)}
        onSave={async (name) => {
          if (!folder) return false
          await autosave.flush()
          const ok = await act(() => createNoteTemplate(folder.id, name, opened.id), `Saved “${name.trim()}” as a template in ${folder.name}.`)
          if (ok) {
            setTemplateOpen(false)
            await actions.onTreeChanged()
          }
          return ok
        }}
      />
      <ConfirmDialog
        open={deletingForGood}
        onOpenChange={setDeletingForGood}
        title={`Delete “${shownTitle}” for good?`}
        description="It cannot be brought back, and its earlier copies go with it."
        confirmLabel="Delete for good"
        loading={busy}
        onConfirm={() =>
          void act(async () => {
            await deleteNoteNow(opened.id)
            setDeletingForGood(false)
            actions.onGone(opened.id)
            actions.onClose()
          }, `Deleted “${shownTitle}” for good.`)
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
                  .catch((error) => showErrorToast(getNotesErrorMessage(error)))
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
                    autosave.change({ title, body, icon, coverUrl: cover })
                    autosave.keepMine(fresh.revision)
                  })
                  .catch((error) => showErrorToast(getNotesErrorMessage(error)))
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

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The note's headings in order; clicking one scrolls the note to it. */
function OutlineButton({
  headings,
  onJump,
}: {
  headings: { level: number; text: string; index: number }[]
  onJump: (index: number) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Outline">
              <ListTreeIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Outline</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-1">
        {headings.length ? (
          <ScrollArea className="max-h-80">
            <ul aria-label="Outline" className="grid">
              {headings.map((heading) => (
                <li key={heading.index}>
                  <button
                    type="button"
                    onClick={() => {
                      onJump(heading.index)
                      setOpen(false)
                    }}
                    style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
                    className={cn(
                      "w-full truncate rounded-sm py-1.5 pr-2 text-left text-sm hover:bg-muted",
                      heading.level === 1 && "font-medium",
                      focusRing
                    )}
                  >
                    {heading.text || "Untitled heading"}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <p className="p-2 text-sm text-muted-foreground">No headings yet. Type / and pick a heading.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

function SaveTemplateDialog({
  open,
  defaultName,
  onClose,
  onSave,
}: {
  open: boolean
  defaultName: string
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
      showErrorToast("Give the template a name")
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
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            New notes in this folder can start from this note's title, field values and text.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor="note-save-template-name">Template name</Label>
            <Input
              id="note-save-template-name"
              value={name}
              maxLength={TEMPLATE_NAME_MAX}
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
            Create template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
