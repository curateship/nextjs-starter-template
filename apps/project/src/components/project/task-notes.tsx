import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { HistoryIcon, ListTodoIcon, Loader2Icon, PlusIcon, SettingsIcon } from "lucide-react"

import { WrittenPageBody } from "@/components/pages/written-page-body"
import {
  notesTaskLinks,
  type NotesLinkTyping,
} from "@/components/project/task-link-extension"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
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
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { findLinkableTasks, type LinkChoice } from "@/lib/api/project/chat"
import { bringBackNoteVersion, loadNoteVersions, type NoteVersion } from "@/lib/api/project/tasks"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  linkedTaskOf,
  notesForDisplay,
  notesForEditor,
  readTaskNotes,
  taskNotesAreEmpty,
} from "@/lib/project/notes"
import { taskHref } from "@/lib/project/notices"
import type { Change } from "@/components/project/task-body"
import { cn } from "@/lib/utils"

/**
 * A task's notes: read as formatted text with links that open in a new tab,
 * and written in the shared editor (select words for bold, lists and links).
 * Edits save when the editor is left and when Done is pressed. Notes written
 * before 10 Oct 2026 are plain text and show exactly as typed until edited.
 *
 * On a task (`task`), typing # links another task, a link to a task opens it
 * here, and "Earlier versions" lists the notes as they were before each
 * editing session, with Bring back.
 */
export function TaskNotesField({
  notes,
  readOnly,
  onSave,
  label = "Notes",
  labelId = "task-notes-label",
  task,
}: {
  notes: string
  readOnly: boolean
  /** `session` is this editing session, which keeps one earlier version however often it saves. */
  onSave: (notes: WrittenPageNode, session: string) => Promise<boolean>
  /** A task type's notes outline uses the same field under its own name. */
  label?: string
  labelId?: string
  /** A task's own notes, rather than a type's starting notes. */
  task?: { id: string; links: Record<string, string>; change: Change }
}) {
  const navigate = useNavigate()
  const saved = readTaskNotes(notes)
  const [editing, setEditing] = React.useState(false)
  const [session, setSession] = React.useState("")
  const [versionsOpen, setVersionsOpen] = React.useState(false)
  // Null until something is typed, so leaving an untouched editor saves nothing.
  const [draft, setDraft] = React.useState<WrittenPageNode | null>(null)
  const editorBox = React.useRef<HTMLDivElement>(null)
  const linking = useNotesLinking(Boolean(task))

  // The editor draws itself a moment after it mounts, so the cursor goes in
  // once its writing area exists.
  React.useEffect(() => {
    if (!editing) return
    let tries = 0
    const timer = window.setInterval(() => {
      const area = editorBox.current?.querySelector<HTMLElement>(".tiptap")
      tries += 1
      if (area || tries > 20) window.clearInterval(timer)
      area?.focus()
    }, 25)
    return () => window.clearInterval(timer)
  }, [editing])

  function startEditing() {
    setSession(crypto.randomUUID())
    setEditing(true)
  }

  async function save() {
    if (!draft) return true
    const ok = await onSave(draft, session)
    if (ok) setDraft(null)
    return ok
  }

  // Done spins while the notes save, and a second press waits for the first.
  const [finishing, setFinishing] = React.useState(false)
  async function finish() {
    if (finishing) return
    setFinishing(true)
    const ok = await save()
    setFinishing(false)
    if (ok) setEditing(false)
  }

  return (
    <div className="grid gap-2" role="group" aria-labelledby={labelId}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <Label id={labelId} asChild>
          <span>{label}</span>
        </Label>
        <div className="flex items-center gap-1">
          {task && !editing ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setVersionsOpen(true)}>
              <HistoryIcon className="size-4" />
              Earlier versions
            </Button>
          ) : null}
          {readOnly ? null : editing ? (
            <Button type="button" variant="outline" size="sm" disabled={finishing} onClick={() => void finish()}>
              {finishing ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Done
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={startEditing}>
              {taskNotesAreEmpty(saved) ? (
                <>
                  <PlusIcon className="size-4" />
                  Add notes
                </>
              ) : (
                <>
                  <SettingsIcon className="size-4" />
                  Edit notes
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        <div
          ref={editorBox}
          data-notes-editor=""
          className="relative [&_.page-rte_.tiptap]:min-h-28 [&_.page-rte_.tiptap]:px-3 [&_.page-rte_.tiptap]:py-2 [&_.page-rte_.tiptap]:text-sm"
          onBlur={(event) => {
            const next = event.relatedTarget
            // The link box opens outside this box, so moving into it isn't leaving.
            if (next instanceof Element && (event.currentTarget.contains(next) || next.closest("[data-slot=popover-content]"))) {
              return
            }
            void save()
          }}
        >
          <DocumentEditor
            value={notesForEditor(saved)}
            onChange={setDraft}
            extensions={linking.extensions}
            placeholder={
              task
                ? "Anything the person doing it should know. Select words for bold, a list or a link. Type # to link a task."
                : "Anything the person doing it should know. Select words to make them bold, a list or a link."
            }
          />
          {linking.list}
        </div>
      ) : taskNotesAreEmpty(saved) ? (
        <p className="text-sm text-muted-foreground">No notes.</p>
      ) : saved.kind === "text" ? (
        <p className="text-sm break-words whitespace-pre-wrap">{saved.text}</p>
      ) : (
        <div
          className="break-words"
          // Links in notes open in a new tab, so the task stays where it is. A
          // link to a task opens that task here instead.
          onClickCapture={(event) => {
            const link = (event.target as Element).closest("a")
            if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return
            event.preventDefault()
            const taskId = linkedTaskOf(link.getAttribute("href") ?? "")
            const projectId = taskId ? task?.links[taskId] : undefined
            if (taskId && projectId) {
              void navigate({ to: "/projects/$projectId", params: { projectId }, search: { task: taskId } })
            } else if (!taskId) {
              window.open(link.href, "_blank", "noopener,noreferrer")
            }
          }}
        >
          <WrittenPageBody body={notesForDisplay(saved.body, task?.links ?? {})} />
        </div>
      )}
      {task ? (
        <NoteVersionsDialog
          open={versionsOpen}
          taskId={task.id}
          readOnly={readOnly}
          change={task.change}
          onClose={() => setVersionsOpen(false)}
        />
      ) : null}
    </div>
  )
}

/** How long typing after # pauses before the tasks are looked up. */
const FIND_DELAY_MS = 200
/** The list's width, w-72, so it never hangs past the editor's right edge. */
const LIST_WIDTH = 288

/**
 * The # list inside the notes editor: the editor reports what is typed after
 * a #, this looks the tasks up and draws them under it, and a pick puts the
 * task's title in the notes as a link to the task.
 */
function useNotesLinking(on: boolean) {
  const [typing, setTyping] = React.useState<NotesLinkTyping | null>(null)
  // Where the list sits inside the editor's box, worked out as the # is typed.
  const [place, setPlace] = React.useState({ left: 0, top: 0 })
  const [found, setFound] = React.useState<{ typed: string; tasks: LinkChoice[] } | null>(null)
  const [active, setActive] = React.useState(0)
  const shown = typing && found?.typed === typing.typed ? found.tasks : []

  function pick(task: LinkChoice) {
    if (!typing) return
    typing.editor
      .chain()
      .focus()
      .insertContentAt({ from: typing.from, to: typing.to }, [
        { type: "text", text: task.title, marks: [{ type: "link", attrs: { href: taskHref(task.projectId, task.id) } }] },
        { type: "text", text: " " },
      ])
      .run()
    setTyping(null)
  }

  // The editor is made once with these extensions, so they call through to
  // handlers swapped in after every render, which see the list as it is now.
  const [wiring] = React.useState(() => {
    let handlers: Parameters<typeof notesTaskLinks>[0] = { onTyping: () => undefined, onKey: () => false }
    return {
      extensions: on
        ? [
            notesTaskLinks({
              onTyping: (next) => handlers.onTyping(next),
              onKey: (key) => handlers.onKey(key),
            }),
          ]
        : [],
      use: (next: typeof handlers) => {
        handlers = next
      },
    }
  })
  React.useEffect(() => {
    wiring.use({
      onTyping: (next) => {
        setTyping(next)
        setActive(0)
        const frame = next?.editor.view.dom.closest("[data-notes-editor]")?.getBoundingClientRect()
        if (next && frame) {
          setPlace({
            left: Math.max(0, Math.min(next.left - frame.left, frame.width - LIST_WIDTH)),
            top: next.bottom - frame.top,
          })
        }
      },
      onKey: (key) => {
        if (shown.length === 0) return false
        if (key === "close") setTyping(null)
        else if (key === "pick") pick(shown[active])
        else setActive((active + (key === "down" ? 1 : -1) + shown.length) % shown.length)
        return true
      },
    })
  })
  const extensions = wiring.extensions

  const query = typing?.typed ?? null
  React.useEffect(() => {
    if (query === null) return
    let live = true
    const timer = window.setTimeout(() => {
      findLinkableTasks(query).then(
        (tasks) => live && setFound({ typed: query, tasks }),
        () => live && setFound({ typed: query, tasks: [] })
      )
    }, FIND_DELAY_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [query])

  const list =
    typing && shown.length ? (
      <ul
        role="listbox"
        aria-label="Tasks to link"
        className="absolute z-10 mt-1 grid w-72 max-w-full gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        style={place}
      >
        {shown.map((task, index) => (
          <li
            key={task.id}
            role="option"
            aria-selected={index === active}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
              index === active && "bg-accent text-accent-foreground"
            )}
            // Picked on press so the editor keeps the cursor.
            onMouseDown={(event) => {
              event.preventDefault()
              pick(task)
            }}
          >
            <ListTodoIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="grid min-w-0">
              <span className="truncate">{task.title}</span>
              <span className="truncate text-xs text-muted-foreground">{task.projectName}</span>
            </span>
          </li>
        ))}
      </ul>
    ) : null

  return { extensions, list }
}

/**
 * The notes as they were before each editing session, newest first, kept 20
 * deep. Bring back makes one the notes again, and the notes it replaces are
 * kept in turn, so nothing is lost either way.
 */
function NoteVersionsDialog({
  open,
  taskId,
  readOnly,
  change,
  onClose,
}: {
  open: boolean
  taskId: string
  readOnly: boolean
  change: Change
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Earlier versions</DialogTitle>
          <DialogDescription>
            The notes as they were before each edit, newest first. The last 20 are kept.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted each time the window opens, so it always shows the versions as they are now. */}
        <NoteVersionsList taskId={taskId} readOnly={readOnly} change={change} onClose={onClose} />
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoteVersionsList({
  taskId,
  readOnly,
  change,
  onClose,
}: {
  taskId: string
  readOnly: boolean
  change: Change
  onClose: () => void
}) {
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; versions: NoteVersion[] }
  >({ kind: "loading" })
  const [tries, setTries] = React.useState(0)
  const [bringing, setBringing] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    loadNoteVersions(taskId).then(
      (versions) => live && setState({ kind: "ready", versions }),
      (error: unknown) => live && setState({ kind: "error", message: getProjectErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [taskId, tries])

  async function bringBack(version: NoteVersion) {
    if (bringing) return
    setBringing(version.id)
    const ok = await change(() => bringBackNoteVersion(version.id), "Those notes are back.")
    setBringing(null)
    if (ok) onClose()
  }

  return (
    <DialogBody>
      {state.kind === "loading" ? (
        <LoadingRow label="Loading the earlier versions…" />
      ) : state.kind === "error" ? (
        <ErrorRow
          message={state.message}
          onRetry={() => {
            setState({ kind: "loading" })
            setTries((n) => n + 1)
          }}
        />
      ) : state.versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No earlier versions yet. Each time someone finishes editing the notes, the version before
          is kept here.
        </p>
      ) : (
        <ol className="grid gap-2">
          {state.versions.map((version) => (
            <li key={version.id} className="grid gap-1 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {version.savedAt ? (
                    <>
                      {version.savedBy ?? "Former member"} ·{" "}
                      <time dateTime={version.savedAt} title={formatDateTime(version.savedAt)}>
                        {formatTimeAgo(version.savedAt)}
                      </time>
                    </>
                  ) : (
                    "The notes before anyone edited them"
                  )}
                </span>
                {readOnly ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={bringing !== null}
                    onClick={() => void bringBack(version)}
                  >
                    {bringing === version.id ? <Loader2Icon className="size-4 animate-spin" /> : null}
                    Bring back
                  </Button>
                )}
              </div>
              <p className={cn("line-clamp-3 text-sm break-words", version.empty && "text-muted-foreground italic")}>
                {version.empty ? "No notes" : version.preview}
              </p>
            </li>
          ))}
        </ol>
      )}
    </DialogBody>
  )
}
