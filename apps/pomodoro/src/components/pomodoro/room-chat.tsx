import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowDownIcon,
  FlagIcon,
  MoreVerticalIcon,
  SmilePlusIcon,
  Trash2Icon,
} from "lucide-react"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { usePrefersReducedMotion } from "@/lib/pomodoro/use-reduced-motion"
import { formatClockIn } from "@/lib/format/calendar-day"
import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { reportMessage, sendRoomMessage } from "@/lib/api/pomodoro/rooms"
import { CHAT_PAUSED, roomRefusalSentence } from "@/lib/pomodoro/room-join"
import {
  ROOM_REACTION_EMOJIS,
  roomReactionLabel,
} from "@/lib/pomodoro/room-reactions"
import type { RoomSnapshotClient } from "@/components/pomodoro/active-room"

type RoomMember = RoomSnapshotClient["members"][number]
type RoomMessage = RoomSnapshotClient["messages"][number]

/**
 * How tall the two scrolling boxes in the room panel are allowed to get.
 *
 * A member row is 28px with an 8px gap, so the phone cap is six people and the
 * desktop cap is ten. Everybody after that is one flick away, which is the
 * point: the list of names is not what you joined the room for.
 *
 * The chat holds about five messages, a one-line message being 62px with its
 * 16px gap, and the rest scroll inside it. Tyler, 8 Oct 2026: "Cap the chatbox
 * at a certain height (about 5 messages)".
 */
const MEMBER_LIST_HEIGHT = "max-h-[13rem] md:max-h-[22rem]"

/** The small spaced capitals over Chat and In the room. */
const EYEBROW =
  "font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/75"
const CHAT_HEIGHT = "max-h-[19rem]"

/** Within this many pixels of the bottom counts as reading the newest line. */
const NEAR_BOTTOM_PX = 48

/**
 * The room's chat and the host's moderation, ported from the old app: the
 * member column on the left with the host's menu, the message list on the
 * right with reaction chips, and the composer under it.
 *
 * No action draws its result locally first. The server commits, notifies the
 * room's channel, and the SSE snapshot redraws the list for everyone at the
 * same moment. A message that fails to send goes back into the box so
 * nobody loses what they typed.
 */

export function RoomMemberList({
  members,
  isHost,
  busy,
  onRemove,
  onBan,
}: {
  members: RoomMember[]
  isHost: boolean
  busy: boolean
  onRemove: (member: RoomMember) => void
  onBan: (member: RoomMember) => void
}) {
  return (
    // The right-hand column beside the chat, and under it on a phone, where
    // the conversation is what the room is for.
    <section className="flex min-w-0 flex-col gap-3" aria-label="People in the room">
      <h3 className={EYEBROW}>In the room · {members.length}</h3>
      <ScrollArea className={MEMBER_LIST_HEIGHT}>
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 text-[15px]">
              {/* The green dot says the person is in the room now: a member
                  who leaves drops off the list. */}
              <span className="relative shrink-0">
                <InitialsAvatar name={member.name} className="size-9" />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[var(--p-surface)] bg-[var(--p-success)]"
                />
              </span>
              {/* The task is there only for somebody who chose to share it,
                  and only while their own focus is running. */}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{member.name}</span>
                {member.task ? (
                  <span
                    className="truncate text-xs text-muted-foreground"
                    title={member.task}
                  >
                    <span className="sr-only">Working on </span>
                    {member.task}
                  </span>
                ) : null}
              </span>
              {member.role === "host" ? (
                <b className="shrink-0 font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--p-accent)]">
                  HOST
                </b>
              ) : member.staff ? (
                <StaffLabel />
              ) : member.mine ? (
                <span className="shrink-0 font-mono text-[11px] tracking-[0.1em] text-muted-foreground">
                  YOU
                </span>
              ) : null}
              {isHost && member.role !== "host" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Moderate ${member.name}`}
                    >
                      <MoreVerticalIcon aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onRemove(member)}>
                      Remove from room
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onBan(member)}
                    >
                      Ban from room
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </section>
  )
}

export function RoomChatPanel({
  slug,
  messages,
  timezone,
  isHost,
  busy,
  onDeleteMessage,
  onToggleReaction,
  reactionPending,
  onError,
  onNotice,
  aside,
  pinned,
  chatPaused,
}: {
  /** The column beside the chat: the people in the room. */
  aside?: React.ReactNode
  slug: string
  messages: RoomMessage[]
  /** The team's lines to every live room, pinned above the chat. */
  pinned: RoomSnapshotClient["pinned"]
  /** The admin's "Pause all chat" switch. */
  chatPaused: boolean
  /** The viewer's account timezone, which the message times are in. */
  timezone: string
  isHost: boolean
  busy: boolean
  onDeleteMessage: (message: RoomMessage) => void
  onToggleReaction: (messageId: string, emoji: string) => void
  reactionPending: ReadonlySet<string>
  onError: (message: string) => void
  onNotice: (message: string) => void
}) {
  const [draft, setDraft] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [reporting, setReporting] = React.useState<{
    id: string
    authorName: string
  } | null>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const lastMessageId = messages.at(-1)?.id
  const reducedMotion = usePrefersReducedMotion()
  // Whether the reader was at the newest line before the latest message
  // arrived. Kept up to date by scrolling, so it is read before the new line
  // made the list taller.
  const atBottom = React.useRef(true)
  // Set by sending, so your own message always comes into view.
  const followNext = React.useRef(false)
  const [newBelow, setNewBelow] = React.useState(false)

  const viewport = React.useCallback(
    () =>
      listRef.current?.closest<HTMLElement>(
        "[data-radix-scroll-area-viewport]"
      ) ?? null,
    []
  )

  const scrollToBottom = React.useCallback(
    (smooth: boolean) => {
      const box = viewport()
      if (!box) return
      box.scrollTo({
        top: box.scrollHeight,
        behavior: smooth && !reducedMotion ? "smooth" : "auto",
      })
      atBottom.current = true
      setNewBelow(false)
    },
    [reducedMotion, viewport]
  )

  React.useEffect(() => {
    const box = viewport()
    if (!box) return
    const onScroll = () => {
      atBottom.current =
        box.scrollHeight - box.scrollTop - box.clientHeight <= NEAR_BOTTOM_PX
      if (atBottom.current) setNewBelow(false)
    }
    box.addEventListener("scroll", onScroll, { passive: true })
    return () => box.removeEventListener("scroll", onScroll)
  }, [viewport])

  // Follow the conversation down as it grows, but only for a reader who was
  // already at the bottom. Somebody who scrolled up to reread a line stays
  // there and gets a "New messages" button instead of being pulled away. Only
  // the chat's own scroller moves: scrollIntoView would drag the whole page
  // down with it every time a message arrived.
  React.useEffect(() => {
    if (!lastMessageId) return
    if (atBottom.current || followNext.current) {
      followNext.current = false
      scrollToBottom(false)
    } else {
      setNewBelow(true)
    }
  }, [lastMessageId, scrollToBottom])

  const send = async () => {
    const body = draft.trim()
    // Send is never greyed out, so an empty press says why nothing went.
    if (!body) {
      onError("Type a message first.")
      return
    }
    if (chatPaused) {
      onError(CHAT_PAUSED)
      return
    }
    setDraft("")
    setSending(true)
    followNext.current = true
    try {
      const { held } = await sendRoomMessage(slug, body)
      if (held)
        onNotice("Your message is waiting for a check. Only you can see it until then.")
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      onError(
        roomRefusalSentence(cause) ??
        (text.includes("RATE_LIMITED")
          ? "You're sending messages a little fast. Wait a moment and try again."
          : "The message could not be sent.")
      )
      setDraft(body)
      followNext.current = false
    } finally {
      setSending(false)
    }
  }

  return (
    // The chat on the left and the people on the right, with the message box
    // under both across the card's full width, as Tyler's design of
    // 8 Oct 2026 draws it.
    <div className="flex flex-col">
    <div className="grid gap-6 px-6 py-5 md:grid-cols-[minmax(0,1fr)_260px] md:gap-10">
    <section className="flex min-w-0 flex-col gap-3" aria-label="Room chat">
      <h3 className={EYEBROW}>Chat</h3>
      {pinned.map((line) => (
        <p
          key={line.id}
          className="flex flex-wrap items-baseline gap-x-2 rounded-md border px-3 py-2 text-sm"
        >
          <span className="font-semibold">Pomoder</span>
          <StaffLabel />
          <span className="basis-full break-words">{line.body}</span>
        </p>
      ))}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ScrollArea className={cn("flex-1", CHAT_HEIGHT)}>
          <div ref={listRef} className="flex flex-col gap-4 py-1">
            {/* No day lines between messages: Tyler, 8 Oct 2026, "remove
                the date". Each message keeps its time. */}
            {messages.map((entry) => {
              return (
                <React.Fragment key={entry.id}>
                  {entry.deleted ? (
                    <p className="pl-12 text-sm italic text-muted-foreground">
                      {entry.removedBy === "admin" ? "Message removed" : "Message removed by the host"}
                    </p>
                  ) : (
                    <div className="group/message flex gap-3">
                      <InitialsAvatar name={entry.authorName} className="size-9" />
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="flex items-baseline gap-2 font-mono text-xs text-muted-foreground">
                          {/* A name links to its profile only when that profile
                              actually reads; otherwise it stays plain text. */}
                          {entry.handle ? (
                            <Link
                              to="/u/$handle"
                              params={{ handle: entry.handle }}
                              className="font-sans text-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {entry.authorName}
                            </Link>
                          ) : (
                            <span className="font-sans text-sm font-semibold text-foreground">
                              {entry.authorName}
                            </span>
                          )}
                          {entry.staff ? <StaffLabel /> : null}
                          <time dateTime={new Date(entry.createdAt).toISOString()}>
                            {formatClockIn(timezone, entry.createdAt)}
                          </time>
                          {entry.held ? (
                            <span className="font-sans">Only you can see this until it is checked</span>
                          ) : null}
                        </p>
                        <span className="text-[15px] break-words">{entry.body}</span>
                        {entry.reactions.length ? (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {entry.reactions.map((reaction) => (
                              <button
                                key={reaction.emoji}
                                type="button"
                                aria-pressed={reaction.mine}
                                aria-label={`${roomReactionLabel(reaction.emoji)}, ${reaction.count} ${reaction.count === 1 ? "reaction" : "reactions"}${reaction.mine ? ", including you. Press to remove your reaction" : ". Press to react"}`}
                                disabled={reactionPending.has(
                                  `${entry.id}:${reaction.emoji}`
                                )}
                                onClick={() =>
                                  onToggleReaction(entry.id, reaction.emoji)
                                }
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-muted-foreground disabled:opacity-50",
                                  reaction.mine &&
                                    "border-primary/45 bg-primary/10 text-[var(--p-accent-2)]"
                                )}
                              >
                                <span aria-hidden="true" className="text-[13px]">
                                  {reaction.emoji}
                                </span>
                                <b className="font-mono text-[11px] tabular-nums">
                                  {reaction.count}
                                </b>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {/* The actions appear on hover, and stay put on a touch
                          screen, which has no hover to reveal them with. */}
                      <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 focus-within:opacity-100 group-hover/message:opacity-100 has-[[data-state=open]]:opacity-100 max-md:opacity-100">
                        <ReactionPicker
                          messageId={entry.id}
                          activeEmojis={
                            new Set(
                              entry.reactions
                                .filter((reaction) => reaction.mine)
                                .map((reaction) => reaction.emoji)
                            )
                          }
                          reactionPending={reactionPending}
                          disabled={busy}
                          onToggle={(emoji) => onToggleReaction(entry.id, emoji)}
                        />
                        {!entry.mine ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            aria-label={`Report message from ${entry.authorName}`}
                            onClick={() =>
                              setReporting({
                                id: entry.id,
                                authorName: entry.authorName,
                              })
                            }
                          >
                            <FlagIcon aria-hidden="true" />
                          </Button>
                        ) : null}
                        {isHost ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            aria-label={`Delete message from ${entry.authorName}`}
                            onClick={() => onDeleteMessage(entry)}
                          >
                            <Trash2Icon aria-hidden="true" />
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  )}
                </React.Fragment>
              )
            })}
            {!messages.length ? (
              <p className="text-sm text-muted-foreground">
                Say hi — messages appear for everyone in the room.
              </p>
            ) : null}
          </div>
        </ScrollArea>
        {newBelow ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background shadow-sm"
            onClick={() => scrollToBottom(true)}
          >
            <ArrowDownIcon aria-hidden="true" />
            New messages
          </Button>
        ) : null}
      </div>
    </section>
    {aside}
    </div>
      <form
        className="flex items-center gap-2 border-t py-3 pl-3 pr-3"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <Label htmlFor="room-chat-message" className="sr-only">
          Room message
        </Label>
        <Input
          id="room-chat-message"
          value={draft}
          maxLength={500}
          autoComplete="off"
          placeholder={chatPaused ? CHAT_PAUSED : "Send encouragement…"}
          onChange={(event) => setDraft(event.target.value)}
          className="border-transparent bg-transparent shadow-none dark:bg-transparent"
        />
        <Button type="submit" className="rounded-full px-5" disabled={sending}>
          Send
        </Button>
      </form>
      <ReportMessageDialog
        key={reporting?.id ?? "closed"}
        slug={slug}
        message={reporting}
        onClose={() => setReporting(null)}
        onDone={(notice) => {
          setReporting(null)
          onNotice(notice)
        }}
      />
    </div>
  )
}

// The five fixed emoji, revealed on demand from one "add reaction" button so
// the chat stays calm by default. Picking an emoji toggles it and closes the
// palette; a marked emoji is one you have already reacted with.
function ReactionPicker({
  messageId,
  activeEmojis,
  reactionPending,
  onToggle,
  disabled,
}: {
  messageId: string
  activeEmojis: ReadonlySet<string>
  reactionPending: ReadonlySet<string>
  onToggle: (emoji: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label="Add reaction"
        >
          <SmilePlusIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="flex w-auto min-w-0 flex-row gap-1 p-1.5"
        role="group"
        aria-label="React with an emoji"
      >
        {ROOM_REACTION_EMOJIS.map((emoji) => {
          const active = activeEmojis.has(emoji)
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={active}
              aria-label={`React with ${roomReactionLabel(emoji)}`}
              disabled={reactionPending.has(`${messageId}:${emoji}`)}
              onClick={() => {
                onToggle(emoji)
                setOpen(false)
              }}
              className={cn(
                "grid size-8 place-items-center rounded-md border border-transparent text-lg leading-none hover:bg-accent disabled:opacity-50",
                active && "border-primary/45 bg-primary/10"
              )}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

// Reporting is private: the reporter and the operators see it, the room never
// does. A second report of the same message says so instead of adding a row.
function ReportMessageDialog({
  slug,
  message,
  onClose,
  onDone,
}: {
  slug: string
  message: { id: string; authorName: string } | null
  onClose: () => void
  onDone: (notice: string) => void
}) {
  const [reason, setReason] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState("")

  const submit = async () => {
    if (!message) return
    setError("")
    setSending(true)
    try {
      const { reported } = await reportMessage(slug, message.id, reason.trim())
      onDone(
        reported
          ? "Report sent. A moderator will review it."
          : "You already reported this message."
      )
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      setError(
        text.includes("RATE_LIMITED")
          ? "You have sent too many reports recently. Try again later."
          : "The report could not be sent. Try again."
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      open={Boolean(message)}
      onOpenChange={(next) => {
        if (!next && !sending) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Report message</DialogTitle>
          <DialogDescription>
            Tell us what is wrong with {message?.authorName}'s message. Reports
            go to moderators only — other members never see them.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="report-message-form"
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <Label htmlFor="report-reason">Reason</Label>
            <Textarea
              id="report-reason"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              aria-invalid={Boolean(error) || undefined}
              placeholder="Harassment, spam, hateful content…"
              onChange={(event) => setReason(event.target.value)}
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={sending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="report-message-form"
            disabled={sending || reason.trim().length < 3}
          >
            {sending ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * An active admin, worked out by the server from the account's role on every
 * read (admin task 05). The same look as HOST.
 */
function StaffLabel() {
  return (
    <b className="shrink-0 font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--p-accent)]">
      STAFF
    </b>
  )
}
