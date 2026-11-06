import * as React from "react"
import { toast } from "sonner"
import {
  ChevronRightIcon,
  CircleCheckIcon,
  ClapperboardIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FileXIcon,
  GlobeIcon,
  InfoIcon,
  LinkIcon,
  ListTodoIcon,
  MessagesSquareIcon,
  SettingsIcon,
  XIcon,
  Loader2Icon,
  PlayIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  type LucideIcon,
} from "lucide-react"

import { useFolded, toggleFold } from "@/components/project/notes/note-folds"
import { useLoaded, useNoteSetup } from "@/components/project/notes/note-setup"
import { PhotoCreditLine, UnsplashPicker } from "@/components/project/notes/unsplash-picker"
import { DueDate, StatusBadge } from "@/components/project/task-bits"
import { TaskLinkButton } from "@/components/project/task-link"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { findLinkableTasks, type LinkChoice } from "@/lib/api/project/chat"
import { loadRecordCard, previewNotePage } from "@/lib/api/project/note-blocks"
import { addFileToTask, deleteFileFromTask } from "@/lib/api/project/task-files"
import type { TaskFile } from "@/lib/api/project/tasks"
import { formatFileSize } from "@/lib/format/format-bytes"
import { getProjectErrorMessage, PROJECT_ERRORS } from "@/lib/project/errors"
import { isShownPicture, taskFileHref } from "@/lib/project/files"
import { LINKED_APP_INFO } from "@/lib/project/linked-records"
import {
  httpsAddress,
  LINK_LABEL_MAX,
  LINKS_BLOCK_MAX,
  linkWords,
  type CalloutKind,
  type NoteImageAttrs,
  type NoteLink,
  type PhotoCredit,
} from "@/lib/project/note-blocks"
import { LIMITS } from "@/lib/project/rules"
import { readVideoLink, VIDEO_SITE_LABEL, videoLinkProblem } from "@/lib/project/video-links"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * How each "/" block in a Project note looks (Project note blocks task),
 * drawn the same in the editor (`note-block-views.tsx`) and for someone who
 * can only read (`note-reader.tsx`). Image and Video are Travel's
 * (`apps/travel/src/components/travel/note-block-views.tsx`). A block that
 * isn't filled in yet shows how to fill it only while the note can be written
 * in; it's never saved, so a reader never sees one. Every block sits inside
 * a `group/block` frame, whose `data-selected` marks it chosen.
 */

/**
 * A selected block (clicked, ready for Backspace) is marked on its picture,
 * card or box only, following its rounded corners (Tyler, 5 Nov 2026, in
 * Travel: "this ui outline here is really ugly").
 */
export const SELECTED = "group-data-[selected]/block:ring-2 group-data-[selected]/block:ring-primary/30"

/** The buttons in a block's top corner: shown while it's pointed at, focused or selected, and always on a phone. */
const BLOCK_TOOLS =
  "absolute right-2 flex gap-1 opacity-0 group-hover/block:opacity-100 group-data-[selected]/block:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"

/** The frame every block sits in. The note's own link style is for its writing, not a block's small print. */
export const BLOCK_FRAME = "group/block relative my-2 [&_a]:text-inherit! [&_a]:no-underline! [&_a:hover]:text-foreground!"

/** Whether the note can be written in, and how to change or remove the block, from the editor. */
export type BlockEditing = { editable: boolean; remove: () => void }

function ToolButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="secondary" size="icon-sm" aria-label={label} onClick={onClick}>
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The bin, and any other buttons, in the block's top corner. Only while the note can be written in. */
/**
 * The block's buttons, inside its top-right corner. `top` lines them up with the block's first
 * line where that isn't 8px down, as on a Fold heading.
 */
function BlockTools({
  editing,
  label,
  top = "top-2",
  children,
}: {
  editing: BlockEditing
  label: string
  top?: string
  children?: React.ReactNode
}) {
  if (!editing.editable && !children) return null
  return (
    <div className={cn(BLOCK_TOOLS, top)}>
      {children}
      {editing.editable ? <ToolButton label={label} icon={Trash2Icon} onClick={editing.remove} /> : null}
    </div>
  )
}

/** A grey line in the block's place: something gone, or not set up. */
function BlockLine({ children, editing, label }: { children: React.ReactNode; editing: BlockEditing; label: string }) {
  return (
    <>
      <p className={cn("rounded-md border bg-muted/40 p-3 pr-12 text-sm text-muted-foreground", SELECTED)}>{children}</p>
      <BlockTools editing={editing} label={label} />
    </>
  )
}

function BlockLoading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" aria-hidden />
      {label}
    </p>
  )
}

/** A web address field with Add, for an Image, Video or Web page block not filled in yet. */
function AddressForm({
  label,
  placeholder,
  check,
  onAdd,
}: {
  label: string
  placeholder: string
  /** The address to keep, or the sentence saying why it can't be used. */
  check: (text: string) => { url: string } | { problem: string }
  onAdd: (url: string) => void
}) {
  const [text, setText] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const inputId = React.useId()
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const result = check(text)
        if ("problem" in result) {
          setInvalid(true)
          showErrorToast(result.problem)
          return
        }
        setInvalid(false)
        onAdd(result.url)
      }}
    >
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={text}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" variant="outline">
          Add
        </Button>
      </div>
    </form>
  )
}

const checkPictureAddress = (text: string) => {
  const url = httpsAddress(text, 1000)
  return url ? { url } : { problem: "Paste a picture's address that starts with https://" }
}

/** Sends one picked file to the task, after the checks the Files card makes first. */
async function sendToTask(taskId: string, file: File, picture: boolean) {
  if (picture && !isShownPicture(file.type)) throw new Error(PROJECT_ERRORS.notAPicture)
  if (file.size > LIMITS.fileBytes) {
    throw new Error(`"${file.name}" is ${formatFileSize(file.size)}. A file can be at most ${formatFileSize(LIMITS.fileBytes)}.`)
  }
  return addFileToTask(taskId, file)
}

/** A browse button that sends one file to the task, spinning while it goes up. */
function UploadButton({
  label,
  picture,
  onAdded,
}: {
  label: string
  picture: boolean
  onAdded: (file: { id: string; name: string }) => void
}) {
  const { task, hold } = useNoteSetup()
  const input = React.useRef<HTMLInputElement>(null)
  const [sending, setSending] = React.useState(false)
  // Held from the press until the file is up or the picker is closed, so the note can't be redrawn under the block.
  const holding = React.useRef(false)
  const release = React.useCallback(() => {
    if (!holding.current) return
    holding.current = false
    hold(false)
  }, [hold])
  React.useEffect(() => {
    // Closing the picker without a file lets the note be redrawn again.
    const picker = input.current
    picker?.addEventListener("cancel", release)
    return () => {
      picker?.removeEventListener("cancel", release)
      release()
    }
  }, [release])
  if (!task) return null
  const taskId = task.id
  const refresh = task.refresh

  async function send(file: File | undefined) {
    if (!file || sending) {
      release()
      return
    }
    setSending(true)
    try {
      const { id } = await sendToTask(taskId, file, picture)
      onAdded({ id, name: file.name })
      // The Files card shows it too, and it counts toward the task's 10.
      await refresh()
    } catch (error) {
      const message = error instanceof Error && error.message.startsWith(`"${file.name}"`) ? error.message : getProjectErrorMessage(error)
      showErrorToast(message)
    } finally {
      setSending(false)
      release()
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        accept={picture ? "image/png,image/jpeg,image/gif,image/webp" : undefined}
        onChange={(event) => {
          void send(event.target.files?.[0])
          event.target.value = ""
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={sending}
        onClick={() => {
          if (!holding.current) {
            holding.current = true
            hold(true)
          }
          input.current?.click()
        }}
      >
        {sending ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
        {label}
      </Button>
    </div>
  )
}

/**
 * A task file's picture, fetched and drawn from memory, as the Files card's
 * `SmallPicture` does: the local dev server answers an image tag pointed at
 * Project's file address with 404. "failed" once it can't be read.
 */
function useTaskPicture(fileId: string | null): string | "failed" | null {
  const [loaded, setLoaded] = React.useState<{ fileId: string; src: string | "failed" } | null>(null)
  React.useEffect(() => {
    if (!fileId) return
    let url: string | null = null
    let live = true
    fetch(taskFileHref(fileId, true))
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.blob()
      })
      .then(
        (blob) => {
          if (!live) return
          url = URL.createObjectURL(blob)
          setLoaded({ fileId, src: url })
        },
        () => live && setLoaded({ fileId, src: "failed" })
      )
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [fileId])
  return fileId && loaded?.fileId === fileId ? loaded.src : null
}

/** Image: one of the task's own files, an Unsplash photo with its credit, or a web address. */
export function ImageDrawing({
  attrs,
  editing,
  onPick,
}: {
  attrs: Partial<NoteImageAttrs>
  editing: BlockEditing
  onPick: (attrs: NoteImageAttrs) => void
}) {
  const { task } = useNoteSetup()
  const [broken, setBroken] = React.useState(false)
  const filePicture = useTaskPicture(attrs.fileId ?? null)
  const src = attrs.fileId ? filePicture : attrs.src

  function pick(next: { src?: string | null; fileId?: string | null; credit?: PhotoCredit | null; alt?: string }) {
    setBroken(false)
    onPick({ src: next.src ?? null, fileId: next.fileId ?? null, alt: next.alt ?? "", credit: next.credit ?? null })
  }

  if (attrs.fileId && !src) return <BlockLoading label="Loading the picture…" />
  if (!src) {
    if (!editing.editable) return null
    return (
      <>
        <div className={cn("grid gap-3 rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          {/* Uploads become the task's own private files (Tyler, 5 Nov 2026: "Task's private files"), so only a task takes one. */}
          <div className="flex flex-wrap gap-2">
            {task ? <UploadButton label="Upload a picture" picture onAdded={(file) => pick({ fileId: file.id, alt: file.name })} /> : null}
            <UnsplashPicker startQuery="" onPick={(photo) => pick({ src: photo.url, credit: photo.credit })} />
          </div>
          <AddressForm label="Web address" placeholder="https://…" check={checkPictureAddress} onAdd={(url) => pick({ src: url })} />
        </div>
        <BlockTools editing={editing} label="Remove image" />
      </>
    )
  }

  return (
    <>
      <figure className="grid gap-1">
        {broken || src === "failed" ? (
          <p className={cn("rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground", SELECTED)}>This picture no longer loads.</p>
        ) : (
          <img
            src={src}
            alt={attrs.alt ?? ""}
            loading="lazy"
            className={cn("max-h-96 w-full rounded-md border bg-muted object-contain", SELECTED)}
            onError={() => setBroken(true)}
          />
        )}
        {attrs.credit ? <PhotoCreditLine credit={attrs.credit} /> : null}
      </figure>
      <BlockTools editing={editing} label="Remove image" />
    </>
  )
}

const checkVideoLink = (text: string) => {
  const found = readVideoLink(text)
  return found ? { url: found.url } : { problem: videoLinkProblem(text) }
}

/** Video: a still with a Play button; the player loads only when it's pressed, so a note full of videos opens fast. */
export function VideoDrawing({ url, editing, onSet }: { url: string | null; editing: BlockEditing; onSet: (url: string) => void }) {
  const video = url ? readVideoLink(url) : null
  const [playing, setPlaying] = React.useState(false)

  if (!video) {
    if (!editing.editable) return null
    return (
      <>
        <div className={cn("rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          <AddressForm label="Video link" placeholder="A YouTube, TikTok, Instagram or Loom link" check={checkVideoLink} onAdd={onSet} />
        </div>
        <BlockTools editing={editing} label="Remove video" />
      </>
    )
  }

  const site = VIDEO_SITE_LABEL[video.site]
  // YouTube and Loom are wide; TikTok and Instagram are tall.
  const tall = video.site === "tiktok" || video.site === "instagram"
  const shape = cn("w-full", tall ? "aspect-[9/16]" : "aspect-video")
  return (
    // Sized to the video, so the buttons sit on its corner even when it's a tall one.
    <div className={cn("relative grid w-full", tall && "max-w-80")}>
      {playing ? (
        <iframe
          src={video.playerUrl}
          title={`${site} video`}
          className={cn(shape, "rounded-md border bg-muted", SELECTED)}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
        />
      ) : (
        <button
          type="button"
          aria-label={`Play the ${site} video`}
          className={cn(
            shape,
            "relative flex items-center justify-center overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            SELECTED
          )}
          onClick={() => setPlaying(true)}
        >
          {video.stillUrl ? <img src={video.stillUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" /> : null}
          <span className="relative flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-sm font-medium">
            <PlayIcon className="size-4" aria-hidden />
            {site}
          </span>
        </button>
      )}
      {/* Shown on hover, like the bin: a player that won't load still leaves the way to the video. */}
      <BlockTools editing={editing} label="Remove video">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="secondary" size="icon-sm">
              <a href={video.url} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${site}`}>
                <ExternalLinkIcon className="size-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open on {site}</TooltipContent>
        </Tooltip>
      </BlockTools>
    </div>
  )
}

/** How long typing in the Task card's search pauses before the tasks are looked up. */
const FIND_DELAY_MS = 200

/** The search an empty Task card shows: the tasks this person can see, newest change first. */
function TaskSearch({ onPick }: { onPick: (taskId: string) => void }) {
  const { teamId } = useNoteSetup()
  const [query, setQuery] = React.useState("")
  const [found, setFound] = React.useState<{ query: string; tasks: LinkChoice[] } | { query: string; failed: true } | null>(null)
  const inputId = React.useId()

  React.useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      findLinkableTasks(query, teamId).then(
        (tasks) => live && setFound({ query, tasks }),
        () => live && setFound({ query, failed: true })
      )
    }, FIND_DELAY_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [query, teamId])

  const current = found?.query === query ? found : null
  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>Find a task</Label>
      <Input id={inputId} value={query} placeholder="Type part of its title" onChange={(event) => setQuery(event.target.value)} />
      {!current ? (
        <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
          Looking…
        </p>
      ) : "failed" in current ? (
        <p className="py-1 text-sm text-muted-foreground">The tasks couldn't be loaded. Type again to retry.</p>
      ) : current.tasks.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">No task you can see has that in its title.</p>
      ) : (
        <ul role="listbox" aria-label="Tasks" className="grid gap-0.5">
          {current.tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => onPick(task.id)}
              >
                <ListTodoIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="grid min-w-0">
                  <span className="truncate">{task.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{task.projectName}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Task card: the task's name, status, person and due date, read fresh each time the note opens. */
export function TaskCardDrawing({ taskId, editing, onPick }: { taskId: string | null; editing: BlockEditing; onPick: (taskId: string) => void }) {
  const { cards, openTask } = useNoteSetup()
  const [card, retry] = useLoaded(taskId, () => cards.load(taskId!))

  if (!taskId) {
    if (!editing.editable) return null
    return (
      <>
        <div className={cn("rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          <TaskSearch onPick={onPick} />
        </div>
        <BlockTools editing={editing} label="Remove task card" />
      </>
    )
  }
  if (card.state === "loading") return <BlockLoading label="Loading the task…" />
  if (card.state === "failed") {
    return (
      <>
        <div className={cn("flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3 pr-12 text-sm text-muted-foreground", SELECTED)}>
          The task couldn't be loaded.
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
        <BlockTools editing={editing} label="Remove task card" />
      </>
    )
  }
  const task = card.value
  if (task.state === "hidden") return <BlockLine editing={editing} label="Remove task card">A task you can't see.</BlockLine>
  if (task.state === "deleted") return <BlockLine editing={editing} label="Remove task card">Removed: this task was deleted.</BlockLine>
  return (
    <>
      <button
        type="button"
        className={cn(
          "grid w-full min-w-0 gap-1.5 rounded-md border bg-card p-3 pr-12 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
          SELECTED
        )}
        onClick={() => openTask(task.taskId, task.projectId)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ListTodoIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-medium">{task.title}</span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <StatusBadge status={task.status} />
          <span className="text-muted-foreground">{task.assigneeName ?? "Nobody on it"}</span>
          <DueDate dueDate={task.dueDate} status={task.status} />
        </span>
      </button>
      <BlockTools editing={editing} label="Remove task card" />
    </>
  )
}

/** File: one of the task's files, as a row with its name, size and a download button. */
export function FileDrawing({ fileId, editing, onPick }: { fileId: string | null; editing: BlockEditing; onPick: (fileId: string) => void }) {
  const { task } = useNoteSetup()
  const files = task?.files ?? []

  if (!fileId) {
    if (!editing.editable || !task) return null
    return (
      <>
        <div className={cn("grid gap-3 rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          {files.length ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Pick one of this task's files</p>
              <ul className="grid gap-0.5">
                {files.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      onClick={() => onPick(file.id)}
                    >
                      <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This task has no files yet.</p>
          )}
          <UploadButton label="Upload a file" picture={false} onAdded={(file) => onPick(file.id)} />
        </div>
        <BlockTools editing={editing} label="Remove block" />
      </>
    )
  }

  const file = files.find((each) => each.id === fileId)
  if (!file) return <BlockLine editing={editing} label="Remove file">Removed: this file was deleted.</BlockLine>
  return (
    <>
      <div className={cn("flex min-w-0 items-center gap-3 rounded-md border bg-card p-2 pr-12", SELECTED)}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <FileIcon className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{file.name}</span>
          <span className="text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="outline" size="icon-sm">
              <a href={taskFileHref(file.id)} download aria-label={`Download ${file.name}`}>
                <DownloadIcon className="size-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download</TooltipContent>
        </Tooltip>
      </div>
      <BlockTools editing={editing} label="Remove block">
        {file.canDelete ? <DeleteFileButton file={file} editing={editing} /> : null}
      </BlockTools>
    </>
  )
}

/**
 * Deletes the file itself from the task, after asking (Tyler, 6 Nov 2026,
 * once the task panel's Files box went: the block is where a file is
 * deleted). Only for whoever may delete it. The block goes with it where the
 * notes can be written in; elsewhere it reads "Removed: this file was
 * deleted.", as every other block showing the file does.
 */
function DeleteFileButton({ file, editing }: { file: TaskFile; editing: BlockEditing }) {
  const { task } = useNoteSetup()
  const [asking, setAsking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  async function remove() {
    setBusy(true)
    try {
      await deleteFileFromTask(file.id)
      setAsking(false)
      if (editing.editable) editing.remove()
      toast.success("File deleted.")
      await task?.refresh()
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <ToolButton label="Delete file" icon={FileXIcon} onClick={() => setAsking(true)} />
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Delete ${file.name}?`}
        description="It goes from the task for everyone, and from every note that shows it."
        confirmLabel="Delete file"
        destructive
        loading={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}

/**
 * Comments: the task's comments, with the box to write in, wherever the block
 * is placed in its notes (Tyler, 6 Nov 2026: "Make comments a block"). It
 * holds nothing of its own; the comments are the task's stored chat, so they
 * read the same everywhere. While it shows, the panel doesn't draw them again
 * under the notes. The thread takes its own clicks and keys, so writing in it
 * never writes in the notes.
 */
export function CommentsDrawing({ editing }: { editing: BlockEditing }) {
  const comments = useNoteSetup().task?.comments ?? null
  const placed = comments?.placed
  React.useEffect(() => placed?.(), [placed])
  if (!comments) return <BlockLine editing={editing} label="Remove comments">This task's comments show in its panel.</BlockLine>
  return (
    <>
      <CommentsBox count={comments.count} className={SELECTED}>
        {comments.thread}
      </CommentsBox>
      <BlockTools editing={editing} label="Remove comments" />
    </>
  )
}

/** The Comments block's box: its heading with the count, then the thread. Also drawn under the notes when no block is placed. */
export function CommentsBox({ count, className, children }: { count: number; className?: string; children: React.ReactNode }) {
  return (
    <section
      aria-label="Comments"
      contentEditable={false}
      className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-md border bg-card p-3", className)}
    >
      {/* Not a heading tag: the note's own heading look would take it over. */}
      <div className="flex min-w-0 items-center gap-2 pr-10 text-sm font-medium">
        <MessagesSquareIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Comments
        {count ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">{count}</span> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * Video or Promo: the task's own record, with its name and picture for those
 * who may open it (the person assigned and the site admin), and the same
 * Edit video or Open in Promo button. Everyone else reads the task panel's
 * line. Project asks the other app each time and keeps no copy.
 */
export function RecordDrawing({ editing }: { editing: BlockEditing }) {
  const { task, teamId } = useNoteSetup()
  // Asked only for someone who sees the name: the person assigned or the site admin, with the app connected.
  const [card, retry] = useLoaded(task?.link?.canOpen && task.link.connected ? task.id : null, () => loadRecordCard(task!.id, teamId))
  if (!task?.link) {
    return <BlockLine editing={editing} label="Remove Video or Promo card">This task doesn't point at a Video or Promo project.</BlockLine>
  }
  const link = task.link
  const info = LINKED_APP_INFO[link.app]
  if (!link.canOpen || !link.connected) {
    return (
      <>
        <div className={cn("rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          <TaskLinkButton taskId={task.id} link={link} />
        </div>
        <BlockTools editing={editing} label="Remove Video or Promo card" />
      </>
    )
  }
  const loaded = card.state === "ready" ? card.value : null
  return (
    <>
      <div className={cn("flex min-w-0 flex-wrap items-center gap-3 rounded-md border bg-card p-2 pr-12", SELECTED)}>
        {loaded?.pictureUrl ? (
          <img src={loaded.pictureUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-md bg-muted object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
            {card.state === "loading" ? (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
            ) : (
              <ClapperboardIcon className="size-5 text-muted-foreground" aria-hidden />
            )}
          </span>
        )}
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{loaded?.name ?? info.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {card.state === "failed" ? (
              <>
                The name couldn't be loaded.{" "}
                <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={retry}>
                  Try again
                </button>
              </>
            ) : card.state === "ready" && !loaded?.name ? (
              `${info.name} didn't answer, so its name isn't shown.`
            ) : (
              `${info.name} · ${info.record}`
            )}
          </span>
        </span>
        <TaskLinkButton taskId={task.id} link={link} />
      </div>
      <BlockTools editing={editing} label="Remove Video or Promo card" />
    </>
  )
}

const checkPageAddress = (text: string) => {
  const url = httpsAddress(text, 2000)
  return url ? { url } : { problem: PROJECT_ERRORS.pageAddressRefused }
}

/** Web page: the page's title, site icon and picture, read by Project's server when the note opens. */
export function WebPageDrawing({ url, editing, onSet }: { url: string | null; editing: BlockEditing; onSet: (url: string) => void }) {
  const [preview] = useLoaded(url, () => previewNotePage(url!))
  const [iconBroken, setIconBroken] = React.useState(false)
  const [pictureBroken, setPictureBroken] = React.useState(false)

  if (!url) {
    if (!editing.editable) return null
    return (
      <>
        <div className={cn("rounded-md border bg-muted/40 p-3 pr-12", SELECTED)}>
          <AddressForm label="Web page" placeholder="https://…" check={checkPageAddress} onAdd={onSet} />
        </div>
        <BlockTools editing={editing} label="Remove web page" />
      </>
    )
  }

  const page = preview.state === "ready" ? preview.value : null
  const host = new URL(url).hostname.replace(/^www\./, "")
  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("flex min-w-0 items-stretch gap-3 overflow-hidden rounded-md border bg-card pr-12 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none", SELECTED)}
      >
        {page?.imageUrl && !pictureBroken ? (
          <img src={page.imageUrl} alt="" loading="lazy" className="w-24 shrink-0 bg-muted object-cover" onError={() => setPictureBroken(true)} />
        ) : null}
        <span className="grid min-w-0 flex-1 gap-0.5 py-2 pl-3 first:pl-3">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {preview.state === "loading" ? (
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden />
            ) : page?.iconUrl && !iconBroken ? (
              <img src={page.iconUrl} alt="" className="size-3.5 shrink-0 rounded-sm" onError={() => setIconBroken(true)} />
            ) : (
              <GlobeIcon className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">{page?.siteName ?? host}</span>
          </span>
          <span className="truncate text-sm font-medium">
            {preview.state === "failed" ? getProjectErrorMessage(preview.error) : (page?.title ?? url)}
          </span>
          <span className="truncate text-xs text-muted-foreground">{url}</span>
        </span>
      </a>
      <BlockTools editing={editing} label="Remove web page" />
    </>
  )
}

/**
 * Links: labelled web addresses, one a line, each opening in a new tab (Tyler,
 * 5 Nov 2026: "a links block"). In the editor the cog opens the block's own
 * add and remove controls; an empty block opens with them.
 */
export function LinksDrawing({ links, editing, onChange }: { links: NoteLink[]; editing: BlockEditing; onChange: (links: NoteLink[]) => void }) {
  const [changing, setChanging] = React.useState(false)
  const [words, setWords] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const wordsId = React.useId()
  const addressId = React.useId()
  const open = editing.editable && (changing || links.length === 0)
  if (!links.length && !editing.editable) return null

  function add(event: React.FormEvent) {
    event.preventDefault()
    const url = httpsAddress(address, 2000)
    if (!url) {
      setInvalid(true)
      showErrorToast("Paste an address that starts with https://")
      return
    }
    if (links.length >= LINKS_BLOCK_MAX) {
      showErrorToast(`A Links block holds up to ${LINKS_BLOCK_MAX} links. Start another for the rest.`)
      return
    }
    setInvalid(false)
    setWords("")
    setAddress("")
    onChange([...links, { label: words.trim().slice(0, LINK_LABEL_MAX), url }])
  }

  return (
    <>
      <div className={cn("grid gap-3 rounded-md", open && "border bg-muted/40 p-3", editing.editable && "pr-12", SELECTED)}>
        {links.length ? (
          <ul className="grid gap-1.5" aria-label="Links">
            {links.map((link, index) => (
              <li key={`${index}-${link.url}`} className="flex min-w-0 items-center gap-2 text-sm">
                <LinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline!">
                  {linkWords(link)}
                </a>
                {open ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${linkWords(link)}`}
                    onClick={() => onChange(links.filter((_, at) => at !== index))}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {open ? (
          <form className="grid gap-2" onSubmit={add}>
            <div className="grid gap-2">
              <Label htmlFor={wordsId}>Words to show</Label>
              <Input id={wordsId} value={words} maxLength={LINK_LABEL_MAX} placeholder="Figma" onChange={(event) => setWords(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={addressId}>Web address</Label>
              <div className="flex gap-2">
                <Input
                  id={addressId}
                  value={address}
                  placeholder="https://…"
                  aria-invalid={invalid || undefined}
                  onChange={(event) => setAddress(event.target.value)}
                />
                <Button type="submit" variant="outline">
                  Add
                </Button>
              </div>
            </div>
            {links.length ? (
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(false)}>
                  Done
                </Button>
              </div>
            ) : null}
          </form>
        ) : null}
      </div>
      <BlockTools editing={editing} label="Remove links">
        {editing.editable && links.length && !changing ? (
          <ToolButton label="Change the links" icon={SettingsIcon} onClick={() => setChanging(true)} />
        ) : null}
      </BlockTools>
    </>
  )
}

const CALLOUTS: Record<CalloutKind, { label: string; icon: LucideIcon; box: string; mark: string }> = {
  // The tints are Project's own chip tints (`task-bits.tsx`, TINT): slate, amber and green.
  note: { label: "Note", icon: InfoIcon, box: "bg-muted", mark: "text-muted-foreground" },
  warning: { label: "Warning", icon: TriangleAlertIcon, box: "bg-amber-500/15", mark: "text-amber-700 dark:text-amber-300" },
  decision: { label: "Decision", icon: CircleCheckIcon, box: "bg-green-600/10", mark: "text-green-700 dark:text-green-300" },
}

/**
 * Callout: a tinted box of words with its kind's icon. In the editor the icon itself opens the
 * menu that changes the kind, so the bin is the only button in the corner, where every other
 * block has its own (Tyler, 5 Nov 2026: "the icons are not aligned").
 */
export function CalloutFrame({
  kind,
  editing,
  onKind,
  children,
}: {
  kind: CalloutKind
  editing: BlockEditing
  onKind?: (kind: CalloutKind) => void
  children: React.ReactNode
}) {
  const look = CALLOUTS[kind] ?? CALLOUTS.note
  const Icon = look.icon
  return (
    <>
      <div className={cn("flex gap-2.5 rounded-md px-3 py-2.5", editing.editable && "pr-11", look.box, SELECTED)}>
        {editing.editable ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    contentEditable={false}
                    aria-label={`${look.label}. Change the kind of callout`}
                    className="-m-1 mt-0 h-fit shrink-0 rounded-sm p-1 outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className={cn("size-4", look.mark)} aria-hidden />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Note, Warning or Decision</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              {(Object.keys(CALLOUTS) as CalloutKind[]).map((each) => (
                <DropdownMenuCheckboxItem key={each} checked={each === kind} onCheckedChange={() => onKind?.(each)}>
                  {CALLOUTS[each].label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Icon className={cn("mt-1 size-4 shrink-0", look.mark)} aria-label={look.label} />
        )}
        {/* The box's own words: its last paragraph's gap would make the box look bottom-heavy. */}
        <div className="min-w-0 flex-1 [&_ol]:mb-0! [&_p:last-child]:mb-0! [&_ul]:mb-0!">{children}</div>
      </div>
      <BlockTools editing={editing} label="Remove callout" />
    </>
  )
}

/** Fold section: a heading line with an arrow that hides or shows what's under it, for this reader only. */
export function FoldHeading({ id, editing, children }: { id: string; editing: BlockEditing; children: React.ReactNode }) {
  const folded = useFolded(id)
  return (
    <>
      <div className={cn("flex items-start gap-1 rounded-md", editing.editable && "pr-10", SELECTED)}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-expanded={!folded}
          aria-label={folded ? "Show what's under this heading" : "Hide what's under this heading"}
          className="mt-0.5 shrink-0"
          // Pressing the arrow must not move the cursor into the heading.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleFold(id)}
        >
          <ChevronRightIcon className={cn("size-4 transition-transform motion-reduce:transition-none", !folded && "rotate-90")} />
        </Button>
        <div className="min-w-0 flex-1 text-[1.1em] leading-snug font-semibold [&>*]:py-1">{children}</div>
      </div>
      {/* Level with the arrow, which sits 2px down. */}
      <BlockTools editing={editing} label="Remove fold section" top="top-0.5" />
    </>
  )
}
