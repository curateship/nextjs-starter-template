import * as React from "react"
import { FlagIcon, MoreVerticalIcon, SmilePlusIcon, Trash2Icon } from "lucide-react"

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
import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { reportMessage, sendRoomMessage } from "@/lib/api/pomodoro/rooms"
import {
  ROOM_REACTION_EMOJIS,
  roomReactionLabel,
} from "@/lib/pomodoro/room-reactions"
import type { RoomSnapshotClient } from "@/components/pomodoro/rooms-page"

type RoomMember = RoomSnapshotClient["members"][number]
type RoomMessage = RoomSnapshotClient["messages"][number]

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
    <section className="flex flex-col gap-3" aria-label="People in the room">
      <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        In the room
      </h3>
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-2 text-sm">
            <InitialsAvatar name={member.name} className="size-7" />
            <span className="truncate">{member.name}</span>
            {member.role === "host" ? (
              <b className="rounded-full border border-primary/60 px-2 py-px font-mono text-[9px] font-bold text-[var(--p-accent-2)]">
                HOST
              </b>
            ) : null}
            {isHost && member.role !== "host" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
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
    </section>
  )
}

export function RoomChatPanel({
  slug,
  messages,
  isHost,
  busy,
  onDeleteMessage,
  onToggleReaction,
  reactionPending,
  onError,
  onNotice,
}: {
  slug: string
  messages: RoomMessage[]
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

  // Follow the conversation down as it grows, the way the old app did. Only
  // the chat's own scroller moves: scrollIntoView would drag the whole page
  // down with it every time a message arrived.
  React.useEffect(() => {
    const viewport = listRef.current?.closest<HTMLElement>(
      "[data-radix-scroll-area-viewport]"
    )
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [lastMessageId])

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft("")
    setSending(true)
    try {
      await sendRoomMessage(slug, body)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      onError(
        text.includes("RATE_LIMITED")
          ? "You're sending messages a little fast. Wait a moment and try again."
          : "The message could not be sent."
      )
      setDraft(body)
    } finally {
      setSending(false)
    }
  }

  return (
    <section
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border"
      aria-label="Room chat"
    >
      <ScrollArea className="max-h-[260px] flex-1">
        <div ref={listRef} className="flex flex-col gap-3 p-4">
          {messages.map((entry) =>
            entry.deleted ? (
              <p
                key={entry.id}
                className="text-xs italic text-muted-foreground"
              >
                Message removed by the host
              </p>
            ) : (
              <div key={entry.id} className="group/message flex gap-2">
                <InitialsAvatar name={entry.authorName} className="size-7" />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {entry.authorName}
                    </span>
                    <time dateTime={new Date(entry.createdAt).toISOString()}>
                      {new Date(entry.createdAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </p>
                  <span className="text-sm break-words">{entry.body}</span>
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
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground disabled:opacity-50",
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
            )
          )}
          {!messages.length ? (
            <p className="text-xs text-muted-foreground">
              Say hi — messages appear for everyone in the room.
            </p>
          ) : null}
        </div>
      </ScrollArea>
      <form
        className="flex items-center gap-2 border-t p-2"
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
          placeholder="Send encouragement…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" disabled={sending || !draft.trim()}>
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
    </section>
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
