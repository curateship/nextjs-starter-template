import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import type { Editor } from "@tiptap/react"
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  HistoryIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  StrikethroughIcon,
  TextQuoteIcon,
} from "lucide-react"

import { WrittenPageBody } from "@/components/pages/written-page-body"
import { PanelCardFooter } from "@/components/project/panel-card"
import {
  notesTaskLinks,
  type NotesLinkTyping,
} from "@/components/project/task-link-extension"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
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
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { findLinkableTasks, type LinkChoice } from "@/lib/api/project/chat"
import { bringBackNoteVersion, loadNoteVersions, type NoteVersion } from "@/lib/api/project/tasks"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { emptyWrittenPageBody, type WrittenPageNode } from "@/lib/pages/written-page-body"
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
import { useTeamId } from "@/lib/project/team-scope"

/**
 * A task's notes: read as formatted text with links that open in a new tab,
 * and written in the shared editor (select words for bold, lists and links),
 * opened by Edit notes or by double-clicking the notes.
 * Edits save when the editor is left and when Done is pressed. Notes written
 * before 10 Oct 2026 are plain text and show exactly as typed until edited.
 *
 * On a task (`task`), typing # links another task, a link to a task opens it
 * here, and "Earlier versions" lists the notes as they were before each
 * editing session, with Bring back. A task's notes are written in
 * `LiveTaskNotes` below; this field draws them for someone who can only read.
 *
 * A meeting's notes use the same field, drawn line by line (`reading`) so
 * each line can become a task.
 */
export function TaskNotesField({
  notes,
  readOnly,
  onSave,
  label = "Notes",
  labelId = "task-notes-label",
  task,
  links,
  placeholder,
  reading,
  hideLabel = false,
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
  /** Tasks the notes link to that the reader can open, when they aren't a task's notes. */
  links?: Record<string, string>
  placeholder?: string
  /** Draws formatted notes for reading, in place of the plain drawing. */
  reading?: (body: WrittenPageNode) => React.ReactNode
  /** The label stays for screen readers only, under a card already called Notes. */
  hideLabel?: boolean
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
  const openable = task?.links ?? links ?? {}

  // The editor draws itself a moment after it mounts, so the cursor goes in
  // once its writing area exists. Focus alone leaves everything in it
  // selected, which the formatting bar reads as words picked and shows itself
  // over nothing (Tyler, 13 Oct 2026), so the editor itself is asked for a
  // cursor at the end, a beat later, after the window or dropdown around it
  // has moved the keyboard in.
  React.useEffect(() => {
    if (!editing) return
    let tries = 0
    let settle = 0
    const timer = window.setInterval(() => {
      const area = editorBox.current?.querySelector<HTMLElement & { editor?: Editor }>(".tiptap")
      tries += 1
      if (area || tries > 20) window.clearInterval(timer)
      if (!area) return
      area.focus()
      settle = window.setTimeout(() => {
        if (area.editor) area.editor.commands.focus("end")
      }, 30)
    }, 25)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(settle)
    }
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
    if (!ok) return
    setEditing(false)
  }

  const versionsButton = (
    <Button type="button" variant="ghost" size="sm" onClick={() => setVersionsOpen(true)}>
      <HistoryIcon className="size-4" />
      Earlier versions
    </Button>
  )
  const doneOrEdit = readOnly ? null : editing ? (
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
  )

  return (
    <div className="grid gap-2" role="group" aria-labelledby={labelId}>
      {hideLabel ? (
        <Label id={labelId} asChild className="sr-only">
          <span>{label}</span>
        </Label>
      ) : (
        <div className="flex min-h-7 items-center justify-between gap-2">
          <Label id={labelId} asChild>
            <span>{label}</span>
          </Label>
          <div className="flex items-center gap-1">
            {task && !editing ? versionsButton : null}
            {doneOrEdit}
          </div>
        </div>
      )}
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
              placeholder ??
              (task
                ? "Anything the person doing it should know. Select words for bold, a list or a link. Type # to link a task."
                : "Anything the person doing it should know. Select words to make them bold, a list or a link.")
            }
          />
          {linking.list}
        </div>
      ) : (
        // Double-clicking the notes opens them for editing (Tyler, 19 Oct 2026).
        <div onDoubleClick={readOnly ? undefined : startEditing}>
          {taskNotesAreEmpty(saved) ? (
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
                const projectId = taskId ? openable[taskId] : undefined
                if (taskId && projectId) {
                  void navigate({ to: "/projects/$projectId", params: { projectId }, search: { task: taskId } })
                } else if (!taskId) {
                  window.open(link.href, "_blank", "noopener,noreferrer")
                }
              }}
            >
              {reading ? (
                reading(notesForDisplay(saved.body, openable))
              ) : (
                <WrittenPageBody body={notesForDisplay(saved.body, openable)} />
              )}
            </div>
          )}
        </div>
      )}
      {/* Under a Notes card the buttons are the card's footer, behind its cog
          (Tyler, 14 Oct 2026): Edit notes at the left, Earlier versions at the
          right, and Done while writing whatever the cog says. Below the notes,
          so the formatting bar over the first line never sits on Done. */}
      {hideLabel ? (
        // Each button stretches, so together they fill the footer with no gap
        // between them, wrapping onto a second row in a narrow panel (Tyler, 20 Oct 2026).
        <PanelCardFooter always={editing} className={editing ? "justify-end" : "[&>button]:flex-1"}>
          {doneOrEdit}
          {task && !editing ? versionsButton : null}
        </PanelCardFooter>
      ) : null}
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

/** How long the notes wait after the last key before saving themselves. */
const LIVE_SAVE_DELAY_MS = 1000

/** What the task panel's header and ⋮ ask of the notes under them. */
export type NotesHandle = { showVersions: () => void; askDelete: () => void }

/**
 * A task's own notes, always open to write in, like a note in the Note app
 * (Tyler, 28 Oct 2026, Misc 4: `assets/pasted-image-1793200989332143000.png`).
 * Click and type: the notes save a second after the typing stops and again as
 * the box is left, with no Edit or Done. Each spell of writing, from clicking
 * in to clicking away, keeps one earlier version however often it saves.
 *
 * In the task panel (`panel`) the notes are the panel's own body, straight
 * under the task's title as a note's words sit under its name, with no card or
 * label; the header's pencil shows the text toolbar (`toolbar`) and its ⋮
 * reaches Earlier versions and Delete through `handle`. In the Team
 * dashboard's window they sit among the fields under a Notes label.
 *
 * Saved notes that change while nobody is writing here (another person's
 * edit, Bring back, Delete) are drawn fresh; while someone is writing, their
 * words are never replaced. In the box a click places the cursor, so a link
 * opens with Cmd-click (Ctrl-click off a Mac). Someone who can't change the
 * task reads the notes as before.
 */
export function LiveTaskNotes({
  notes,
  readOnly,
  onSave,
  task,
  panel = false,
  toolbar = false,
  handle,
}: {
  notes: string
  readOnly: boolean
  onSave: (notes: WrittenPageNode, session: string) => Promise<boolean>
  task: { id: string; links: Record<string, string>; change: Change }
  panel?: boolean
  toolbar?: boolean
  handle?: React.Ref<NotesHandle>
}) {
  const navigate = useNavigate()
  const linking = useNotesLinking(true)
  const [versionsOpen, setVersionsOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  // Drawn again from the saved notes whenever this changes.
  const [drawn, setDrawn] = React.useState({ notes, version: 0 })
  const editorBox = React.useRef<HTMLDivElement>(null)
  // In the box, or typed words not yet saved: the saved notes wait to be drawn.
  const [writing, setWriting] = React.useState(false)
  const [unsaved, setUnsaved] = React.useState(false)
  const draft = React.useRef<WrittenPageNode | null>(null)
  const session = React.useRef("")
  const timer = React.useRef(0)
  // One save at a time, in the order typed.
  const saving = React.useRef<Promise<unknown>>(Promise.resolve())
  const save = React.useRef(onSave)
  React.useEffect(() => {
    save.current = onSave
  })
  React.useImperativeHandle(handle, () => ({
    showVersions: () => setVersionsOpen(true),
    askDelete: () => setConfirmDelete(true),
  }))

  if (notes !== drawn.notes && !writing && !unsaved) {
    setDrawn({ notes, version: drawn.version + 1 })
  }

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const next = draft.current
    if (!next) return
    const spell = session.current || crypto.randomUUID()
    saving.current = saving.current.then(async () => {
      const ok = await save.current(next, spell)
      // A newer draft typed while this one saved stays to be saved itself.
      if (ok && draft.current === next) {
        draft.current = null
        setUnsaved(false)
      }
    })
  }, [])

  // Moving to another task, or away from the page, saves what was typed.
  React.useEffect(() => flush, [flush])

  function changed(body: WrittenPageNode) {
    draft.current = body
    setUnsaved(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, LIVE_SAVE_DELAY_MS)
  }

  // Waits behind any save still on its way, so a late save can't bring the notes back.
  async function deleteNotes() {
    setDeleting(true)
    window.clearTimeout(timer.current)
    draft.current = null
    setUnsaved(false)
    const emptied = saving.current.then(() => save.current(emptyWrittenPageBody(), crypto.randomUUID()))
    saving.current = emptied
    const ok = await emptied
    setDeleting(false)
    if (ok) setConfirmDelete(false)
  }

  const versions = (
    <NoteVersionsDialog
      open={versionsOpen}
      taskId={task.id}
      readOnly={readOnly}
      change={task.change}
      onClose={() => setVersionsOpen(false)}
    />
  )

  if (readOnly) {
    if (!panel) return <TaskNotesField notes={notes} readOnly onSave={onSave} task={task} />
    return (
      <div className="px-1">
        <TaskNotesField notes={notes} readOnly onSave={onSave} task={task} hideLabel />
        {versions}
      </div>
    )
  }

  return (
    <div className="grid gap-2" role="group" aria-labelledby="task-notes-label">
      {panel ? (
        <Label id="task-notes-label" asChild className="sr-only">
          <span>Notes</span>
        </Label>
      ) : (
        <div className="flex min-h-7 items-center justify-between gap-2">
          <Label id="task-notes-label" asChild>
            <span>Notes</span>
          </Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setVersionsOpen(true)}>
            <HistoryIcon className="size-4" />
            Earlier versions
          </Button>
        </div>
      )}
      {panel && toolbar ? <NotesToolbar box={editorBox} /> : null}
      <div
        ref={editorBox}
        data-notes-editor=""
        className={cn(
          "relative",
          // A plain writing area, no box: the panel around it is the note.
          "[&>div:first-of-type]:rounded-none [&>div:first-of-type]:border-0 [&>div:first-of-type]:bg-transparent",
          // The Note app's writing: 15px with room to breathe.
          "[&_.page-rte_.tiptap]:!text-[0.9375rem] [&_.page-rte_.tiptap]:!leading-[1.65]",
          // Two lines tall when empty (Tyler, 28 Oct 2026: "make the default row for the note 2 row").
          panel
            ? "[&_.page-rte_.tiptap]:!min-h-[calc(3.3em+1.25rem)] [&_.page-rte_.tiptap]:!px-1 [&_.page-rte_.tiptap]:!pt-1 [&_.page-rte_.tiptap]:!pb-4"
            : "[&_.page-rte_.tiptap]:!min-h-[3.3em] [&_.page-rte_.tiptap]:!px-0 [&_.page-rte_.tiptap]:!py-0"
        )}
        onFocus={() => {
          if (writing) return
          setWriting(true)
          session.current = crypto.randomUUID()
        }}
        onBlur={(event) => {
          const next = event.relatedTarget
          // The link box and the # list sit outside the writing area, so moving into them isn't leaving.
          if (next instanceof Element && (event.currentTarget.contains(next) || next.closest("[data-slot=popover-content]"))) {
            return
          }
          setWriting(false)
          flush()
        }}
        onClickCapture={(event) => {
          const link = (event.target as Element).closest("a")
          if (!link || !(event.metaKey || event.ctrlKey)) return
          event.preventDefault()
          const taskId = linkedTaskOf(link.getAttribute("href") ?? "")
          const projectId = taskId ? task.links[taskId] : undefined
          if (taskId && projectId) {
            void navigate({ to: "/projects/$projectId", params: { projectId }, search: { task: taskId } })
          } else if (!taskId) {
            window.open(link.href, "_blank", "noopener,noreferrer")
          }
        }}
      >
        <DocumentEditor
          key={drawn.version}
          value={notesForEditor(readTaskNotes(drawn.notes))}
          onChange={changed}
          extensions={linking.extensions}
          placeholder="Write, or type # to link a task"
        />
        {linking.list}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete these notes?"
        description="The notes are emptied for everyone on the task. They are kept in Earlier versions."
        confirmLabel="Delete notes"
        loading={deleting}
        onConfirm={() => void deleteNotes()}
      />
      {versions}
    </div>
  )
}

type ToolbarAction = {
  label: string
  icon: React.ReactNode
  active: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: "Bold", icon: <BoldIcon />, active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { label: "Italic", icon: <ItalicIcon />, active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  {
    label: "Strikethrough",
    icon: <StrikethroughIcon />,
    active: (e) => e.isActive("strike"),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    label: "Heading",
    icon: <Heading2Icon />,
    active: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: "Subheading",
    icon: <Heading3Icon />,
    active: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: "Bullet list",
    icon: <ListIcon />,
    active: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    icon: <ListOrderedIcon />,
    active: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Quote",
    icon: <TextQuoteIcon />,
    active: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
]

/**
 * The pencil's text toolbar, in the flow at the top of the notes so it never
 * covers a line (Tyler, 20 Oct 2026, for the Note app: "Just add an edit icon
 * here and if clicked the tool appears at the top"). Links are made by
 * selecting words, as before. A press keeps the cursor in the notes.
 */
function NotesToolbar({ box }: { box: React.RefObject<HTMLDivElement | null> }) {
  const [editor, setEditor] = React.useState<Editor | null>(null)
  const [, redraw] = React.useReducer((n: number) => n + 1, 0)

  // The editor draws itself a moment after it mounts, so it is looked for until it is there.
  React.useEffect(() => {
    let found: Editor | null = null
    const timer = window.setInterval(() => {
      const area = box.current?.querySelector<HTMLElement & { editor?: Editor }>(".tiptap")
      if (!area?.editor) return
      window.clearInterval(timer)
      found = area.editor
      found.on("transaction", redraw)
      setEditor(found)
    }, 25)
    return () => {
      window.clearInterval(timer)
      found?.off("transaction", redraw)
    }
  }, [box])

  return (
    <div role="toolbar" aria-label="Text" className="flex flex-wrap items-center gap-0.5 rounded-md border px-1 py-0.5">
      {TOOLBAR_ACTIONS.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={action.label}
          aria-pressed={editor ? action.active(editor) : false}
          disabled={!editor}
          className="aria-pressed:bg-muted"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor && action.run(editor)}
        >
          {action.icon}
        </Button>
      ))}
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
  const teamId = useTeamId()
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
      findLinkableTasks(query, teamId).then(
        (tasks) => live && setFound({ typed: query, tasks }),
        () => live && setFound({ typed: query, tasks: [] })
      )
    }, FIND_DELAY_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [query, teamId])

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
