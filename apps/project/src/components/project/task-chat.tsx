import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  FileIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PlaneIcon,
  ReplyIcon,
  SendIcon,
  SettingsIcon,
  SmilePlusIcon,
  Trash2Icon,
  VoteIcon,
  XIcon,
} from "lucide-react"

import { PollChoices, PollDialog } from "@/components/project/chat-poll"
import type { Change } from "@/components/project/task-body"
import { SmallPicture } from "@/components/project/task-files-card"
import { TagTextarea, TaggedWords, type TaskLinking } from "@/components/project/tag-textarea"
import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  deleteChatMessage,
  editChatMessage,
  findLinkableTasks,
  reactToChatMessage,
  sendChatMessage,
  type ChatMessage,
  type LinkChoice,
} from "@/lib/api/project/chat"
import type { TaskDetail, TaskFile } from "@/lib/api/project/tasks"
import type { PersonRoom } from "@/lib/api/project/team-running"
import { formatFileSize } from "@/lib/format/format-bytes"
import { plural } from "@/lib/format/plural"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { dayLabel } from "@/lib/project/days"
import { taskFileHref } from "@/lib/project/files"
import {
  PROJECT_TAG,
  messageParts,
  messageText,
  taggedUserIds,
  tagPeople,
  tokenizeMessage,
} from "@/lib/project/mentions"
import { namesLine } from "@/lib/project/names-line"
import { useOpenPerson } from "@/lib/project/person-pages"
import { LIMITS, REACTIONS, REACTION_LOOK, type ChatPlace, type Reaction } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

export type ChatPerson = { id: string; name: string; avatarUrl: string }

/**
 * A task's chat: messages oldest at the top and newest at the bottom, with
 * the box to write in under them. The rules are in `workspace/docs/task-chat.md`.
 */
export function TaskChatCard({
  detail,
  myUserId,
  readOnly,
  change,
  room,
}: {
  detail: TaskDetail
  myUserId: string
  readOnly: boolean
  change: Change
  /** Who is away, so a tag of someone on time off says so before sending. */
  room: Record<string, PersonRoom>
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ChatThread
          chat={{ taskId: detail.task.id }}
          messages={detail.comments}
          people={detail.assignable}
          myUserId={myUserId}
          readOnly={readOnly}
          change={change}
          room={room}
          fileRoom={LIMITS.filesPerTask - detail.fields.fileCount}
          emptyText={`No messages yet.${readOnly ? "" : " Type @ to ask someone on the project about this task."}`}
          listClassName="max-h-96"
        />
      </CardContent>
    </Card>
  )
}

/**
 * One chat: a task's, or a project's own. Enter sends and Shift+Enter starts
 * a new line. Typing @ lists the project's members and # lists tasks to link.
 * The paperclip, or dropping files on the box, sends files with the message.
 * Each message has five reactions, a Reply that quotes it, and Edit and
 * Delete for whoever may.
 */
export function ChatThread({
  chat,
  messages,
  people,
  myUserId,
  readOnly,
  change,
  room,
  fileRoom,
  emptyText,
  listClassName,
  fill = false,
  earlier,
}: {
  chat: ChatPlace
  messages: ChatMessage[]
  /** The project's members, who can be tagged. */
  people: ChatPerson[]
  myUserId: string
  readOnly: boolean
  change: Change
  room: Record<string, PersonRoom>
  /** How many more files the task can hold; null when there is no count (a project's chat). */
  fileRoom: number | null
  emptyText: string
  /** Caps the list's height inside a card. */
  listClassName?: string
  /** The list fills the panel and the box sits at its bottom. */
  fill?: boolean
  /** "Show earlier messages", above the oldest one loaded. */
  earlier?: React.ReactNode
}) {
  const navigate = useNavigate()
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null)
  const [flash, setFlash] = React.useState<string | null>(null)
  const list = React.useRef<HTMLDivElement>(null)
  const nearBottom = React.useRef(true)
  const box = React.useRef<HTMLTextAreaElement>(null)
  const lastId = messages.at(-1)?.id
  const lastIsMine = messages.at(-1)?.author?.id === myUserId
  const firstId = messages[0]?.id
  const hasMessages = messages.length > 0
  const listId = React.useId()

  const viewport = () => list.current?.closest<HTMLElement>("[data-slot=scroll-area-viewport]") ?? null

  // Remember whether the reader is at the bottom, so a new message from
  // someone else only scrolls the chat when they were already there.
  React.useEffect(() => {
    const area = viewport()
    if (!area) return
    const onScroll = () => {
      nearBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80
    }
    area.addEventListener("scroll", onScroll, { passive: true })
    return () => area.removeEventListener("scroll", onScroll)
  }, [hasMessages])

  // The newest message is at the bottom, so the chat opens scrolled there and
  // follows each new one: always for my own, otherwise only from the bottom.
  React.useLayoutEffect(() => {
    const area = viewport()
    if (!area || !lastId) return
    if (nearBottom.current || lastIsMine) area.scrollTop = area.scrollHeight
  }, [lastId, lastIsMine])

  // Earlier messages slide in above, so what was on screen stays put.
  const height = React.useRef(0)
  React.useLayoutEffect(() => {
    const area = viewport()
    if (!area) return
    if (height.current && !nearBottom.current) area.scrollTop += area.scrollHeight - height.current
    height.current = area.scrollHeight
  }, [firstId])

  const openTask = React.useCallback(
    (projectId: string, taskId: string) =>
      void navigate({ to: "/projects/$projectId", params: { projectId }, search: { task: taskId } }),
    [navigate]
  )

  function jumpTo(messageId: string) {
    const target = document.getElementById(`${listId}-${messageId}`)
    if (!target) {
      showErrorToast("That message is further back. Show earlier messages to find it.")
      return
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" })
    setFlash(messageId)
    window.setTimeout(() => setFlash((current) => (current === messageId ? null : current)), 2000)
  }

  const rows = (
    <ul className="grid gap-3 pr-3" aria-label="Messages">
      {messages.map((message) => (
        <MessageRow
          key={message.id}
          domId={`${listId}-${message.id}`}
          flash={flash === message.id}
          message={message}
          people={people}
          room={room}
          readOnly={readOnly}
          change={change}
          inTask={"taskId" in chat}
          onReply={() => {
            setReplyTo(message)
            box.current?.focus()
          }}
          onJump={jumpTo}
          onOpenTask={openTask}
        />
      ))}
    </ul>
  )

  const composer = readOnly ? null : (
    <Composer
      chat={chat}
      people={people.filter((person) => person.id !== myUserId)}
      room={room}
      change={change}
      fileRoom={fileRoom}
      replyTo={replyTo}
      onClearReply={() => setReplyTo(null)}
      boxRef={box}
    />
  )

  if (fill) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
          <div ref={list} className="grid gap-3 p-3">
            {earlier}
            {messages.length === 0 ? <p className="text-sm text-muted-foreground">{emptyText}</p> : rows}
          </div>
        </ScrollArea>
        {composer ? <div className="border-t p-3">{composer}</div> : null}
      </div>
    )
  }
  return (
    <>
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ScrollArea viewportClassName={listClassName}>
          <div ref={list} className="grid gap-3">
            {earlier}
            {rows}
          </div>
        </ScrollArea>
      )}
      {composer}
    </>
  )
}

/** The # list's lookups, the same for every box. */
function useTaskLinking(onPick: (task: LinkChoice) => void): TaskLinking {
  const latest = React.useRef(onPick)
  React.useEffect(() => {
    latest.current = onPick
  })
  return React.useMemo(() => ({ find: findLinkableTasks, onPick: (task) => latest.current(task) }), [])
}

function Composer({
  chat,
  people,
  room,
  change,
  fileRoom,
  replyTo,
  onClearReply,
  boxRef,
}: {
  chat: ChatPlace
  people: ChatPerson[]
  room: Record<string, PersonRoom>
  change: Change
  fileRoom: number | null
  replyTo: ChatMessage | null
  onClearReply: () => void
  boxRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [text, setText] = React.useState("")
  const [files, setFiles] = React.useState<File[]>([])
  const [links, setLinks] = React.useState<LinkChoice[]>([])
  const [sending, setSending] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [polling, setPolling] = React.useState(false)
  // A ref as well as the state: two Enters in one frame both see the old state.
  const inFlight = React.useRef(false)
  const input = React.useRef<HTMLInputElement>(null)
  const linking = useTaskLinking((task) => setLinks((current) => [...current, task]))
  const id = "taskId" in chat ? "task-chat-message" : "project-chat-message"

  function attach(picked: File[]) {
    if (picked.length === 0) return
    const fitting = picked.filter((file) => {
      if (file.size <= LIMITS.fileBytes) return true
      showErrorToast(
        `"${file.name}" is ${formatFileSize(file.size)}. A file can be at most ${formatFileSize(LIMITS.fileBytes)}.`
      )
      return false
    })
    const space = Math.min(LIMITS.filesPerMessage, fileRoom ?? Infinity) - files.length
    if (space <= 0) {
      showErrorToast(
        fileRoom !== null && fileRoom <= files.length
          ? `This task has ${LIMITS.filesPerTask} files. Delete one to add another.`
          : `A message can carry at most ${LIMITS.filesPerMessage} files. Send the rest in another message.`
      )
      return
    }
    if (fitting.length > space) {
      showErrorToast(`Only ${space} more ${plural(space, "file")} fit in this message, so the rest were left out.`)
    }
    setFiles((current) => [...current, ...fitting.slice(0, space)])
  }

  async function send() {
    if (inFlight.current) return
    const sent = text
    const body = tokenizeMessage(sent.trim(), [...people, PROJECT_TAG], links)
    if (!body && files.length === 0) {
      showErrorToast("Write the message or add a file first.")
      return
    }
    inFlight.current = true
    setSending(true)
    const sentFiles = files
    const sentLinks = links
    const ok = await change(
      () => sendChatMessage({ chat, body, replyToId: replyTo?.id ?? null, files: sentFiles }),
      sentFiles.length ? `${sentFiles.length} ${plural(sentFiles.length, "file")} sent.` : undefined
    )
    inFlight.current = false
    setSending(false)
    if (!ok) return
    // Only what went out is cleared; anything typed meanwhile stays.
    setText((current) => (current === sent ? "" : current))
    // Tasks picked from the # list went with it; a later "#Title" links only when picked again.
    setLinks((current) => current.filter((link) => !sentLinks.includes(link)))
    setFiles((current) => current.filter((file) => !sentFiles.includes(file)))
    onClearReply()
  }

  return (
    <div
      className={cn("grid gap-2 rounded-md", dragging && "bg-muted ring-2 ring-ring")}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        setDragging(false)
        attach([...event.dataTransfer.files])
      }}
    >
      {/* The box sits under its chat's heading, so the label is for screen readers. */}
      <Label htmlFor={id} className="sr-only">
        Message
      </Label>
      {replyTo ? (
        <div className="flex items-start gap-2 border-l-2 pl-2 text-sm">
          <div className="grid min-w-0 flex-1">
            <span className="text-xs text-muted-foreground">
              Replying to {replyTo.author?.name ?? "a former member"}
            </span>
            <span className="truncate">{messageText(replyTo.body) || "A file"}</span>
          </div>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Stop replying" onClick={onClearReply}>
            <XIcon />
          </Button>
        </div>
      ) : null}
      {files.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Files to send">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-2 text-xs">
              <FileIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Leave out ${file.name}`}
                onClick={() => setFiles((current) => current.filter((_, at) => at !== index))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <MessageBox
        id={id}
        value={text}
        onChange={setText}
        people={people}
        room={room}
        linking={linking}
        boxRef={boxRef}
        onEnter={() => void send()}
        onEscape={replyTo ? onClearReply : undefined}
        before={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Add files"
                  onClick={() => input.current?.click()}
                >
                  <PaperclipIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add files, up to {formatFileSize(LIMITS.fileBytes)} each</TooltipContent>
            </Tooltip>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              aria-label="Add files to the message"
              onChange={(event) => {
                const picked = [...(event.target.files ?? [])]
                event.target.value = ""
                attach(picked)
              }}
            />
            {"projectId" in chat ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label="New poll" onClick={() => setPolling(true)}>
                      <VoteIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ask the project a question with choices</TooltipContent>
                </Tooltip>
                <PollDialog
                  projectId={chat.projectId}
                  open={polling}
                  onClose={() => setPolling(false)}
                  change={change}
                />
              </>
            ) : null}
          </>
        }
        after={
          <Button type="button" disabled={sending} onClick={() => void send()}>
            <SendIcon className="size-4" />
            Send
          </Button>
        }
      />
    </div>
  )
}

/**
 * The box a message is written in, with the @ and # lists. A tagged person
 * on time off shows "Leo is away until Dec 4" under it before it is sent, and
 * goes when the tag is taken out. The message still sends.
 */
function MessageBox({
  id,
  value,
  onChange,
  people,
  room,
  linking,
  boxRef,
  autoFocus,
  onEnter,
  onEscape,
  before,
  after,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  people: ChatPerson[]
  room: Record<string, PersonRoom>
  linking: TaskLinking
  boxRef?: React.RefObject<HTMLTextAreaElement | null>
  autoFocus?: boolean
  onEnter: () => void
  onEscape?: () => void
  before?: React.ReactNode
  after: React.ReactNode
}) {
  const away = taggedUserIds(tagPeople(value, people)).flatMap((userId) => {
    const until = room[userId]?.awayUntil
    const person = people.find((p) => p.id === userId)
    return until && person ? [`${person.name} is away until ${dayLabel(until)}.`] : []
  })
  return (
    <>
      {/* One box, as Tyler drew it on 13 Oct 2026: the words on top, the
          paperclip at the bottom left and Send at the bottom right. */}
      <div className="grid rounded-lg border bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <TagTextarea
          id={id}
          ref={boxRef}
          rows={1}
          value={value}
          onChange={onChange}
          people={people}
          listLabel="People on the project"
          linking={linking}
          wholeProject
          maxLength={LIMITS.comment}
          autoFocus={autoFocus}
          placeholder="Write a message. Type @ to tag someone, # to link a task."
          aria-describedby={away.length ? `${id}-away` : undefined}
          className="max-h-48 min-h-16 resize-none border-0 !bg-transparent shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              onEnter()
            }
            if (event.key === "Escape" && onEscape) {
              event.preventDefault()
              event.stopPropagation()
              onEscape()
            }
          }}
        />
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          {before}
          <div className="ml-auto flex items-center gap-2">{after}</div>
        </div>
      </div>
      {away.length ? (
        // Only the dates, never the reason for the time off.
        <p id={`${id}-away`} className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <PlaneIcon className="size-4 shrink-0" aria-hidden />
          {away.join(" ")}
        </p>
      ) : null}
    </>
  )
}

function MessageRow({
  domId,
  flash,
  message,
  people,
  room,
  readOnly,
  change,
  inTask,
  onReply,
  onJump,
  onOpenTask,
}: {
  domId: string
  flash: boolean
  message: ChatMessage
  people: ChatPerson[]
  room: Record<string, PersonRoom>
  readOnly: boolean
  change: Change
  inTask: boolean
  onReply: () => void
  onJump: (messageId: string) => void
  onOpenTask: (projectId: string, taskId: string) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [dropFiles, setDropFiles] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const inFlight = React.useRef(false)
  const name = message.author?.name ?? "Former member"
  // The links already in the message stay links when its words are edited.
  const [editLinks, setEditLinks] = React.useState<LinkChoice[]>([])
  const linking = useTaskLinking((task) => setEditLinks((current) => [...current, task]))
  const fileCount = message.files.length
  // A teammate's page opens from the name, except inside a window.
  const openPerson = useOpenPerson()

  async function work(task: () => Promise<unknown>, successText?: string) {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    const ok = await change(task, successText)
    inFlight.current = false
    setBusy(false)
    return ok
  }

  function startEditing() {
    setDraft(messageText(message.body))
    setEditLinks(
      messageParts(message.body).flatMap((part) =>
        part.kind === "link" && message.links[part.taskId]
          ? [{ id: part.taskId, title: part.name, projectId: message.links[part.taskId], projectName: "" }]
          : []
      )
    )
    setEditing(true)
  }

  async function saveEdit() {
    const body = tokenizeMessage(draft.trim(), [...people, PROJECT_TAG], editLinks)
    if (!body && fileCount === 0) {
      showErrorToast("A message can't be empty. Delete it instead.")
      return
    }
    const ok = await work(() => editChatMessage({ commentId: message.id, body }))
    if (ok) setEditing(false)
  }

  async function remove() {
    const keepFiles = !dropFiles
    const ok = await work(
      () => deleteChatMessage({ commentId: message.id, keepFiles }),
      message.deleted ? `${plural(fileCount, "File")} deleted.` : "Message deleted."
    )
    if (ok) setConfirmDelete(false)
  }

  const live = !message.deleted && !readOnly
  const menu =
    !editing && !confirmDelete && (live || message.canDelete) ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Options for ${name}'s message`}>
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {live ? (
            <DropdownMenuItem onSelect={onReply}>
              <ReplyIcon />
              Reply
            </DropdownMenuItem>
          ) : null}
          {message.canEdit ? (
            <DropdownMenuItem onSelect={startEditing}>
              <SettingsIcon />
              Edit
            </DropdownMenuItem>
          ) : null}
          {message.canDelete ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                // A deleted message's only option is to delete the files it kept.
                setDropFiles(message.deleted)
                setConfirmDelete(true)
              }}
            >
              <Trash2Icon />
              {message.deleted ? `Delete its ${plural(fileCount, "file")}` : "Delete"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null

  const author = message.author
  return (
    <li
      id={domId}
      className={cn("flex gap-3 rounded-md transition-colors", flash && "bg-accent")}
    >
      {author && openPerson ? (
        <button
          type="button"
          aria-label={`Open ${author.name}'s page`}
          className="self-start rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => openPerson(author.id)}
        >
          <PersonAvatar name={name} avatarUrl={author.avatarUrl} />
        </button>
      ) : (
        <PersonAvatar name={name} avatarUrl={message.author?.avatarUrl} />
      )}
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-xs text-muted-foreground">
          {author && openPerson ? (
            <button
              type="button"
              className="font-medium text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
              onClick={() => openPerson(author.id)}
            >
              {name}
            </button>
          ) : (
            <span className="font-medium text-foreground">{name}</span>
          )}{" "}
          ·{" "}
          <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
            {formatTimeAgo(message.createdAt)}
          </time>
          {message.editedAt && !message.deleted ? " · edited" : ""}
        </p>
        {message.replyTo ? (
          <button
            type="button"
            className="grid min-w-0 border-l-2 pl-2 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            aria-label={`Go to the message from ${message.replyTo.authorName} this replies to`}
            onClick={() => onJump(message.replyTo!.id)}
          >
            <span className="font-medium">{message.replyTo.authorName}</span>
            <span className={cn("truncate", message.replyTo.deleted && "italic")}>
              {message.replyTo.deleted ? "Message deleted" : message.replyTo.words || "A file"}
            </span>
          </button>
        ) : null}
        {message.deleted ? (
          <p className="text-sm text-muted-foreground italic">Message deleted</p>
        ) : editing ? (
          <div className="grid gap-2">
            <Label htmlFor={`edit-${message.id}`}>Edit your message</Label>
            <MessageBox
              id={`edit-${message.id}`}
              value={draft}
              onChange={setDraft}
              people={people}
              room={room}
              linking={linking}
              autoFocus
              onEnter={() => void saveEdit()}
              onEscape={() => setEditing(false)}
              after={
                <>
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void saveEdit()}>
                    Save changes
                  </Button>
                </>
              }
            />
          </div>
        ) : message.body ? (
          <p className="text-sm break-words whitespace-pre-wrap">
            <TaggedWords body={message.body} people={people} links={message.links} onOpenTask={onOpenTask} />
          </p>
        ) : null}
        {message.poll ? (
          <PollChoices commentId={message.id} poll={message.poll} readOnly={readOnly} change={change} />
        ) : null}
        {fileCount ? <MessageFiles files={message.files} /> : null}
        {!message.deleted ? (
          <Reactions message={message} readOnly={readOnly} change={change} />
        ) : null}
        {confirmDelete ? (
          <div className="grid gap-2 rounded-md border p-2">
            <span className="text-sm">
              {message.deleted
                ? `Delete the ${plural(fileCount, "file")} this message kept, for everyone?`
                : "Delete this message for everyone?"}
            </span>
            {fileCount && !message.deleted ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`drop-files-${message.id}`}
                  checked={dropFiles}
                  onCheckedChange={(checked) => setDropFiles(checked === true)}
                />
                <Label htmlFor={`drop-files-${message.id}`} className="font-normal">
                  Delete its {fileCount === 1 ? "file" : `${fileCount} files`} too
                  {inTask ? ", from the task's Files as well" : ""}
                </Label>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
                {message.deleted ? `Delete ${plural(fileCount, "file")}` : "Delete message"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {menu}
    </li>
  )
}

/** Pictures drawn small, opening full size; any other file is its name to download. */
function MessageFiles({ files }: { files: TaskFile[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Files">
      {files.map((file) =>
        file.picture ? (
          <li key={file.id}>
            <a
              href={taskFileHref(file.id, true)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${file.name} full size`}
              className="block"
            >
              <SmallPicture fileId={file.id} className="size-24" />
            </a>
          </li>
        ) : (
          <li key={file.id} className="min-w-0">
            <a
              href={taskFileHref(file.id)}
              download={file.name}
              className="flex max-w-64 items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-accent/40"
            >
              <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
            </a>
          </li>
        )
      )}
    </ul>
  )
}

/**
 * The reactions under a message, with the count and who on hover. Pressing
 * one I gave takes it off. A reaction tells nobody.
 */
function Reactions({ message, readOnly, change }: { message: ChatMessage; readOnly: boolean; change: Change }) {
  const [picking, setPicking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function toggle(reaction: Reaction, on: boolean) {
    if (busy) return
    setBusy(true)
    await change(() => reactToChatMessage({ commentId: message.id, reaction, on }))
    setBusy(false)
  }

  if (readOnly && message.reactions.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      {message.reactions.map((given) => {
        const look = REACTION_LOOK[given.reaction]
        const who = namesLine(given.people)
        return (
          <Tooltip key={given.reaction}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={given.mine ? "secondary" : "outline"}
                size="xs"
                aria-pressed={given.mine}
                aria-label={`${look.label}: ${who}`}
                disabled={readOnly}
                onClick={() => void toggle(given.reaction, !given.mine)}
              >
                <span aria-hidden>{look.emoji}</span>
                {given.people.length}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{who}</TooltipContent>
          </Tooltip>
        )
      })}
      {readOnly ? null : (
        <Popover open={picking} onOpenChange={setPicking}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Add a reaction">
                  <SmilePlusIcon />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Add a reaction</TooltipContent>
          </Tooltip>
          <PopoverContent align="start" className="flex w-auto gap-1 p-1">
            {REACTIONS.map((reaction) => {
              const mine = message.reactions.some((given) => given.reaction === reaction && given.mine)
              return (
                <Button
                  key={reaction}
                  type="button"
                  variant={mine ? "secondary" : "ghost"}
                  size="icon"
                  aria-label={REACTION_LOOK[reaction].label}
                  aria-pressed={mine}
                  onClick={() => {
                    setPicking(false)
                    void toggle(reaction, !mine)
                  }}
                >
                  <span aria-hidden className="text-base">
                    {REACTION_LOOK[reaction].emoji}
                  </span>
                </Button>
              )
            })}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
