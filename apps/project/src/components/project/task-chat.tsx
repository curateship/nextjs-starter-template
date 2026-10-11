import * as React from "react"
import { MoreHorizontalIcon, SendIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import type { Change } from "@/components/project/task-body"
import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  addTaskComment,
  deleteTaskComment,
  editTaskComment,
  type TaskComment,
  type TaskDetail,
} from "@/lib/api/project/tasks"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { messageParts, messageText, tagPeople, tagQueryBefore } from "@/lib/project/mentions"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Person = TaskDetail["assignable"][number]

/**
 * The task's chat: messages oldest at the top and newest at the bottom, with
 * the box to write in under them. Enter sends and Shift+Enter starts a new
 * line. Typing @ lists the project's members, and picking one tags them, which
 * sends them "Anna asked you about a task". The rules are in
 * `workspace/docs/task-chat.md`.
 */
export function TaskChatCard({
  detail,
  myUserId,
  readOnly,
  change,
}: {
  detail: TaskDetail
  myUserId: string
  readOnly: boolean
  change: Change
}) {
  const [text, setText] = React.useState("")
  const [sending, setSending] = React.useState(false)
  // A ref as well as the state: two Enters in one frame both see the old state.
  const inFlight = React.useRef(false)
  const end = React.useRef<HTMLDivElement>(null)
  const people = detail.assignable
  const count = detail.comments.length

  // The newest message is at the bottom, so the chat opens scrolled there and
  // follows each new one.
  React.useEffect(() => {
    const viewport = end.current?.closest<HTMLElement>("[data-slot=scroll-area-viewport]")
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [count])

  async function send() {
    if (inFlight.current) return
    const sent = text
    const next = sent.trim()
    if (!next) {
      showErrorToast("Write the message first.")
      return
    }
    inFlight.current = true
    setSending(true)
    const ok = await change(() =>
      addTaskComment({ taskId: detail.task.id, body: tagPeople(next, people) })
    )
    inFlight.current = false
    setSending(false)
    // Only the words that went out are cleared; anything typed meanwhile stays.
    if (ok) setText((current) => (current === sent ? "" : current))
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages yet.{readOnly ? "" : " Type @ to ask someone on the project about this task."}
          </p>
        ) : (
          <ScrollArea viewportClassName="max-h-96">
            <ul className="grid gap-3 pr-3" aria-label="Messages">
              {detail.comments.map((comment) => (
                <MessageRow key={comment.id} comment={comment} people={people} change={change} />
              ))}
            </ul>
            <div ref={end} />
          </ScrollArea>
        )}
        {readOnly ? null : (
          <MessageBox
            id="task-chat-message"
            label="Message"
            value={text}
            onChange={setText}
            people={people.filter((person) => person.id !== myUserId)}
            busy={sending}
            submitLabel="Send"
            onSubmit={() => void send()}
          />
        )}
      </CardContent>
    </Card>
  )
}

function MessageRow({
  comment,
  people,
  change,
}: {
  comment: TaskComment
  people: Person[]
  change: Change
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const inFlight = React.useRef(false)
  const name = comment.author?.name ?? "Former member"

  async function work(task: () => Promise<unknown>, successText?: string) {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    const ok = await change(task, successText)
    inFlight.current = false
    setBusy(false)
    return ok
  }

  async function saveEdit() {
    const next = draft.trim()
    if (!next) {
      showErrorToast("A message can't be empty. Delete it instead.")
      return
    }
    const ok = await work(() =>
      editTaskComment({ commentId: comment.id, body: tagPeople(next, people) })
    )
    if (ok) setEditing(false)
  }

  return (
    <li className="flex gap-3">
      <PersonAvatar name={name} avatarUrl={comment.author?.avatarUrl} />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span> ·{" "}
          <time dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)}>
            {formatTimeAgo(comment.createdAt)}
          </time>
          {comment.editedAt && !comment.deleted ? " · edited" : ""}
        </p>
        {comment.deleted ? (
          <p className="text-sm text-muted-foreground italic">Message deleted</p>
        ) : editing ? (
          <MessageBox
            id={`edit-${comment.id}`}
            label="Edit your message"
            value={draft}
            onChange={setDraft}
            people={people}
            busy={busy}
            submitLabel="Save changes"
            autoFocus
            onSubmit={() => void saveEdit()}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="text-sm break-words whitespace-pre-wrap">
            <MessageWords body={comment.body} people={people} />
          </p>
        )}
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Delete this message for everyone?</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() =>
                void work(() => deleteTaskComment(comment.id), "Message deleted.").then((ok) => {
                  if (ok) setConfirmDelete(false)
                })
              }
            >
              Delete message
            </Button>
          </div>
        ) : null}
      </div>
      {(comment.canEdit || comment.canDelete) && !editing && !confirmDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Options for ${name}'s message`}>
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {comment.canEdit ? (
              <DropdownMenuItem
                onSelect={() => {
                  setDraft(messageText(comment.body))
                  setEditing(true)
                }}
              >
                <SettingsIcon />
                Edit
              </DropdownMenuItem>
            ) : null}
            {comment.canDelete ? (
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  )
}

/** A message's words with each tag drawn as the person's current name. */
function MessageWords({ body, people }: { body: string; people: Person[] }) {
  return messageParts(body).map((part, index) =>
    part.kind === "text" ? (
      <React.Fragment key={index}>{part.text}</React.Fragment>
    ) : (
      <span key={index} className="font-medium text-primary">
        @{people.find((person) => person.id === part.userId)?.name ?? part.name}
      </span>
    )
  )
}

function matchesName(name: string, typed: string) {
  const lower = name.toLowerCase()
  const query = typed.toLowerCase()
  return lower.startsWith(query) || lower.split(/\s+/).some((word) => word.startsWith(query))
}

/**
 * The box a message is written in, with the @ list. The list sits above the
 * box and follows the arrow keys; Enter or Tab picks, Escape closes it.
 */
function MessageBox({
  id,
  label,
  value,
  onChange,
  people,
  busy,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  people: Person[]
  busy: boolean
  submitLabel: string
  autoFocus?: boolean
  onSubmit: () => void
  onCancel?: () => void
}) {
  const box = React.useRef<HTMLTextAreaElement>(null)
  const [tag, setTag] = React.useState<{ typed: string; start: number } | null>(null)
  const [active, setActive] = React.useState(0)
  const matches = tag ? people.filter((person) => matchesName(person.name, tag.typed)).slice(0, 8) : []
  const listOpen = matches.length > 0
  const listId = `${id}-people`

  function readTag(area: HTMLTextAreaElement) {
    const cursor = area.selectionStart
    const typed = tagQueryBefore(area.value.slice(0, cursor))
    setTag(typed === null ? null : { typed, start: cursor - typed.length - 1 })
    setActive(0)
  }

  function pick(person: Person) {
    const area = box.current
    if (!area || !tag) return
    const inserted = `@${person.name} `
    onChange(value.slice(0, tag.start) + inserted + value.slice(area.selectionStart))
    const cursor = tag.start + inserted.length
    setTag(null)
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {listOpen ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="People on the project"
            className="absolute bottom-full left-0 z-10 mb-1 grid w-64 max-w-full gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {matches.map((person, index) => (
              <li
                key={person.id}
                id={`${listId}-${person.id}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                  index === active && "bg-accent text-accent-foreground"
                )}
                // Picked on press so the box keeps the cursor.
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(person)
                }}
              >
                <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
                <span className="truncate">{person.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            ref={box}
            id={id}
            rows={1}
            value={value}
            maxLength={LIMITS.comment}
            autoFocus={autoFocus}
            placeholder="Write a message. Type @ to tag someone."
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={listOpen ? `${listId}-${matches[active]?.id}` : undefined}
            className="max-h-48"
            onChange={(event) => {
              onChange(event.target.value)
              readTag(event.target)
            }}
            onClick={(event) => readTag(event.currentTarget)}
            onBlur={() => setTag(null)}
            onKeyDown={(event) => {
              if (listOpen) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault()
                  const step = event.key === "ArrowDown" ? 1 : -1
                  setActive((current) => (current + step + matches.length) % matches.length)
                  return
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault()
                  pick(matches[active])
                  return
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  event.stopPropagation()
                  setTag(null)
                  return
                }
              }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                onSubmit()
              }
              if (event.key === "Escape" && onCancel) {
                event.preventDefault()
                event.stopPropagation()
                onCancel()
              }
            }}
          />
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="button" disabled={busy} onClick={onSubmit}>
            {onCancel ? null : <SendIcon className="size-4" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
